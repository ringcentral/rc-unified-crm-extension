/* eslint-disable no-param-reassign */
// @ts-check

// 一次性内部维护 lambda:
// - mode=dry-run: 只计算并返回 patch 预览;
// - mode=run: 将缺失的 AI Note/Transcript 实际写入 Bullhorn。
// 直接调用(没有 HTTP 路由),入参:
//   { mode: 'dry-run' | 'run', rcAccountId: string, dateFrom: string (ISO), dateTo: string (ISO), ratePerMinute: number }
// dateFrom/dateTo 是拿去匹配 callLogs.createdAt(UTC)的,即"这条通话记录是什么时候被写进 Bullhorn 的",
// 不是 RC 那通电话实际发生的时间。

const { Op } = /** @type {any} */ (require('sequelize'));
const { UserModel } = /** @type {any} */ (require('@app-connect/core/models/userModel'));
const { CallLogModel } = /** @type {any} */ (require('@app-connect/core/models/callLogModel'));
const { AdminConfigModel } = /** @type {any} */ (require('@app-connect/core/models/adminConfigModel'));
const { CacheModel } = /** @type {any} */ (require('@app-connect/core/models/cacheModel'));
const { getHashValue } = /** @type {any} */ (require('@app-connect/core/lib/util'));
const { RingCentral: RawRingCentral } = /** @type {any} */ (require('@app-connect/core/lib/ringcentral'));
const RingCentral = /** @type {any} */ (RawRingCentral);
const oauth = /** @type {any} */ (require('@app-connect/core/lib/oauth'));
const connectorRegistry = /** @type {any} */ (require('@app-connect/core/connector/registry'));
const logger = /** @type {any} */ (require('@app-connect/core/lib/logger'));
const { upsertAiNote, upsertTranscript } = /** @type {any} */ (require('@app-connect/core/lib/callLogComposer'));
const { LOG_DETAILS_FORMAT_TYPE } = /** @type {any} */ (require('@app-connect/core/lib/constants'));

// 这是个裸 lambda,不会像 src/index.ts 那样把整个 Express app 起起来,
// 所以 connectorRegistry 里不会自动注册任何 connector——这里只注册我们要用到的 bullhorn,
// 跟 src/index.ts 里 `connectorRegistry.registerConnector('bullhorn', bullhorn)` 是同一行代码。
const bullhornConnector = /** @type {any} */ (require('./connectors/bullhorn'));
connectorRegistry.registerConnector('bullhorn', bullhornConnector);

const LOG_TAG = '[backfillCallLogAiNotes]';
// Keep bounded concurrency for in-flight work. ratePerMinute below spaces out
// the request-producing portion of each call-log task.
const BATCH_CONCURRENCY = 5;
const ONE_MINUTE_MS = 60 * 1000;
// Refresh before the token actually expires so a long paginated request does not start
// with a token that is only seconds away from becoming invalid.
const ADMIN_TOKEN_RENEW_HANDICAP_MS = 60 * 1000;
// dateFrom/dateTo 是拿去过滤 callLogs.createdAt(Bullhorn 写入时间)的,
// 而 RC account call-log 的 dateFrom/dateTo 过滤的是通话实际发生的 startTime——两者可能因为同步延迟对不上,
// 所以查 RC 时前后各多留一天缓冲,避免边界上的通话记录漏查。
const RC_CALL_LOG_DATE_PADDING_MS = 24 * 60 * 60 * 1000;
const BACKFILL_JOB_CACHE_KEY_PREFIX = 'maintenance-backfill-call-log-ai-notes';
const BACKFILL_JOB_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;
const BACKFILL_JOB_STALE_PROCESSING_MS = 5 * 60 * 1000;
const DEFAULT_JOB_BATCH_SIZE = 12;
const MAX_JOB_BATCH_SIZE = 12;
const MAX_RECORDED_JOB_ERRORS = 100;
const AI_REQUEST_MAX_ATTEMPTS = 3;
const AI_REQUEST_RETRY_BASE_MS = 5 * 1000;

/**
 * Creates an evenly spaced rate limiter. Reservations are made synchronously,
 * so concurrent callers are still assigned distinct start times.
 *
 * @param {number} ratePerMinute
 * @returns {() => Promise<void>}
 */
function createPerMinuteRateLimiter(ratePerMinute: number, initialNextStartTime = 0) {
    if (!Number.isFinite(ratePerMinute) || ratePerMinute <= 0) {
        throw new Error('ratePerMinute must be a positive number');
    }

    const intervalMs = ONE_MINUTE_MS / ratePerMinute;
    let nextStartTime = Number.isFinite(initialNextStartTime) ? initialNextStartTime : 0;

    const waitForRateLimit = async function waitForRateLimit() {
        const currentTime = Date.now();
        const scheduledTime = Math.max(currentTime, nextStartTime);
        nextStartTime = scheduledTime + intervalMs;
        const waitMs = scheduledTime - currentTime;
        if (waitMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, waitMs));
        }
    };
    const rateLimiterWithState: any = waitForRateLimit;
    rateLimiterWithState.getNextStartTime = () => nextStartTime;
    return rateLimiterWithState;
}

const replaceAllText = (value, search, replacement) => value.split(search).join(replacement);

// Keep the same AI Notes transformations used by crm-server-side-logging so a
// maintenance patch produces the same Bullhorn text as the normal logging flow.
function getAiNoteText(htmlData = '') {
    let noteHTMLString = htmlData;
    noteHTMLString = replaceAllText(replaceAllText(noteHTMLString, '<strong>', '**'), '</strong>', '**');
    if (!noteHTMLString.includes('</p>\n')) noteHTMLString = replaceAllText(noteHTMLString, '</p>', '</p>\n');
    if (!noteHTMLString.includes('</li>\n')) noteHTMLString = replaceAllText(noteHTMLString, '</li>', '</li>\n');
    if (!noteHTMLString.includes('<ul>\n')) noteHTMLString = replaceAllText(noteHTMLString, '<ul>', '<ul>\n');
    if (!noteHTMLString.includes('</ul>\n')) noteHTMLString = replaceAllText(noteHTMLString, '</ul>', '</ul>\n');
    if (!noteHTMLString.includes('<ol>\n')) noteHTMLString = replaceAllText(noteHTMLString, '<ol>', '<ol>\n');
    if (!noteHTMLString.includes('</ol>\n')) noteHTMLString = replaceAllText(noteHTMLString, '</ol>', '</ol>\n');
    return noteHTMLString.replace(/<[^>]+>/g, '').trim();
}

function getTranscriptText(transcript, call) {
    if (!transcript?.transcripts || !transcript?.context?.participants) {
        return '';
    }
    const nameMap = {};
    for (const participant of transcript.context.participants) {
        nameMap[participant.participantId] = participant.name;
        if (participant.extensionId && call?.from?.extensionId === participant.extensionId) {
            nameMap[participant.participantId] = call.from.name || call.from.phoneNumber || call.from.extensionNumber;
        } else if (participant.extensionId && call?.to?.extensionId === participant.extensionId) {
            nameMap[participant.participantId] = call.to.name || call.to.phoneNumber || call.to.extensionNumber;
        }
    }
    return transcript.transcripts
        .map((item) => `${nameMap[item.participantId] || 'Guest'}: ${item.text}`)
        .join('\n')
        .trim();
}

function buildAiPatch({ rcAiNotes, rcRecord, existingBody }) {
    const aiNote = getAiNoteText(rcAiNotes?.callNote?.content);
    const transcript = getTranscriptText(rcAiNotes?.callTranscripts, rcRecord);
    let patchedBody = existingBody;
    if (aiNote) {
        patchedBody = upsertAiNote({
            body: patchedBody,
            aiNote,
            logFormat: LOG_DETAILS_FORMAT_TYPE.HTML
        });
    }
    if (transcript) {
        patchedBody = upsertTranscript({
            body: patchedBody,
            transcript,
            logFormat: LOG_DETAILS_FORMAT_TYPE.HTML
        });
    }
    return {
        aiNote,
        transcript,
        patchedBody,
        wouldPatchAiNote: !!aiNote,
        wouldPatchTranscript: !!transcript,
        // Patch is driven only by RC data availability. Existing Bullhorn AI sections
        // are updated by the shared upsert helpers instead of suppressing the write.
        wouldPatch: !!aiNote || !!transcript
    };
}

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
async function fetchRcAccountCallLogBySessionId({ rcSDK, adminTokenManager, dateFrom, dateTo }) {
    const paddedFrom = new Date(new Date(dateFrom).getTime() - RC_CALL_LOG_DATE_PADDING_MS).toISOString();
    const paddedTo = new Date(new Date(dateTo).getTime() + RC_CALL_LOG_DATE_PADDING_MS).toISOString();
    const { records } = await adminTokenManager.withAccessToken((adminAccessToken) => (
        rcSDK.getAccountCallLogData({
            token: { access_token: adminAccessToken, token_type: 'Bearer' },
            timeFrom: paddedFrom,
            timeTo: paddedTo
        })
    ));
    const bySessionId = new Map();
    for (const record of records) {
        if (record.telephonySessionId) {
            bySessionId.set(record.telephonySessionId, record);
        }
    }
    return bySessionId;
}

// 管理整个 backfill 生命周期里的 RC admin token:
// 1. 在过期前 60 秒主动刷新;
// 2. RC 返回 401 时强制刷新并重试一次;
// 3. 并发请求同时发现 token 失效时只发起一次 refresh 请求。
async function createAdminTokenManager({ rcSDK, rcAccountId }) {
    const hashedRcAccountId = getHashValue(rcAccountId, process.env.HASH_KEY);
    const adminConfig = await AdminConfigModel.findByPk(hashedRcAccountId);
    if (!adminConfig) {
        throw new Error(`No adminConfig found for rcAccountId ${rcAccountId} (hashed: ${hashedRcAccountId})`);
    }

    let accessToken = adminConfig.adminAccessToken;
    let refreshToken = adminConfig.adminRefreshToken;
    let tokenExpiry = new Date(adminConfig.adminTokenExpiry).getTime();
    let refreshPromise = null;
    let tokenVersion = 0;
    let lastRefreshTime = 0;

    async function refreshAdminToken() {
        if (!refreshToken) {
            throw new Error(`No RC admin refresh token found for rcAccountId ${rcAccountId}`);
        }
        if (!refreshPromise) {
            refreshPromise = (async () => {
                logger.info(`${LOG_TAG} refreshing RC admin token`, { rcAccountId });
                // refreshToken() expects TTL durations when supplied. adminTokenExpiry is an
                // absolute timestamp, so only send the refresh token and let RC use app defaults.
                const refreshedToken = await rcSDK.refreshToken({ refresh_token: refreshToken });
                if (!refreshedToken.access_token || !refreshedToken.expire_time) {
                    throw new Error('RC admin token refresh returned an incomplete token');
                }
                accessToken = refreshedToken.access_token;
                refreshToken = refreshedToken.refresh_token || refreshToken;
                tokenExpiry = refreshedToken.expire_time;
                tokenVersion++;
                lastRefreshTime = Date.now();
                await AdminConfigModel.update(
                    {
                        adminAccessToken: accessToken,
                        adminRefreshToken: refreshToken,
                        adminTokenExpiry: tokenExpiry
                    },
                    { where: { id: hashedRcAccountId } }
                );
                return accessToken;
            })().finally(() => {
                refreshPromise = null;
            });
        }
        return refreshPromise;
    }

    async function getAccessToken({ forceRefresh = false } = {}) {
        const isMissingOrExpiring = !accessToken
            || !Number.isFinite(tokenExpiry)
            || tokenExpiry <= Date.now() + ADMIN_TOKEN_RENEW_HANDICAP_MS;
        if (forceRefresh || isMissingOrExpiring) {
            return refreshAdminToken();
        }
        return accessToken;
    }

    async function withAccessToken(operation) {
        const currentAccessToken = await getAccessToken();
        const requestTokenVersion = tokenVersion;
        try {
            return await operation(currentAccessToken);
        } catch (error) {
            if (Number(error.response?.status) !== 401) {
                throw error;
            }

            // Another concurrent request may already have rotated the token while this
            // request was in flight. Retry with that token instead of rotating it again.
            if (tokenVersion !== requestTokenVersion) {
                logger.warn(`${LOG_TAG} RC request used a stale admin token, retrying with the latest token`, {
                    rcAccountId
                });
                return operation(await getAccessToken());
            }

            // A token refreshed during this run cannot reasonably have expired within one
            // minute. A 401 here is usually an API permission/scope rejection, so refreshing
            // again would rotate a valid refresh token and can cause a refresh storm.
            if (lastRefreshTime && Date.now() - lastRefreshTime < ADMIN_TOKEN_RENEW_HANDICAP_MS) {
                logger.warn(`${LOG_TAG} freshly refreshed RC admin token was rejected; not refreshing again`, {
                    rcAccountId,
                    status: Number(error.response?.status)
                });
                throw error;
            }

            logger.warn(`${LOG_TAG} RC admin token was rejected, refreshing and retrying once`, { rcAccountId });
            const refreshedAccessToken = await getAccessToken({ forceRefresh: true });
            return operation(refreshedAccessToken);
        }
    }

    return { getAccessToken, withAccessToken };
}

// 校验 Bullhorn session;session 快过期时会自动刷新 accessToken/bhRestToken 并存回 UserModel。
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

// Patch 是账号级维护操作，不要求使用原始 CallLog.userId 对应的 Bullhorn session。
// 找到该 RC 账号下第一个可用的 Bullhorn session 后，所有 Bullhorn 读写都复用它。
async function findBullhornExecutorUser(bullhornUsers) {
    for (const bullhornUser of bullhornUsers) {
        const { sessionValid, user } = await verifyBullhornSession({ bullhornUser });
        if (sessionValid) {
            logger.info(`${LOG_TAG} selected Bullhorn executor session`, { bullhornExecutorUserId: user.id });
            return user;
        }
        logger.warn(`${LOG_TAG} Bullhorn session unavailable, trying the next account user`, {
            bullhornUserId: bullhornUser.id
        });
    }
    return null;
}

// 调用 RC 的 AI notes 接口,按 telephonySessionId 查询。
// 用 admin token 而不是某个具体用户的 token(跟 getUserReport 里查 call-log 数据用的是同一个 admin token 一致)。
// 404 视为"这通电话没有 AI notes"这一正常情况,不当错误抛出;其他状态码才当异常处理。
async function fetchRcAiNotes({ rcSDK, ownerExtensionId, telephonySessionId, adminTokenManager }) {
    try {
        const response = await adminTokenManager.withAccessToken((adminAccessToken) => (
            rcSDK.request({
                method: 'GET',
                path: `/ai/copilot/v1/accounts/~/extensions/${ownerExtensionId}/ai-notes/${telephonySessionId}`
            }, { access_token: adminAccessToken, token_type: 'Bearer' })
        ));
        const responseData = await response.json();
        const data = Array.isArray(responseData?.records)
            ? responseData.records.find((record) => record.telephonySessionId === telephonySessionId)
            : responseData;
        return { found: !!data, data: data ?? null };
    } catch (error) {
        if (error.response?.status === 404) {
            return { found: false, data: null };
        }
        throw error;
    }
}

// 处理单条通话记录:dry-run 只计算 patch;run 才调用 Bullhorn updateCallLog。
// RC callNote.content/callTranscripts 使用 server-side logging 的同一套规则转换。
// 只要 RC 有任一 AI 数据就执行 patch;Bullhorn 已有区块会通过 upsert 更新。
async function processCallLog({
    callLog,
    rcRecordsBySessionId,
    rcSDK,
    adminTokenManager,
    bullhornExecutorUser,
    mode,
    waitForRateLimit
}) {
    const summary = {
        telephonySessionId: callLog.id, // CallLogModel.id 就是 RC 的 telephonySessionId
        bullhornLogId: callLog.thirdPartyLogId,
        bullhornUserId: callLog.userId,
        bullhornExecutorUserId: bullhornExecutorUser?.id ?? null,
        ownerExtensionId: null,
        ownerExtensionIdIsGuess: null, // true = 没能用 extensionNumber 精确匹配到 leg,是退而求其次猜的,需要人工核对
        rcAiNotesFound: false,
        rcAiNotesRaw: null,
        wouldPatchAiNote: false,
        wouldPatchTranscript: false,
        wouldPatch: false,
        patched: false,
        failed: false,
        skippedReason: null
    };
    try {
        if (!bullhornExecutorUser) {
            summary.skippedReason = 'No valid Bullhorn session found for this RC account';
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

        const aiNotesResult = await fetchRcAiNotesWithRetry({
            rcSDK,
            ownerExtensionId,
            telephonySessionId: callLog.id,
            adminTokenManager,
            waitForRateLimit
        });
        summary.rcAiNotesFound = aiNotesResult.found;
        summary.rcAiNotesRaw = aiNotesResult.data;
        if (!aiNotesResult.found) {
            summary.skippedReason = 'RC has no AI notes for this telephonySessionId';
            return summary;
        }

        // GET 现有 Bullhorn comments 只是为了保留非 AI 内容并生成完整更新体，
        // 不再检查 Bullhorn 是否已有 AI Note/Transcript，也不参与是否 patch 的判断。
        const platformModule = connectorRegistry.getConnector('bullhorn');
        const existing = await platformModule.getCallLog({
            user: bullhornExecutorUser,
            callLogId: callLog.thirdPartyLogId
        });
        const existingBody = existing?.callLogInfo?.fullBody;
        if (typeof existingBody !== 'string') {
            summary.skippedReason = 'Bullhorn call log did not return a comments body';
            return summary;
        }
        const patch = buildAiPatch({
            rcAiNotes: aiNotesResult.data,
            rcRecord,
            existingBody
        });
        summary.wouldPatchAiNote = patch.wouldPatchAiNote;
        summary.wouldPatchTranscript = patch.wouldPatchTranscript;
        summary.wouldPatch = patch.wouldPatch;

        if (!patch.wouldPatch) {
            summary.skippedReason = 'RC AI notes response contains no AI note or transcript content';
            return summary;
        }

        if (mode === 'run') {
            await platformModule.updateCallLog({
                user: bullhornExecutorUser,
                existingCallLog: callLog,
                composedLogDetails: patch.patchedBody,
                existingCallLogDetails: existing?.callLogInfo?.fullLogResponse,
                isFromSSCL: false
            });
            summary.patched = true;
        }

        return summary;
    } catch (error) {
        summary.failed = true;
        summary.skippedReason = `Error: ${error.message}`;
        logger.error(`${LOG_TAG} error processing call log`, { stack: error.stack, telephonySessionId: callLog.id });
        return summary;
    }
}

async function backfillCallLogAiNotes(input) {
    const { rcAccountId, dateFrom, dateTo, ratePerMinute, mode = 'dry-run' } = input || {};
    if (!rcAccountId || !dateFrom || !dateTo || ratePerMinute === undefined) {
        throw new Error('rcAccountId, dateFrom, dateTo, ratePerMinute are required');
    }
    if (!['dry-run', 'run'].includes(mode)) {
        throw new Error('mode must be either dry-run or run');
    }
    if (!process.env.RINGCENTRAL_SERVER || !process.env.RINGCENTRAL_CLIENT_ID || !process.env.RINGCENTRAL_CLIENT_SECRET) {
        throw new Error('Missing RINGCENTRAL_SERVER/RINGCENTRAL_CLIENT_ID/RINGCENTRAL_CLIENT_SECRET env vars');
    }

    const waitForRateLimit = createPerMinuteRateLimiter(Number(ratePerMinute));
    logger.info(`${LOG_TAG} starting`, { mode, rcAccountId, dateFrom, dateTo, ratePerMinute });

    // 第一步:按 rcAccountId 找出这个账号下所有的 Bullhorn 用户。
    const bullhornUsers = await UserModel.findAll({ where: { rcAccountId, platform: 'bullhorn' } });
    if (!bullhornUsers.length) {
        logger.info(`${LOG_TAG} no Bullhorn users found for this rcAccountId`, { rcAccountId });
        return { mode, summaries: [], wouldPatchCount: 0, patchedCount: 0, failedPatchCount: 0 };
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
        return { mode, summaries: [], wouldPatchCount: 0, patchedCount: 0, failedPatchCount: 0 };
    }

    // 第三步:拿 admin token(必要时刷新)。
    const rcSDK = new RingCentral({
        server: process.env.RINGCENTRAL_SERVER,
        clientId: process.env.RINGCENTRAL_CLIENT_ID,
        clientSecret: process.env.RINGCENTRAL_CLIENT_SECRET,
        redirectUri: `${process.env.APP_SERVER}/ringcentral/oauth/callback`
    });
    const adminTokenManager = await createAdminTokenManager({ rcSDK, rcAccountId });

    // 第三点五步:拉 RC account 级别的通话记录(Detailed view),按 telephonySessionId 建好索引,
    // 用来把每条 Bullhorn 通话记录反查出真正的 RC extensionId(见 resolveOwnerExtensionIdFromLegs 的注释)。
    const rcRecordsBySessionId = await fetchRcAccountCallLogBySessionId({ rcSDK, adminTokenManager, dateFrom, dateTo });
    logger.info(`${LOG_TAG} fetched RC account call-log records`, { count: rcRecordsBySessionId.size });

    // Patch 不依赖原始 CallLog.userId 的 Bullhorn session。只要账号下有一个 session 可用，
    // 后续所有 Bullhorn get/update 操作都使用这个统一的执行 session。
    const bullhornExecutorUser = await findBullhornExecutorUser(bullhornUsers);
    if (!bullhornExecutorUser) {
        logger.warn(`${LOG_TAG} no valid Bullhorn executor session found`, { rcAccountId });
    }

    // 第四步:分批处理每条记录。dry-run 只预览;run 会写入已确认缺失的 AI 数据。
    const summaries = [];
    for (let i = 0; i < callLogs.length; i += BATCH_CONCURRENCY) {
        const batch = callLogs.slice(i, i + BATCH_CONCURRENCY);
        const batchResults = await Promise.allSettled(
            batch.map((callLog) => processCallLog({
                callLog,
                rcRecordsBySessionId,
                rcSDK,
                adminTokenManager,
                bullhornExecutorUser,
                mode,
                waitForRateLimit
            }))
        );
        for (const result of batchResults) {
            if (result.status === 'fulfilled') {
                summaries.push(result.value);
            } else {
                // Promise.allSettled 理论上不会到这个分支(processCallLog 内部已经 try/catch 兜底了),留着做防御性兜底。
                logger.error(`${LOG_TAG} unexpected failure processing a call log`, { stack: result.reason?.stack });
            }
        }
    }

    const wouldPatchCount = summaries.filter((s) => s.wouldPatch).length;
    const patchedCount = summaries.filter((s) => s.patched).length;
    const failedPatchCount = mode === 'run'
        ? summaries.filter((s) => s.wouldPatch && !s.patched).length
        : 0;
    // 提醒有多少条是靠 fallback 猜出来的 extensionId,这些在人工核对时要多留意。
    const guessedExtensionCount = summaries.filter((s) => s.ownerExtensionIdIsGuess).length;
    logger.info(`${LOG_TAG} finished`, {
        totalCandidates: summaries.length,
        wouldPatchCount,
        patchedCount,
        failedPatchCount,
        skippedCount: summaries.length - wouldPatchCount,
        guessedExtensionCount
    });

    return { mode, summaries, wouldPatchCount, patchedCount, failedPatchCount };
}

function getBackfillJobCacheId(jobId) {
    return `${BACKFILL_JOB_CACHE_KEY_PREFIX}:${jobId}`;
}

function getBackfillCandidateWhere({ bullhornUserIds, dateFrom, dateTo, cursorCreatedAt = null, cursorId = null }) {
    const where = {
        userId: { [Op.in]: bullhornUserIds },
        platform: 'bullhorn',
        createdAt: { [Op.between]: [new Date(dateFrom), new Date(dateTo)] }
    };
    if (cursorCreatedAt && cursorId) {
        const cursorDate = new Date(cursorCreatedAt);
        where[Op.and] = [{
            [Op.or]: [
                { createdAt: { [Op.gt]: cursorDate } },
                { createdAt: cursorDate, id: { [Op.gt]: cursorId } }
            ]
        }];
    }
    return where;
}

function validateJobInput(input) {
    const { rcAccountId, dateFrom, dateTo, mode = 'dry-run' } = input || {};
    if (!rcAccountId || !dateFrom || !dateTo) {
        throw new Error('rcAccountId, dateFrom and dateTo are required');
    }
    if (!['dry-run', 'run'].includes(mode)) {
        throw new Error('mode must be either dry-run or run');
    }
    if (!Number.isFinite(new Date(dateFrom).getTime()) || !Number.isFinite(new Date(dateTo).getTime())) {
        throw new Error('dateFrom and dateTo must be valid dates');
    }
    if (new Date(dateFrom).getTime() >= new Date(dateTo).getTime()) {
        throw new Error('dateFrom must be earlier than dateTo');
    }
}

function getRetryAfterMs(error, attempt) {
    const headers = error.response?.headers;
    const rawRetryAfter = typeof headers?.get === 'function'
        ? headers.get('retry-after')
        : headers?.['retry-after'];
    const retryAfterSeconds = Number(rawRetryAfter);
    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
        return Math.min(retryAfterSeconds * 1000, ONE_MINUTE_MS);
    }
    return Math.min(AI_REQUEST_RETRY_BASE_MS * (2 ** (attempt - 1)), ONE_MINUTE_MS);
}

async function fetchRcAiNotesWithRetry({
    rcSDK,
    ownerExtensionId,
    telephonySessionId,
    adminTokenManager,
    waitForRateLimit
}) {
    for (let attempt = 1; attempt <= AI_REQUEST_MAX_ATTEMPTS; attempt++) {
        await waitForRateLimit();
        try {
            return await fetchRcAiNotes({
                rcSDK,
                ownerExtensionId,
                telephonySessionId,
                adminTokenManager
            });
        } catch (error) {
            const status = Number(error.response?.status);
            const retryable = !status || status === 429 || status >= 500;
            if (!retryable || attempt === AI_REQUEST_MAX_ATTEMPTS) throw error;
            const retryAfterMs = getRetryAfterMs(error, attempt);
            logger.warn(`${LOG_TAG} transient RC AI notes request failure, retrying`, {
                telephonySessionId,
                status: status || null,
                attempt,
                retryAfterMs
            });
            await new Promise((resolve) => setTimeout(resolve, retryAfterMs));
        }
    }
    throw new Error('RC AI notes retry loop ended unexpectedly');
}

async function createBackfillJob(input) {
    validateJobInput(input);
    const {
        rcAccountId,
        dateFrom,
        dateTo,
        mode = 'dry-run',
        ratePerMinute = 12,
        batchSize = DEFAULT_JOB_BATCH_SIZE
    } = input;
    const normalizedRate = Number(ratePerMinute);
    if (!Number.isFinite(normalizedRate) || normalizedRate <= 0 || normalizedRate > 15) {
        throw new Error('ratePerMinute must be between 0 and 15');
    }
    const normalizedBatchSize = Math.min(MAX_JOB_BATCH_SIZE, Math.max(1, Math.floor(Number(batchSize)) || DEFAULT_JOB_BATCH_SIZE));
    const existingJob = await CacheModel.findOne({
        where: {
            userId: rcAccountId,
            cacheKey: { [Op.like]: `${BACKFILL_JOB_CACHE_KEY_PREFIX}:%` },
            [Op.or]: [
                { status: { [Op.in]: ['pending', 'running'] } },
                { status: { [Op.like]: 'processing:%' } }
            ]
        },
        order: [['createdAt', 'ASC']]
    });
    if (existingJob) {
        throw new Error(`Active backfill job already exists for this account: ${existingJob.data?.jobId || existingJob.id}`);
    }

    const bullhornUsers = await UserModel.findAll({ where: { rcAccountId, platform: 'bullhorn' } });
    const bullhornUserIds = bullhornUsers.map((user) => user.id);
    const total = bullhornUserIds.length
        ? await CallLogModel.count({
            where: getBackfillCandidateWhere({ bullhornUserIds, dateFrom, dateTo })
        })
        : 0;
    const jobId = require('crypto').randomUUID();
    const now = new Date();
    const data = {
        version: 1,
        jobId,
        rcAccountId,
        dateFrom: new Date(dateFrom).toISOString(),
        dateTo: new Date(dateTo).toISOString(),
        mode,
        ratePerMinute: normalizedRate,
        batchSize: normalizedBatchSize,
        cursorCreatedAt: null,
        cursorId: null,
        nextAiRequestAt: null,
        total,
        processed: 0,
        wouldPatch: 0,
        patched: 0,
        skipped: 0,
        failed: 0,
        guessedExtension: 0,
        errors: [],
        createdAt: now.toISOString(),
        completedAt: total ? null : now.toISOString()
    };
    await CacheModel.create({
        id: getBackfillJobCacheId(jobId),
        status: total ? 'pending' : 'completed',
        userId: rcAccountId,
        cacheKey: `${BACKFILL_JOB_CACHE_KEY_PREFIX}:${jobId}`,
        data,
        expiry: new Date(now.getTime() + BACKFILL_JOB_EXPIRY_MS)
    });
    logger.info(`${LOG_TAG} created backfill job`, { jobId, rcAccountId, mode, total });
    return { jobId, status: total ? 'pending' : 'completed', total, mode };
}

async function findClaimableBackfillJob() {
    const processingPattern = 'processing:%';
    const staleBefore = new Date(Date.now() - BACKFILL_JOB_STALE_PROCESSING_MS);
    const busyJob = await CacheModel.findOne({
        where: {
            cacheKey: { [Op.like]: `${BACKFILL_JOB_CACHE_KEY_PREFIX}:%` },
            status: { [Op.like]: processingPattern },
            updatedAt: { [Op.gte]: staleBefore }
        }
    });
    if (busyJob) return { busy: true, job: null };

    let job = await CacheModel.findOne({
        where: {
            cacheKey: { [Op.like]: `${BACKFILL_JOB_CACHE_KEY_PREFIX}:%` },
            status: { [Op.in]: ['pending', 'running'] }
        },
        order: [['createdAt', 'ASC']]
    });
    let stale = false;
    if (!job) {
        job = await CacheModel.findOne({
            where: {
                cacheKey: { [Op.like]: `${BACKFILL_JOB_CACHE_KEY_PREFIX}:%` },
                status: { [Op.like]: processingPattern },
                updatedAt: { [Op.lt]: staleBefore }
            },
            order: [['updatedAt', 'ASC']]
        });
        stale = !!job;
    }
    if (!job) return { busy: false, job: null };

    const leaseStatus = `processing:${require('crypto').randomUUID()}`;
    const claimWhere: any = { id: job.id, status: job.status };
    if (stale) claimWhere.updatedAt = { [Op.lt]: staleBefore };
    const [claimedCount] = await CacheModel.update(
        { status: leaseStatus },
        { where: claimWhere }
    );
    if (!claimedCount) return { busy: true, job: null };
    job.status = leaseStatus;
    return { busy: false, job, leaseStatus };
}

async function updateClaimedJob(job, leaseStatus, status, data) {
    const [updatedCount] = await CacheModel.update(
        { status, data },
        { where: { id: job.id, status: leaseStatus } }
    );
    return updatedCount > 0;
}

async function runBackfillJobWorker() {
    const claim = await findClaimableBackfillJob();
    if (claim.busy) return { status: 'busy' };
    if (!claim.job) return { status: 'idle' };

    const { job, leaseStatus } = claim;
    const data = { ...job.data, errors: [...(job.data?.errors || [])] };
    try {
        const bullhornUsers = await UserModel.findAll({
            where: { rcAccountId: data.rcAccountId, platform: 'bullhorn' }
        });
        const bullhornUserIds = bullhornUsers.map((user) => user.id);
        if (!bullhornUserIds.length) {
            data.completedAt = new Date().toISOString();
            data.lastWorkerError = 'No Bullhorn users found for this RC account';
            await updateClaimedJob(job, leaseStatus, 'failed', data);
            return { jobId: data.jobId, status: 'failed', reason: data.lastWorkerError };
        }

        const callLogs = await CallLogModel.findAll({
            where: getBackfillCandidateWhere({
                bullhornUserIds,
                dateFrom: data.dateFrom,
                dateTo: data.dateTo,
                cursorCreatedAt: data.cursorCreatedAt,
                cursorId: data.cursorId
            }),
            order: [['createdAt', 'ASC'], ['id', 'ASC']],
            limit: data.batchSize || DEFAULT_JOB_BATCH_SIZE
        });
        if (!callLogs.length) {
            data.completedAt = new Date().toISOString();
            await updateClaimedJob(job, leaseStatus, 'completed', data);
            return { jobId: data.jobId, status: 'completed', ...getJobCounts(data) };
        }

        const rcSDK = new RingCentral({
            server: process.env.RINGCENTRAL_SERVER,
            clientId: process.env.RINGCENTRAL_CLIENT_ID,
            clientSecret: process.env.RINGCENTRAL_CLIENT_SECRET,
            redirectUri: `${process.env.APP_SERVER}/ringcentral/oauth/callback`
        });
        const adminTokenManager = await createAdminTokenManager({ rcSDK, rcAccountId: data.rcAccountId });
        const batchDateFrom = callLogs[0].createdAt.toISOString();
        const batchDateTo = callLogs[callLogs.length - 1].createdAt.toISOString();
        const rcRecordsBySessionId = await fetchRcAccountCallLogBySessionId({
            rcSDK,
            adminTokenManager,
            dateFrom: batchDateFrom,
            dateTo: batchDateTo
        });
        const bullhornExecutorUser = await findBullhornExecutorUser(bullhornUsers);
        const initialNextStartTime = data.nextAiRequestAt ? new Date(data.nextAiRequestAt).getTime() : 0;
        const waitForRateLimit = createPerMinuteRateLimiter(data.ratePerMinute, initialNextStartTime);

        for (const callLog of callLogs) {
            const summary = await processCallLog({
                callLog,
                rcRecordsBySessionId,
                rcSDK,
                adminTokenManager,
                bullhornExecutorUser,
                mode: data.mode,
                waitForRateLimit
            });
            data.processed++;
            if (summary.wouldPatch) data.wouldPatch++;
            if (summary.patched) data.patched++;
            if (summary.ownerExtensionIdIsGuess) data.guessedExtension++;
            if (summary.failed) {
                data.failed++;
                if (data.errors.length < MAX_RECORDED_JOB_ERRORS) {
                    data.errors.push({
                        telephonySessionId: summary.telephonySessionId,
                        bullhornLogId: summary.bullhornLogId,
                        error: summary.skippedReason
                    });
                }
            } else if (!summary.wouldPatch) {
                data.skipped++;
            }
            data.cursorCreatedAt = callLog.createdAt.toISOString();
            data.cursorId = callLog.id;
            const nextStartTime = waitForRateLimit.getNextStartTime();
            data.nextAiRequestAt = nextStartTime ? new Date(nextStartTime).toISOString() : data.nextAiRequestAt;
            const stillClaimed = await updateClaimedJob(job, leaseStatus, leaseStatus, data);
            if (!stillClaimed) {
                return { jobId: data.jobId, status: 'cancelled' };
            }
        }

        const hasProbablyMore = callLogs.length >= (data.batchSize || DEFAULT_JOB_BATCH_SIZE);
        const nextStatus = hasProbablyMore ? 'running' : 'completed';
        if (nextStatus === 'completed') data.completedAt = new Date().toISOString();
        await updateClaimedJob(job, leaseStatus, nextStatus, data);
        return { jobId: data.jobId, status: nextStatus, ...getJobCounts(data) };
    } catch (error) {
        data.lastWorkerError = error.message;
        data.lastWorkerErrorAt = new Date().toISOString();
        await updateClaimedJob(job, leaseStatus, 'running', data);
        logger.error(`${LOG_TAG} backfill job worker failed`, { jobId: data.jobId, stack: error.stack });
        throw error;
    }
}

function getJobCounts(data) {
    return {
        total: data.total,
        processed: data.processed,
        wouldPatch: data.wouldPatch,
        patched: data.patched,
        skipped: data.skipped,
        failed: data.failed
    };
}

async function getBackfillJobStatus({ jobId }) {
    if (!jobId) throw new Error('jobId is required');
    const job = await CacheModel.findByPk(getBackfillJobCacheId(jobId));
    if (!job) throw new Error(`Backfill job not found: ${jobId}`);
    const status = `${job.status}`.startsWith('processing:') ? 'processing' : job.status;
    return { jobId, status, ...job.data };
}

async function cancelBackfillJob({ jobId }) {
    if (!jobId) throw new Error('jobId is required');
    const [updatedCount] = await CacheModel.update(
        { status: 'cancelled' },
        { where: { id: getBackfillJobCacheId(jobId) } }
    );
    if (!updatedCount) throw new Error(`Backfill job not found: ${jobId}`);
    return { jobId, status: 'cancelled' };
}

exports.app = backfillCallLogAiNotes;
exports.createJob = createBackfillJob;
exports.runWorker = runBackfillJobWorker;
exports.getJobStatus = getBackfillJobStatus;
exports.cancelJob = cancelBackfillJob;
exports.createAdminTokenManager = createAdminTokenManager;
exports.findBullhornExecutorUser = findBullhornExecutorUser;
exports.buildAiPatch = buildAiPatch;
exports.processCallLog = processCallLog;

export {};
