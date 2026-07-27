/* eslint-disable no-param-reassign */
// @ts-check

// 一次性内部维护 lambda:目前只做 DRY-RUN,不会真正写入 Bullhorn。
// 直接调用(没有 HTTP 路由),入参:
//   { rcAccountId: string, dateFrom: string (ISO), dateTo: string (ISO) }
// dateFrom/dateTo 是拿去匹配 callLogs.createdAt(UTC)的,即"这条通话记录是什么时候被写进 Bullhorn 的",
// 不是 RC 那通电话实际发生的时间。

const { Op } = /** @type {any} */ (require('sequelize'));
const { UserModel } = /** @type {any} */ (require('@app-connect/core/models/userModel'));
const { CallLogModel } = /** @type {any} */ (require('@app-connect/core/models/callLogModel'));
const { AdminConfigModel } = /** @type {any} */ (require('@app-connect/core/models/adminConfigModel'));
const { getHashValue } = /** @type {any} */ (require('@app-connect/core/lib/util'));
const { RingCentral: RawRingCentral } = /** @type {any} */ (require('@app-connect/core/lib/ringcentral'));
const RingCentral = /** @type {any} */ (RawRingCentral);
const oauth = /** @type {any} */ (require('@app-connect/core/lib/oauth'));
const connectorRegistry = /** @type {any} */ (require('@app-connect/core/connector/registry'));
const logger = /** @type {any} */ (require('@app-connect/core/lib/logger'));

// 这是个裸 lambda,不会像 src/index.ts 那样把整个 Express app 起起来,
// 所以 connectorRegistry 里不会自动注册任何 connector——这里只注册我们要用到的 bullhorn,
// 跟 src/index.ts 里 `connectorRegistry.registerConnector('bullhorn', bullhorn)` 是同一行代码。
const bullhornConnector = /** @type {any} */ (require('./connectors/bullhorn'));
connectorRegistry.registerConnector('bullhorn', bullhornConnector);

const LOG_TAG = '[backfillCallLogAiNotes][dry-run]';
// 每批并发处理的通话记录数,以及批次之间的间隔,避免同时打爆 RC / Bullhorn 的接口限流。
const BATCH_CONCURRENCY = 5;
const BATCH_DELAY_MS = 250;
// dateFrom/dateTo 是拿去过滤 callLogs.createdAt(Bullhorn 写入时间)的,
// 而 RC account call-log 的 dateFrom/dateTo 过滤的是通话实际发生的 startTime——两者可能因为同步延迟对不上,
// 所以查 RC 时前后各多留一天缓冲,避免边界上的通话记录漏查。
const RC_CALL_LOG_DATE_PADDING_MS = 24 * 60 * 60 * 1000;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 注:一开始想过用 adminConfigModel.userMappings(crmUserId -> rcExtensionId)来反查 extensionId,
// 但那张映射表只有在 admin 走过 getUserMapping 那个流程时才会被写入,很多账号可能压根没有数据,不可靠。
// 更可靠的做法是直接问 RC 要——account 级别的 call-log 接口,加 view=Detailed,
// 每条记录的 legs[] 里会带 `extension: { id, uri }`,这个 id 就是真正的 RC extensionId,
// 不需要依赖我们自己数据库里任何"猜"出来的映射关系。
// 参考:https://developers.ringcentral.com/guide/voice/call-log/details

// 在某条 RC account call-log 记录的 legs 里,找出属于"我们这条 Bullhorn 通话记录"的那个 leg 的 extensionId。
// 一次通话可能有多段 leg(转接、振铃组等),所以优先用 extensionNumber 精确匹配对应的 leg;
// 匹配不到时退而求其次,取第一个带 extension.id 的 leg,并把这次是"猜的"这件事记进 summary,方便人工核对。
function resolveOwnerExtensionIdFromLegs({ rcRecord, extensionNumber }) {
    const legs = rcRecord?.legs || [];
    if (!legs.length) {
        return { extensionId: null, matchedByExtensionNumber: false };
    }
    if (extensionNumber) {
        const exactLeg = legs.find((leg) => (
            leg.extension?.id && (
                `${leg.from?.extensionNumber}` === `${extensionNumber}` ||
                `${leg.to?.extensionNumber}` === `${extensionNumber}`
            )
        ));
        if (exactLeg) {
            return { extensionId: exactLeg.extension.id, matchedByExtensionNumber: true };
        }
    }
    const fallbackLeg = legs.find((leg) => leg.extension?.id);
    return { extensionId: fallbackLeg?.extension?.id ?? null, matchedByExtensionNumber: false };
}

// 拉整个 account 在时间范围内的通话记录(Detailed view),按 telephonySessionId 建索引,
// 后面处理每条 Bullhorn 通话记录时直接查表,不用逐条去调用 RC(避免 N 次请求)。
async function fetchRcAccountCallLogBySessionId({ rcSDK, adminAccessToken, dateFrom, dateTo }) {
    const paddedFrom = new Date(new Date(dateFrom).getTime() - RC_CALL_LOG_DATE_PADDING_MS).toISOString();
    const paddedTo = new Date(new Date(dateTo).getTime() + RC_CALL_LOG_DATE_PADDING_MS).toISOString();
    const { records } = await rcSDK.getAccountCallLogData({
        token: { access_token: adminAccessToken, token_type: 'Bearer' },
        timeFrom: paddedFrom,
        timeTo: paddedTo
    });
    const bySessionId = new Map();
    for (const record of records) {
        if (record.telephonySessionId) {
            bySessionId.set(record.telephonySessionId, record);
        }
    }
    return bySessionId;
}

// 按 hash 过的 rcAccountId 去 adminConfigModel 里查 admin token;过期就刷新并落库,
// 写法完全照抄 admin.ts 里 getAdminReport/getUserReport 的现有逻辑。
async function getValidAdminAccessToken({ rcSDK, rcAccountId }) {
    const hashedRcAccountId = getHashValue(rcAccountId, process.env.HASH_KEY);
    let adminConfig = await AdminConfigModel.findByPk(hashedRcAccountId);
    if (!adminConfig) {
        throw new Error(`No adminConfig found for rcAccountId ${rcAccountId} (hashed: ${hashedRcAccountId})`);
    }
    if (adminConfig.adminTokenExpiry < new Date()) {
        logger.info(`${LOG_TAG} admin token expired, refreshing`, { rcAccountId });
        const { access_token, refresh_token, expire_time } = await rcSDK.refreshToken({
            refresh_token: adminConfig.adminRefreshToken,
            expires_in: adminConfig.adminTokenExpiry,
            refresh_token_expires_in: adminConfig.adminTokenExpiry
        });
        await AdminConfigModel.update(
            { adminAccessToken: access_token, adminRefreshToken: refresh_token, adminTokenExpiry: expire_time },
            { where: { id: hashedRcAccountId } }
        );
        adminConfig = await AdminConfigModel.findByPk(hashedRcAccountId);
    }
    return adminConfig;
}

// 只读校验:这里不会写任何业务数据。
// 唯一可能发生的"写"是 Bullhorn session 快过期时自动刷新 accessToken/bhRestToken 并存回 UserModel,
// 这跟线上 updateCallLog 真正写入前做的事情完全一样,只是维持登录态、不涉及通话记录内容本身。
async function verifyBullhornSession({ bullhornUser }) {
    try {
        const platformModule = connectorRegistry.getConnector('bullhorn');
        const oauthApp = oauth.getOAuthApp(
            await platformModule.getOauthInfo({ tokenUrl: bullhornUser.platformAdditionalInfo?.tokenUrl })
        );
        const refreshedUser = await oauth.checkAndRefreshAccessToken(oauthApp, bullhornUser);
        if (!refreshedUser) {
            return { sessionValid: false, user: null };
        }
        return { sessionValid: true, user: refreshedUser };
    } catch (error) {
        logger.warn(`${LOG_TAG} failed to verify Bullhorn session`, { stack: error.stack, bullhornUserId: bullhornUser.id });
        return { sessionValid: false, user: null };
    }
}

// 调用 RC 的 AI notes 接口,按 telephonySessionId 查询。
// 用 admin token 而不是某个具体用户的 token(跟 getUserReport 里查 call-log 数据用的是同一个 admin token 一致)。
// 404 视为"这通电话没有 AI notes"这一正常情况,不当错误抛出;其他状态码才当异常处理。
async function fetchRcAiNotes({ rcSDK, ownerExtensionId, telephonySessionId, adminAccessToken }) {
    try {
        const response = await rcSDK.request({
            method: 'GET',
            path: `/ai/copilot/v1/accounts/~/extensions/${ownerExtensionId}/ai-notes/${telephonySessionId}`
        }, { access_token: adminAccessToken, token_type: 'Bearer' });
        return { found: true, data: await response.json() };
    } catch (error) {
        if (error.response?.status === 404) {
            return { found: false, data: null };
        }
        throw error;
    }
}

// 处理单条通话记录,只做数据收集/预览,不调用任何 Bullhorn 写接口(不调 updateCallLog)。
// 目前还没解析 RC ai-notes 返回体里具体哪个字段是 note 文本、哪个是 transcript 文本——
// 这部分先原样把整个返回 JSON 记下来(rcAiNotesRaw),等确认字段结构后再补上
// "组装成最终 Bullhorn note 内容并跟现有内容 diff"的逻辑,现在还不能保证写入内容是对的。
async function processCallLog({ callLog, rcRecordsBySessionId, rcSDK, adminAccessToken, verifiedUsersById }) {
    const summary = {
        telephonySessionId: callLog.id, // CallLogModel.id 就是 RC 的 telephonySessionId
        bullhornLogId: callLog.thirdPartyLogId,
        bullhornUserId: callLog.userId,
        ownerExtensionId: null,
        ownerExtensionIdIsGuess: null, // true = 没能用 extensionNumber 精确匹配到 leg,是退而求其次猜的,需要人工核对
        alreadyHasAiNoteMarker: null,
        alreadyHasTranscriptMarker: null,
        rcAiNotesFound: false,
        rcAiNotesRaw: null,
        skippedReason: null
    };
    try {
        const bullhornUser = verifiedUsersById.get(callLog.userId);
        if (!bullhornUser) {
            summary.skippedReason = 'Bullhorn session invalid/expired for this user';
            return summary;
        }

        const rcRecord = rcRecordsBySessionId.get(callLog.id);
        if (!rcRecord) {
            summary.skippedReason = 'telephonySessionId not found in RC account call-log for this (padded) date range';
            return summary;
        }
        const { extensionId: ownerExtensionId, matchedByExtensionNumber } = resolveOwnerExtensionIdFromLegs({
            rcRecord,
            extensionNumber: callLog.extensionNumber
        });
        summary.ownerExtensionId = ownerExtensionId;
        summary.ownerExtensionIdIsGuess = !!ownerExtensionId && !matchedByExtensionNumber;
        if (!ownerExtensionId) {
            summary.skippedReason = 'No leg with an extension.id found on the matching RC call-log record';
            return summary;
        }

        const aiNotesResult = await fetchRcAiNotes({
            rcSDK,
            ownerExtensionId,
            telephonySessionId: callLog.id,
            adminAccessToken
        });
        summary.rcAiNotesFound = aiNotesResult.found;
        summary.rcAiNotesRaw = aiNotesResult.data;
        if (!aiNotesResult.found) {
            summary.skippedReason = 'RC has no AI notes for this telephonySessionId';
            return summary;
        }

        // 只读拉取 Bullhorn 现有 note 内容(不会修改),用来判断是不是已经补过数据了。
        // Bullhorn 的 note 正文格式固定是 HTML(getLogFormatType 恒返回 HTML),
        // 所以这里直接用生产代码 upsertAiNote/upsertTranscript 用的同一套 HTML marker 正则来判断。
        const platformModule = connectorRegistry.getConnector('bullhorn');
        const existing = await platformModule.getCallLog({ user: bullhornUser, callLogId: callLog.thirdPartyLogId });
        const existingBody = existing?.callLogInfo?.fullBody ?? '';
        summary.alreadyHasAiNoteMarker = /<b>AI Note<\/b>/i.test(existingBody);
        summary.alreadyHasTranscriptMarker = /<b>Transcript<\/b>/i.test(existingBody);

        return summary;
    } catch (error) {
        summary.skippedReason = `Error: ${error.message}`;
        logger.error(`${LOG_TAG} error processing call log`, { stack: error.stack, telephonySessionId: callLog.id });
        return summary;
    }
}

async function backfillCallLogAiNotesDryRun(input) {
    const { rcAccountId, dateFrom, dateTo } = input || {};
    if (!rcAccountId || !dateFrom || !dateTo) {
        throw new Error('rcAccountId, dateFrom, dateTo are required');
    }
    if (!process.env.RINGCENTRAL_SERVER || !process.env.RINGCENTRAL_CLIENT_ID || !process.env.RINGCENTRAL_CLIENT_SECRET) {
        throw new Error('Missing RINGCENTRAL_SERVER/RINGCENTRAL_CLIENT_ID/RINGCENTRAL_CLIENT_SECRET env vars');
    }

    logger.info(`${LOG_TAG} starting`, { rcAccountId, dateFrom, dateTo });

    // 第一步:按 rcAccountId 找出这个账号下所有的 Bullhorn 用户。
    const bullhornUsers = await UserModel.findAll({ where: { rcAccountId, platform: 'bullhorn' } });
    if (!bullhornUsers.length) {
        logger.info(`${LOG_TAG} no Bullhorn users found for this rcAccountId`, { rcAccountId });
        return { summaries: [], wouldPatchCount: 0 };
    }
    const bullhornUserIds = bullhornUsers.map((u) => u.id);

    // 第二步:按这些用户 + 时间范围(createdAt)找出候选通话记录。
    const callLogs = await CallLogModel.findAll({
        where: {
            userId: { [Op.in]: bullhornUserIds },
            platform: 'bullhorn',
            createdAt: { [Op.between]: [new Date(dateFrom), new Date(dateTo)] }
        }
    });
    logger.info(`${LOG_TAG} found candidate call logs`, { count: callLogs.length });
    if (!callLogs.length) {
        return { summaries: [], wouldPatchCount: 0 };
    }

    // 第三步:拿 admin token(必要时刷新)。
    const rcSDK = new RingCentral({
        server: process.env.RINGCENTRAL_SERVER,
        clientId: process.env.RINGCENTRAL_CLIENT_ID,
        clientSecret: process.env.RINGCENTRAL_CLIENT_SECRET,
        redirectUri: `${process.env.APP_SERVER}/ringcentral/oauth/callback`
    });
    const adminConfig = await getValidAdminAccessToken({ rcSDK, rcAccountId });
    const adminAccessToken = adminConfig.adminAccessToken;

    // 第三点五步:拉 RC account 级别的通话记录(Detailed view),按 telephonySessionId 建好索引,
    // 用来把每条 Bullhorn 通话记录反查出真正的 RC extensionId(见 resolveOwnerExtensionIdFromLegs 的注释)。
    const rcRecordsBySessionId = await fetchRcAccountCallLogBySessionId({ rcSDK, adminAccessToken, dateFrom, dateTo });
    logger.info(`${LOG_TAG} fetched RC account call-log records`, { count: rcRecordsBySessionId.size });

    // 提前对每个涉及到的 Bullhorn 用户校验一次 session 是否可用/刷新,
    // 而不是等到处理每条通话记录时才发现某个用户登录失效——避免同一个失效用户被反复重试刷新。
    const verifiedUsersById = new Map();
    for (const user of bullhornUsers) {
        const { sessionValid, user: refreshedUser } = await verifyBullhornSession({ bullhornUser: user });
        if (sessionValid) {
            verifiedUsersById.set(user.id, refreshedUser);
        } else {
            logger.warn(`${LOG_TAG} Bullhorn session invalid/expired, its call logs will be skipped`, { bullhornUserId: user.id });
        }
    }

    // 第四步:分批(有限并发)处理每条通话记录,调 RC ai-notes + 只读查 Bullhorn 现有 note。
    const summaries = [];
    for (let i = 0; i < callLogs.length; i += BATCH_CONCURRENCY) {
        const batch = callLogs.slice(i, i + BATCH_CONCURRENCY);
        const batchResults = await Promise.allSettled(
            batch.map((callLog) => processCallLog({ callLog, rcRecordsBySessionId, rcSDK, adminAccessToken, verifiedUsersById }))
        );
        for (const result of batchResults) {
            if (result.status === 'fulfilled') {
                summaries.push(result.value);
            } else {
                // Promise.allSettled 理论上不会到这个分支(processCallLog 内部已经 try/catch 兜底了),留着做防御性兜底。
                logger.error(`${LOG_TAG} unexpected failure processing a call log`, { stack: result.reason?.stack });
            }
        }
        if (i + BATCH_CONCURRENCY < callLogs.length) {
            await delay(BATCH_DELAY_MS);
        }
    }

    const wouldPatchCount = summaries.filter((s) => s.rcAiNotesFound && !s.skippedReason).length;
    // 提醒有多少条是靠 fallback 猜出来的 extensionId,这些在人工核对时要多留意。
    const guessedExtensionCount = summaries.filter((s) => s.ownerExtensionIdIsGuess).length;
    logger.info(`${LOG_TAG} finished`, {
        totalCandidates: summaries.length,
        wouldPatchCount,
        skippedCount: summaries.length - wouldPatchCount,
        guessedExtensionCount
    });

    return { summaries, wouldPatchCount };
}

exports.app = backfillCallLogAiNotesDryRun;

export {};
