// @ts-check

const Op = /** @type {any} */ (require('sequelize')).Op;
const { CallLogModel: RawCallLogModel } = require('../models/callLogModel');
const CallLogModel = /** @type {any} */ (RawCallLogModel);
const { MessageLogModel: RawMessageLogModel } = require('../models/messageLogModel');
const MessageLogModel = /** @type {any} */ (RawMessageLogModel);
const { UserModel: RawUserModel } = require('../models/userModel');
const UserModel = /** @type {any} */ (RawUserModel);
const { CacheModel: RawCacheModel } = require('../models/cacheModel');
const CacheModel = /** @type {any} */ (RawCacheModel);
const oauth = /** @type {any} */ (require('../lib/oauth'));
const { composeCallLog: rawComposeCallLog } = require('../lib/callLogComposer');
const composeCallLog = /** @type {any} */ (rawComposeCallLog);
const { composeSharedSMSLog: rawComposeSharedSMSLog } = require('../lib/sharedSMSComposer');
const composeSharedSMSLog = /** @type {any} */ (rawComposeSharedSMSLog);
const connectorRegistry = /** @type {any} */ (require('../connector/registry'));
const { LOG_DETAILS_FORMAT_TYPE } = require('../lib/constants');
const { NoteCache: RawNoteCache } = require('../models/dynamo/noteCacheSchema');
const NoteCache = /** @type {any} */ (RawNoteCache);
const { Connector: RawConnector } = require('../models/dynamo/connectorSchema');
const Connector = /** @type {any} */ (RawConnector);
const moment = /** @type {any} */ (require('moment'));
const { getMediaReaderLinkByPlatformMediaLink: rawGetMediaReaderLinkByPlatformMediaLink } = require('../lib/util');
const getMediaReaderLinkByPlatformMediaLink = /** @type {any} */ (rawGetMediaReaderLinkByPlatformMediaLink);
const axios = /** @type {any} */ (require('axios'));
const logger = /** @type {any} */ (require('../lib/logger'));
const { handleApiError: rawHandleApiError, handleDatabaseError: rawHandleDatabaseError } = require('../lib/errorHandler');
const handleApiError = /** @type {any} */ (rawHandleApiError);
const handleDatabaseError = /** @type {any} */ (rawHandleDatabaseError);
const { randomUUID } = require('crypto');
const { AccountDataModel: RawAccountDataModel } = require('../models/accountDataModel');
const AccountDataModel = /** @type {any} */ (RawAccountDataModel);
const pluginCore = /** @type {any} */ (require('./plugin'));
const {
    getCallLogExtensionNumber: rawGetCallLogExtensionNumber,
    getCallLogHashedExtensionId: rawGetCallLogHashedExtensionId,
    buildCallLogSessionWhere: rawBuildCallLogSessionWhere,
    findMatchingCallLog: rawFindMatchingCallLog,
} = require('../lib/callLogLookup');
const getCallLogExtensionNumber = /** @type {any} */ (rawGetCallLogExtensionNumber);
const getCallLogHashedExtensionId = /** @type {any} */ (rawGetCallLogHashedExtensionId);
const buildCallLogSessionWhere = /** @type {any} */ (rawBuildCallLogSessionWhere);
const findMatchingCallLog = /** @type {any} */ (rawFindMatchingCallLog);

const ASYNC_PLUGIN_CACHE_KEY = 'asyncPluginTask';
const ASYNC_PLUGIN_CALLBACK_PATH = '/plugin/async-callback';
const ASYNC_PLUGIN_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function mergePluginWarnings({ returnMessage, warningMessages }) {
    if (!warningMessages.length) {
        return returnMessage;
    }
    const warningMessage = warningMessages.join(' ');
    if (!returnMessage) {
        return {
            message: warningMessage,
            messageType: 'warning',
            ttl: 5000,
        };
    }
    return {
        ...returnMessage,
        message: `${returnMessage.message || ''} ${warningMessage}`.trim(),
        messageType: returnMessage.messageType === 'error' ? 'error' : 'warning',
    };
}

function getAsyncPluginCallbackUrl(taskId) {
    const appServer = (process.env.APP_SERVER || process.env.OVERRIDE_APP_SERVER || '').replace(/\/+$/, '');
    return `${appServer}${ASYNC_PLUGIN_CALLBACK_PATH}/${taskId}`;
}

function getAsyncPluginRequestData({ operation, incomingData }) {
    if (operation === 'updateCallLog') {
        return { logInfo: incomingData };
    }
    return incomingData;
}

function buildAsyncPluginTaskData({ taskId, callbackUrl, pluginId, platform, operation, user, incomingData, existingCallLog, hashedAccountId, isFromSSCL }) {
    const logInfo = incomingData?.logInfo ?? incomingData ?? {};
    return {
        type: ASYNC_PLUGIN_CACHE_KEY,
        asyncTaskId: taskId,
        callbackUrl,
        pluginId,
        platform,
        logType: 'call',
        operation,
        userId: user.id,
        rcAccountId: user.rcAccountId,
        sessionId: logInfo.sessionId ?? incomingData?.sessionId,
        extensionNumber: getCallLogExtensionNumber(incomingData),
        hashedExtensionId: getCallLogHashedExtensionId(incomingData),
        callLogId: existingCallLog?.id ?? logInfo.telephonySessionId ?? logInfo.id,
        thirdPartyLogId: existingCallLog?.thirdPartyLogId,
        contactId: existingCallLog?.contactId ?? incomingData?.contactId,
        incomingData,
        hashedAccountId,
        isFromSSCL,
    };
}

function splitCallPluginsByExecutionMode(callPlugins) {
    return {
        syncCallPlugins: callPlugins.filter(plugin => !plugin.data.isAsync),
        asyncCallPlugins: callPlugins.filter(plugin => plugin.data.isAsync),
    };
}

async function runSyncCallPlugins({ syncCallPlugins, incomingData, user, platform }) {
    let processedIncomingData = incomingData;
    for (const plugin of syncCallPlugins) {
        const pluginId = plugin.id;
        const pluginJwtToken = plugin.data.jwtToken;
        const pluginManifest = plugin.data;
        const pluginEndpointUrl = pluginManifest.endpointUrl;
        if (!pluginEndpointUrl) {
            throw new Error('Plugin URL is not set');
        }
        const userConfig = pluginCore.getPluginConfigFromUserSettings({ userSettings: user.userSettings, pluginId });
        const processedResultResponse = await axios.post(pluginEndpointUrl, {
            data: processedIncomingData,
            config: userConfig,
            hashedExtensionId: user.hashedRcExtensionId,
        }, {
            headers: {
                Authorization: `Bearer ${pluginJwtToken}`,
            },
        });
        const refreshedPluginJwtToken = pluginCore.getRefreshedJwtTokenFromHeaders({ headers: processedResultResponse.headers });
        if (refreshedPluginJwtToken) {
            pluginCore.persistPluginData({
                rcAccountId: user.rcAccountId,
                pluginId,
                jwtToken: refreshedPluginJwtToken,
            });
        }
        processedIncomingData = processedResultResponse.data;
    }
    return processedIncomingData;
}

async function markAsyncPluginTaskFailed(cache, message) {
    if (!cache) {
        return;
    }
    await cache.update({
        status: 'failed',
        data: {
            ...cache.data,
            message,
        },
    });
}

async function dispatchAsyncCallPlugin({ plugin, incomingData, user, platform, operation, existingCallLog, hashedAccountId, isFromSSCL }) {
    const pluginId = plugin.id;
    const taskId = randomUUID();
    const callbackUrl = getAsyncPluginCallbackUrl(taskId);
    const taskData = buildAsyncPluginTaskData({
        taskId,
        callbackUrl,
        pluginId,
        platform,
        operation,
        user,
        incomingData,
        existingCallLog,
        hashedAccountId,
        isFromSSCL,
    });
    let taskCache = null;
    try {
        taskCache = await CacheModel.create({
            id: taskId,
            status: 'pending',
            userId: user.id,
            cacheKey: `${ASYNC_PLUGIN_CACHE_KEY}-${pluginId}`,
            data: taskData,
            expiry: new Date(Date.now() + ASYNC_PLUGIN_CACHE_TTL_MS),
        });

        const pluginJwtToken = plugin.data.jwtToken;
        const pluginEndpointUrl = plugin.data.endpointUrl;
        if (!pluginEndpointUrl) {
            throw new Error('Plugin URL is not set');
        }
        if (!plugin.data.tokenSyncUrl) {
            throw new Error('Plugin token sync URL is not set');
        }
        const syncPluginTokenResponse = await axios.post(plugin.data.tokenSyncUrl, {},
            {
                headers: {
                    Authorization: `Bearer ${pluginJwtToken}`,
                },
            }
        );
        const syncedPluginJwtToken = pluginCore.getRefreshedJwtTokenFromHeaders({ headers: syncPluginTokenResponse.headers });
        await axios.post(pluginEndpointUrl, {
            data: getAsyncPluginRequestData({ operation, incomingData }),
            config: pluginCore.getPluginConfigFromUserSettings({ userSettings: user.userSettings, pluginId }),
            asyncTaskId: taskId,
            callbackUrl,
            hashedExtensionId: user.hashedRcExtensionId,
        }, {
            headers: {
                Authorization: `Bearer ${syncedPluginJwtToken ?? pluginJwtToken}`,
            },
        });
        if (syncedPluginJwtToken) {
            pluginCore.persistPluginData({
                rcAccountId: user.rcAccountId,
                pluginId,
                jwtToken: syncedPluginJwtToken,
            });
        }
    }
    catch (error) {
        logger.error('Error dispatching async plugin task', {
            pluginId,
            taskId,
            stack: error.stack,
        });
        try {
            await markAsyncPluginTaskFailed(taskCache, error.message || 'Async plugin dispatch failed');
        }
        catch (cacheError) {
            logger.error('Error marking async plugin task failed', {
                pluginId,
                taskId,
                stack: cacheError.stack,
            });
        }
    }
}

async function dispatchAsyncCallPlugins({ asyncCallPlugins, incomingData, user, platform, operation, existingCallLog, hashedAccountId, isFromSSCL }) {
    for (const plugin of asyncCallPlugins) {
        await dispatchAsyncCallPlugin({
            plugin,
            incomingData,
            user,
            platform,
            operation,
            existingCallLog,
            hashedAccountId,
            isFromSSCL,
        });
    }
}

async function getAuthenticatedCallLogContext({ platform, userId }) {
    let user = await UserModel.findByPk(userId);
    if (!user || !user.accessToken) {
        throw new Error('User not found');
    }
    const platformModule = connectorRegistry.getConnector(platform);
    const proxyId = user.platformAdditionalInfo?.proxyId;
    let proxyConfig = null;
    if (proxyId) {
        proxyConfig = await Connector.getProxyConfig(proxyId);
    }
    const authType = await platformModule.getAuthType({ proxyId, proxyConfig });
    let authHeader = '';
    switch (authType) {
        case 'oauth': {
            const oauthApp = oauth.getOAuthApp((await platformModule.getOauthInfo({ tokenUrl: user?.platformAdditionalInfo?.tokenUrl, hostname: user?.hostname, proxyId, proxyConfig })));
            user = await oauth.checkAndRefreshAccessToken(oauthApp, user);
            if (!user) {
                throw new Error('User session expired. Please connect again.');
            }
            authHeader = `Bearer ${user.accessToken}`;
            break;
        }
        case 'apiKey': {
            const basicAuth = platformModule.getBasicAuth({ apiKey: user.accessToken });
            authHeader = `Basic ${basicAuth}`;
            break;
        }
    }
    return { user, platformModule, authHeader, proxyConfig };
}

function appendCallbackNote(existingNote, callbackNote) {
    return [existingNote, callbackNote].filter(note => !!note).join('\n\n');
}

function getCallbackUpdateData({ incomingData, existingCallLog, appendedNote }) {
    const logInfo = incomingData?.logInfo ?? incomingData ?? {};
    return {
        recordingLink: incomingData?.recordingLink ?? logInfo.recording?.link,
        recordingDownloadLink: incomingData?.recordingDownloadLink,
        subject: incomingData?.subject ?? logInfo.customSubject,
        note: appendedNote,
        startTime: incomingData?.startTime ?? logInfo.startTime,
        duration: incomingData?.duration ?? logInfo.duration,
        result: incomingData?.result ?? logInfo.result,
        aiNote: incomingData?.aiNote,
        transcript: incomingData?.transcript,
        legs: incomingData?.legs ?? logInfo.legs ?? [],
        direction: incomingData?.direction ?? logInfo.direction,
        from: incomingData?.from ?? logInfo.from,
        to: incomingData?.to ?? logInfo.to,
        ringSenseTranscript: incomingData?.ringSenseTranscript,
        ringSenseSummary: incomingData?.ringSenseSummary,
        ringSenseAIScore: incomingData?.ringSenseAIScore,
        ringSenseBulletedSummary: incomingData?.ringSenseBulletedSummary,
        ringSenseLink: incomingData?.ringSenseLink,
        callLog: {
            sessionId: existingCallLog.sessionId,
            startTime: incomingData?.startTime ?? logInfo.startTime,
            duration: incomingData?.duration ?? logInfo.duration,
            result: incomingData?.result ?? logInfo.result,
            direction: incomingData?.direction ?? logInfo.direction,
            from: incomingData?.from ?? logInfo.from,
            to: incomingData?.to ?? logInfo.to,
            legs: incomingData?.legs ?? logInfo.legs ?? [],
        },
    };
}

async function appendAsyncPluginNoteToCallLog({ taskCache, note }) {
    const taskData = taskCache.data || {};
    const where = {
        ...buildCallLogSessionWhere({
            sessionId: taskData.sessionId,
            extensionNumber: taskData.extensionNumber,
            hashedExtensionId: taskData.hashedExtensionId,
        }),
        platform: taskData.platform,
        userId: taskData.userId,
    };
    const existingCallLog = await CallLogModel.findOne({ where });
    if (!existingCallLog) {
        throw new Error('Call log not found for async plugin task');
    }

    const {
        user,
        platformModule,
        authHeader,
        proxyConfig,
    } = await getAuthenticatedCallLogContext({
        platform: taskData.platform,
        userId: taskData.userId,
    });

    const logFormat = platformModule.getLogFormatType ? platformModule.getLogFormatType(taskData.platform, proxyConfig) : LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT;
    const getLogResult = await platformModule.getCallLog({
        user,
        telephonySessionId: existingCallLog.id,
        callLogId: existingCallLog.thirdPartyLogId,
        contactId: existingCallLog.contactId,
        authHeader,
        proxyConfig,
    });
    const existingBody = getLogResult?.callLogInfo?.fullBody || getLogResult?.callLogInfo?.note || '';
    const existingNote = getLogResult?.callLogInfo?.note || '';
    const appendedNote = appendCallbackNote(existingNote, note);
    const updateData = getCallbackUpdateData({
        incomingData: taskData.incomingData,
        existingCallLog,
        appendedNote,
    });
    const composedLogDetails = composeCallLog({
        logFormat,
        existingBody,
        callLog: updateData.callLog,
        contactInfo: null,
        user,
        note: updateData.note,
        aiNote: updateData.aiNote,
        transcript: updateData.transcript,
        recordingLink: updateData.recordingLink,
        subject: updateData.subject,
        startTime: updateData.startTime,
        duration: updateData.duration,
        result: updateData.result,
        ringSenseTranscript: updateData.ringSenseTranscript,
        ringSenseSummary: updateData.ringSenseSummary,
        ringSenseAIScore: updateData.ringSenseAIScore,
        ringSenseBulletedSummary: updateData.ringSenseBulletedSummary,
        ringSenseLink: updateData.ringSenseLink,
    });

    await platformModule.updateCallLog({
        user,
        existingCallLog,
        authHeader,
        recordingLink: updateData.recordingLink,
        recordingDownloadLink: updateData.recordingDownloadLink,
        subject: updateData.subject,
        note: updateData.note,
        startTime: updateData.startTime,
        duration: updateData.duration,
        result: updateData.result,
        aiNote: updateData.aiNote,
        transcript: updateData.transcript,
        legs: updateData.legs,
        ringSenseTranscript: updateData.ringSenseTranscript,
        ringSenseSummary: updateData.ringSenseSummary,
        ringSenseAIScore: updateData.ringSenseAIScore,
        ringSenseBulletedSummary: updateData.ringSenseBulletedSummary,
        ringSenseLink: updateData.ringSenseLink,
        composedLogDetails,
        existingCallLogDetails: getLogResult?.callLogInfo?.fullLogResponse,
        hashedAccountId: taskData.hashedAccountId,
        isFromSSCL: taskData.isFromSSCL,
        proxyConfig,
    });
}

async function handleAsyncPluginCallback({ taskId, body }) {
    if (typeof body?.successful !== 'boolean') {
        return {
            statusCode: 400,
            body: { successful: false, message: 'successful is required' },
        };
    }
    const taskCache = await CacheModel.findByPk(taskId);
    if (!taskCache) {
        return {
            statusCode: 404,
            body: { successful: false, message: 'Async task not found' },
        };
    }
    if (taskCache.expiry && taskCache.expiry.getTime() <= Date.now()) {
        await taskCache.destroy();
        return {
            statusCode: 404,
            body: { successful: false, message: 'Async task not found' },
        };
    }

    if (!body.successful) {
        await markAsyncPluginTaskFailed(taskCache, body.message || 'Async plugin callback failed');
        return {
            statusCode: 200,
            body: { successful: true },
        };
    }

    try {
        await appendAsyncPluginNoteToCallLog({
            taskCache,
            note: typeof body.note === 'string' ? body.note : '',
        });
        await taskCache.destroy();
        return {
            statusCode: 200,
            body: { successful: true },
        };
    }
    catch (error) {
        logger.error('Async plugin callback failed to update call log', {
            taskId,
            stack: error.stack,
        });
        await markAsyncPluginTaskFailed(taskCache, error.message || body.message || 'Async plugin callback failed');
        return {
            statusCode: 500,
            body: { successful: false, message: error.message || 'Async plugin callback failed' },
        };
    }
}

async function createCallLog({ platform, userId, incomingData, hashedAccountId, isFromSSCL }) {
    try {
        const extensionNumber = getCallLogExtensionNumber(incomingData);
        const hashedExtensionId = getCallLogHashedExtensionId(incomingData);
        let existingCallLog = null;
        try {
            existingCallLog = await CallLogModel.findOne({
                where: buildCallLogSessionWhere({
                    sessionId: incomingData.logInfo.sessionId,
                    extensionNumber,
                    hashedExtensionId,
                })
            });
        }
        catch (error) {
            return handleDatabaseError(error, 'Error finding existing call log');
        }
        if (existingCallLog) {
            return {
                successful: false,
                returnMessage: {
                    message: `Existing log for session ${incomingData.logInfo.sessionId}`,
                    messageType: 'warning',
                    ttl: 3000
                }
            }
        }
        let user = null;
        try {
            user = await UserModel.findByPk(userId);
        }
        catch (error) {
            return handleDatabaseError(error, 'Error finding user');
        }
        if (!user || !user.accessToken) {
            return {
                successful: false,
                returnMessage: {
                    message: `User not found`,
                    messageType: 'warning',
                    ttl: 5000
                }
            };
        }

        const platformModule = connectorRegistry.getConnector(platform);
        const callLog = incomingData.logInfo;
        const additionalSubmission = incomingData.additionalSubmission;
        let note = incomingData.note;
        if (process.env.USE_CACHE && isFromSSCL) {
            const noteCache = await NoteCache.get({ sessionId: incomingData.logInfo.sessionId });
            if (noteCache) {
                note = noteCache.note;
            }
        }
        const aiNote = incomingData.aiNote;
        const transcript = incomingData.transcript;
        let proxyConfig;
        const proxyId = user.platformAdditionalInfo?.proxyId;
        if (proxyId) {
            proxyConfig = await Connector.getProxyConfig(proxyId);
        }
        const authType = await platformModule.getAuthType({ proxyId, proxyConfig });
        let authHeader = '';
        switch (authType) {
            case 'oauth':
                const oauthApp = oauth.getOAuthApp((await platformModule.getOauthInfo({ tokenUrl: user?.platformAdditionalInfo?.tokenUrl, hostname: user?.hostname, proxyId, proxyConfig })));
                user = await oauth.checkAndRefreshAccessToken(oauthApp, user);
                if (!user) {
                    return {
                        successful: false,
                        returnMessage: {
                            message: `User session expired. Please connect again.`,
                            messageType: 'warning',
                            ttl: 5000
                        },
                        isRevokeUserSession: true
                    }
                }
                authHeader = `Bearer ${user.accessToken}`;
                break;
            case 'apiKey':
                const basicAuth = platformModule.getBasicAuth({ apiKey: user.accessToken });
                authHeader = `Basic ${basicAuth}`;
                break;
        }
        const contactNumber = callLog.direction === 'Inbound' ? callLog.from.phoneNumber : callLog.to.phoneNumber;
        const contactId = incomingData.contactId;
        if (!contactId || contactId === 0) {
            return {
                successful: false,
                returnMessage: {
                    message: `Contact not found for number ${contactNumber}`,
                    messageType: 'warning',
                    ttl: 5000
                }
            };
        }
        const contactInfo = {
            id: contactId,
            phoneNumber: contactNumber,
            type: incomingData.contactType ?? "",
            name: incomingData.contactName ?? ""
        };

        const pluginWarnings = [];
        // Plugins
        const accountPlugins = await pluginCore.getPluginsFromRcAccountId({ rcAccountId: user.rcAccountId });
        const callPlugins = accountPlugins.filter(plugin => plugin.data.supportedLogTypes.includes('call'));
        const { syncCallPlugins, asyncCallPlugins } = splitCallPluginsByExecutionMode(callPlugins);
        incomingData = await runSyncCallPlugins({ syncCallPlugins, incomingData, user, platform });
        note = incomingData.note;

        // Compose call log details centrally
        const logFormat = platformModule.getLogFormatType ? platformModule.getLogFormatType(platform, proxyConfig) : LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT;
        let composedLogDetails = '';
        if (logFormat === LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT || logFormat === LOG_DETAILS_FORMAT_TYPE.HTML || logFormat === LOG_DETAILS_FORMAT_TYPE.MARKDOWN) {
            composedLogDetails = composeCallLog({
                logFormat,
                callLog,
                contactInfo,
                user,
                note,
                aiNote,
                transcript,
                recordingLink: callLog.recording?.link,
                subject: callLog.customSubject,
                startTime: callLog.startTime,
                duration: callLog.duration,
                result: callLog.result,
                platform,
                ringSenseTranscript: incomingData.ringSenseTranscript,
                ringSenseSummary: incomingData.ringSenseSummary,
                ringSenseAIScore: incomingData.ringSenseAIScore,
                ringSenseBulletedSummary: incomingData.ringSenseBulletedSummary,
                ringSenseLink: incomingData.ringSenseLink,
            });
        }

        let { logId, returnMessage, extraDataTracking } = await platformModule.createCallLog({
            user,
            contactInfo,
            authHeader,
            callLog,
            note,
            additionalSubmission,
            aiNote,
            transcript,
            ringSenseTranscript: incomingData.ringSenseTranscript,
            ringSenseSummary: incomingData.ringSenseSummary,
            ringSenseAIScore: incomingData.ringSenseAIScore,
            ringSenseBulletedSummary: incomingData.ringSenseBulletedSummary,
            ringSenseLink: incomingData.ringSenseLink,
            composedLogDetails,
            hashedAccountId,
            isFromSSCL,
            proxyConfig,
        });
        if (!extraDataTracking) {
            extraDataTracking = {};
        }
        extraDataTracking.withSmartNoteLog = !!aiNote;
        extraDataTracking.withTranscript = !!transcript;
        if (logId) {
            try {
                const createdCallLog = await CallLogModel.create({
                    id: incomingData.logInfo.telephonySessionId || incomingData.logInfo.id,
                    sessionId: incomingData.logInfo.sessionId,
                    extensionNumber,
                    hashedExtensionId,
                    platform,
                    thirdPartyLogId: logId,
                    userId,
                    contactId
                });
                if (asyncCallPlugins.length) {
                    await dispatchAsyncCallPlugins({
                        asyncCallPlugins,
                        incomingData,
                        user,
                        platform,
                        operation: 'createCallLog',
                        existingCallLog: createdCallLog,
                        hashedAccountId,
                        isFromSSCL,
                    });
                }
            }
            catch (error) {
                return handleDatabaseError(error, 'Error creating call log');
            }
            return {
                successful: !!logId,
                logId,
                returnMessage: mergePluginWarnings({ returnMessage, warningMessages: pluginWarnings }),
                extraDataTracking
            };
        }
        else {
            return {
                successful: false,
                returnMessage
            };
        }
    } catch (e) {
        return handleApiError(e, platform, 'createCallLog', { userId });
    }
}

async function getCallLog({ userId, sessionIds, extensionNumber, hashedExtensionId, platform, requireDetails }) {
    try {
        let user = await UserModel.findByPk(userId);
        if (!user || !user.accessToken) {
            return { successful: false, message: `Contact not found` };
        }
        let logs = [];
        let returnMessage = null;
        let extraDataTracking = {};

        // Handle undefined or null sessionIds
        if (!sessionIds) {
            return { successful: false, message: `No session IDs provided` };
        }

        let sessionIdsArray = sessionIds.split(',');
        if (sessionIdsArray.length > 5) {
            sessionIdsArray = sessionIdsArray.slice(0, 5);
        }

        if (requireDetails) {
            const proxyId = user.platformAdditionalInfo?.proxyId;
            let proxyConfig = null;
            if (proxyId) {
                proxyConfig = await Connector.getProxyConfig(proxyId);
            }
            const platformModule = connectorRegistry.getConnector(platform);
            const authType = await platformModule.getAuthType({ proxyId, proxyConfig });
            let authHeader = '';
            switch (authType) {
                case 'oauth':
                    const oauthApp = oauth.getOAuthApp((await platformModule.getOauthInfo({ tokenUrl: user?.platformAdditionalInfo?.tokenUrl, hostname: user?.hostname, proxyId, proxyConfig })));
                    user = await oauth.checkAndRefreshAccessToken(oauthApp, user);
                    if (!user) {
                        return {
                            successful: false,
                            returnMessage: {
                                message: `User session expired. Please connect again.`,
                                messageType: 'warning',
                                ttl: 5000
                            },
                            isRevokeUserSession: true
                        }
                    }
                    authHeader = `Bearer ${user.accessToken}`;
                    break;
                case 'apiKey':
                    const basicAuth = platformModule.getBasicAuth({ apiKey: user.accessToken });
                    authHeader = `Basic ${basicAuth}`;
                    break;
            }
            const callLogs = await CallLogModel.findAll({
                where: buildCallLogSessionWhere({
                    sessionIds: sessionIdsArray,
                    extensionNumber,
                    hashedExtensionId,
                }),
                order: [['hashedExtensionId', 'ASC'], ['extensionNumber', 'ASC']]
            });
            for (const sId of sessionIdsArray) {
                if (sId == 0) {
                    logs.push({ sessionId: sId, matched: false });
                    continue;
                }
                const callLog = findMatchingCallLog(callLogs, sId, extensionNumber, hashedExtensionId);
                if (!callLog) {
                    logs.push({ sessionId: sId, matched: false });
                }
                else {
                    const getCallLogResult = await platformModule.getCallLog({ user, telephonySessionId: callLog.id, callLogId: callLog.thirdPartyLogId, contactId: callLog.contactId, authHeader, proxyConfig });
                    returnMessage = getCallLogResult.returnMessage;
                    extraDataTracking = getCallLogResult.extraDataTracking;
                    logs.push({ sessionId: callLog.sessionId, matched: true, logId: callLog.thirdPartyLogId, logData: getCallLogResult.callLogInfo });
                }
            }
        }
        else {
            const callLogs = await CallLogModel.findAll({
                where: buildCallLogSessionWhere({
                    sessionIds: sessionIdsArray,
                    extensionNumber,
                    hashedExtensionId,
                }),
                order: [['hashedExtensionId', 'ASC'], ['extensionNumber', 'ASC']]
            });
            for (const sId of sessionIdsArray) {
                const callLog = findMatchingCallLog(callLogs, sId, extensionNumber, hashedExtensionId);
                if (!callLog) {
                    logs.push({ sessionId: sId, matched: false });
                }
                else {
                    logs.push({ sessionId: callLog.sessionId, matched: true, logId: callLog.thirdPartyLogId });
                }
            }
        }
        return { successful: true, logs, returnMessage, extraDataTracking };
    }
    catch (e) {
        return handleApiError(e, platform, 'getCallLog', { userId, sessionIds, requireDetails, extensionNumber, hashedExtensionId });
    }
}

async function updateCallLog({ platform, userId, incomingData, hashedAccountId, isFromSSCL }) {
    try {
        const extensionNumber = getCallLogExtensionNumber(incomingData);
        const hashedExtensionId = getCallLogHashedExtensionId(incomingData);
        let existingCallLog = null;
        try {
            existingCallLog = await CallLogModel.findOne({
                where: buildCallLogSessionWhere({
                    sessionId: incomingData.sessionId,
                    extensionNumber,
                    hashedExtensionId,
                })
            });
        }
        catch (error) {
            return handleDatabaseError(error, 'Error finding existing call log');
        }
        if (existingCallLog) {
            let user = await UserModel.findByPk(userId);
            if (!user || !user.accessToken) {
                return { successful: false, message: `Contact not found` };
            }
            const platformModule = connectorRegistry.getConnector(platform);
            const proxyId = user.platformAdditionalInfo?.proxyId;
            let proxyConfig = null;
            if (proxyId) {
                proxyConfig = await Connector.getProxyConfig(proxyId);
            }
            const authType = await platformModule.getAuthType({ proxyId, proxyConfig });
            let authHeader = '';
            switch (authType) {
                case 'oauth':
                    const oauthApp = oauth.getOAuthApp((await platformModule.getOauthInfo({ tokenUrl: user?.platformAdditionalInfo?.tokenUrl, hostname: user?.hostname, proxyId, proxyConfig })));
                    user = await oauth.checkAndRefreshAccessToken(oauthApp, user);
                    if (!user) {
                        return {
                            successful: false,
                            returnMessage: {
                                message: `User session expired. Please connect again.`,
                                messageType: 'warning',
                                ttl: 5000
                            },
                            isRevokeUserSession: true
                        }
                    }
                    authHeader = `Bearer ${user.accessToken}`;
                    break;
                case 'apiKey':
                    const basicAuth = platformModule.getBasicAuth({ apiKey: user.accessToken });
                    authHeader = `Basic ${basicAuth}`;
                    break;
            }

            const pluginWarnings = [];
            // Plugins
            const accountPlugins = await pluginCore.getPluginsFromRcAccountId({ rcAccountId: user.rcAccountId });
            const callPlugins = accountPlugins.filter(plugin => plugin.data.supportedLogTypes.includes('call'));
            const { syncCallPlugins, asyncCallPlugins } = splitCallPluginsByExecutionMode(callPlugins);
            incomingData = await runSyncCallPlugins({ syncCallPlugins, incomingData, user, platform });

            // Fetch existing call log details once to avoid duplicate API calls
            let existingCallLogDetails = null;    // Compose updated call log details centrally
            const logFormat = platformModule.getLogFormatType ? platformModule.getLogFormatType(platform, proxyConfig) : LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT;
            let composedLogDetails = '';
            if (logFormat === LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT || logFormat === LOG_DETAILS_FORMAT_TYPE.HTML || logFormat === LOG_DETAILS_FORMAT_TYPE.MARKDOWN) {
                let existingBody = '';
                try {
                    const getLogResult = await platformModule.getCallLog({
                        user,
                        telephonySessionId: existingCallLog.id,
                        callLogId: existingCallLog.thirdPartyLogId,
                        contactId: existingCallLog.contactId,
                        authHeader,
                        proxyConfig,
                    });
                    existingCallLogDetails = getLogResult?.callLogInfo?.fullLogResponse;
                    // Extract existing body from the platform-specific response
                    if (getLogResult.callLogInfo?.fullBody) {
                        existingBody = getLogResult.callLogInfo.fullBody;
                    } else if (getLogResult.callLogInfo?.note) {
                        existingBody = getLogResult.callLogInfo.note;
                    }
                } catch (error) {
                    logger.error('Error getting existing log details, proceeding with empty body', { stack: error.stack });
                }
                composedLogDetails = composeCallLog({
                    logFormat,
                    existingBody,
                    callLog: {
                        sessionId: existingCallLog.sessionId,
                        startTime: incomingData.startTime,
                        duration: incomingData.duration,
                        result: incomingData.result,
                        direction: incomingData.direction,
                        from: incomingData.from,
                        to: incomingData.to,
                        legs: incomingData.legs || [],
                    },
                    contactInfo: null, // Not needed for updates
                    user,
                    note: incomingData.note,
                    aiNote: incomingData.aiNote,
                    transcript: incomingData.transcript,
                    recordingLink: incomingData.recordingLink,
                    subject: incomingData.subject,
                    startTime: incomingData.startTime,
                    duration: incomingData.duration,
                    result: incomingData.result,
                    ringSenseTranscript: incomingData.ringSenseTranscript,
                    ringSenseSummary: incomingData.ringSenseSummary,
                    ringSenseAIScore: incomingData.ringSenseAIScore,
                    ringSenseBulletedSummary: incomingData.ringSenseBulletedSummary,
                    ringSenseLink: incomingData.ringSenseLink,
                });
            }

            let { updatedNote, returnMessage, extraDataTracking } = await platformModule.updateCallLog({
                user,
                existingCallLog,
                authHeader,
                recordingLink: incomingData.recordingLink,
                recordingDownloadLink: incomingData.recordingDownloadLink,
                subject: incomingData.subject,
                note: incomingData.note,
                startTime: incomingData.startTime,
                duration: incomingData.duration,
                result: incomingData.result,
                aiNote: incomingData.aiNote,
                transcript: incomingData.transcript,
                legs: incomingData.legs || [],
                ringSenseTranscript: incomingData.ringSenseTranscript,
                ringSenseSummary: incomingData.ringSenseSummary,
                ringSenseAIScore: incomingData.ringSenseAIScore,
                ringSenseBulletedSummary: incomingData.ringSenseBulletedSummary,
                ringSenseLink: incomingData.ringSenseLink,
                additionalSubmission: incomingData.additionalSubmission,
                composedLogDetails,
                existingCallLogDetails,  // Pass the fetched details to avoid duplicate API calls
                hashedAccountId,
                isFromSSCL,
                proxyConfig,
            });
            if (asyncCallPlugins.length) {
                await dispatchAsyncCallPlugins({
                    asyncCallPlugins,
                    incomingData,
                    user,
                    platform,
                    operation: 'updateCallLog',
                    existingCallLog,
                    hashedAccountId,
                    isFromSSCL,
                });
            }
            return {
                successful: true,
                logId: existingCallLog.thirdPartyLogId,
                updatedNote,
                returnMessage: mergePluginWarnings({ returnMessage, warningMessages: pluginWarnings }),
                extraDataTracking,
            };
        }
        return { successful: false };
    } catch (e) {
        return handleApiError(e, platform, 'updateCallLog', { userId });
    }
}

async function createMessageLog({ platform, userId, incomingData }) {
    try {
        let returnMessage = null;
        let extraDataTracking = {};
        if (incomingData.logInfo.messages.length === 0) {
            return {
                successful: false,
                returnMessage:
                {
                    message: 'No message to log.',
                    messageType: 'warning',
                    ttl: 3000
                }
            }
        }
        const platformModule = connectorRegistry.getConnector(platform);
        const contactNumber = incomingData.logInfo.correspondents[0].phoneNumber;
        const additionalSubmission = incomingData.additionalSubmission;
        let user = null;
        try {
            user = await UserModel.findByPk(userId);
        }
        catch (error) {
            return handleDatabaseError(error, 'Error finding user');
        }
        if (!user || !user.accessToken) {
            return {
                successful: false,
                returnMessage:
                {
                    message: `Contact not found`,
                    messageType: 'warning',
                    ttl: 5000
                }
            };
        }
        const proxyId = user.platformAdditionalInfo?.proxyId;
        let proxyConfig = null;
        if (proxyId) {
            proxyConfig = await Connector.getProxyConfig(proxyId);
        }
        const authType = await platformModule.getAuthType({ proxyId, proxyConfig });
        let authHeader = '';
        switch (authType) {
            case 'oauth':
                const oauthApp = oauth.getOAuthApp((await platformModule.getOauthInfo({ tokenUrl: user?.platformAdditionalInfo?.tokenUrl, hostname: user?.hostname, proxyId, proxyConfig })));
                user = await oauth.checkAndRefreshAccessToken(oauthApp, user);
                if (!user) {
                    return {
                        successful: false,
                        returnMessage: {
                            message: `User session expired. Please connect again.`,
                            messageType: 'warning',
                            ttl: 5000
                        },
                        isRevokeUserSession: true
                    }
                }
                authHeader = `Bearer ${user.accessToken}`;
                break;
            case 'apiKey':
                const basicAuth = platformModule.getBasicAuth({ apiKey: user.accessToken });
                authHeader = `Basic ${basicAuth}`;
                break;
        }
        const contactId = incomingData.contactId;
        if (!contactId) {
            return {
                successful: false,
                returnMessage:
                {
                    message: `Contact not found for number ${contactNumber}`,
                    messageType: 'warning',
                    ttl: 5000
                }
            };
        }
        const contactInfo = {
            id: contactId,
            phoneNumber: contactNumber,
            type: incomingData.contactType ?? "",
            name: incomingData.contactName ?? ""
        };
        const isGroupSMS = incomingData.logInfo.correspondents.length > 1;
        // For shared SMS
        const assigneeName = incomingData.logInfo.assignee?.name;
        const ownerName = incomingData.logInfo.owner?.name;
        const isSharedSMS = !!ownerName;

        const pluginWarnings = [];
        // Plugins
        const isSMS = incomingData.logInfo.messages.some(m => m.type === 'SMS');
        const isFax = incomingData.logInfo.messages.some(m => m.type === 'Fax');
        const accountPlugins = await pluginCore.getPluginsFromRcAccountId({ rcAccountId: user.rcAccountId });
        const smsPlugins = isSMS ? accountPlugins.filter(plugin => plugin.data.supportedLogTypes.includes('sms')) : [];
        const faxPlugins = isFax ? accountPlugins.filter(plugin => plugin.data.supportedLogTypes.includes('fax')) : [];
        const plugins = [...smsPlugins, ...faxPlugins];
        for (const plugin of plugins) {
            const pluginId = plugin.id;
            const pluginJwtToken = plugin.data.jwtToken;
            const pluginManifest = plugin.data;
            const pluginEndpointUrl = pluginManifest.endpointUrl;
            if (!pluginEndpointUrl) {
                throw new Error('Plugin URL is not set');
            }
            const userConfig = pluginCore.getPluginConfigFromUserSettings({ userSettings: user.userSettings, pluginId });
            if (plugin.data.isAsync) {
                try {
                    const syncPluginTokenResponse = await axios.post(plugin.data.tokenSyncUrl, {},
                        {
                            headers: {
                                Authorization: `Bearer ${pluginJwtToken}`,
                            },
                        }
                    );
                    const syncedPluginJwtToken = pluginCore.getRefreshedJwtTokenFromHeaders({ headers: syncPluginTokenResponse.headers });
                    axios.post(pluginEndpointUrl, {
                        data: { logInfo: incomingData },
                        config: userConfig,
                    }, {
                        headers: {
                            Authorization: `Bearer ${syncedPluginJwtToken ?? pluginJwtToken}`,
                        },
                    });
                    if (syncedPluginJwtToken) {
                        pluginCore.persistPluginData({
                            rcAccountId: user.rcAccountId,
                            platformName: platform,
                            pluginId,
                            jwtToken: syncedPluginJwtToken,
                        });
                    }
                }
                catch (error) {
                    logger.error('Error syncing plugin JWT token', { stack: error.stack });
                }
            }
            else {
                const processedResultResponse = await axios.post(pluginEndpointUrl, {
                    data: incomingData,
                    config: userConfig,
                }, {
                    headers: {
                        Authorization: `Bearer ${pluginJwtToken}`,
                    },
                });
                const refreshedPluginJwtToken = pluginCore.getRefreshedJwtTokenFromHeaders({ headers: processedResultResponse.headers });
                if (refreshedPluginJwtToken) {
                    pluginCore.persistPluginData({
                        rcAccountId: user.rcAccountId,
                        platformName: platform,
                        pluginId,
                        jwtToken: refreshedPluginJwtToken,
                    });
                }
                // eslint-disable-next-line no-param-reassign
                incomingData = processedResultResponse.data;
            }
        }

        let messageIds = [];
        const correspondents = [];
        if (isGroupSMS) {
            messageIds = incomingData.logInfo.messages.map(m => { return { id: m.id.toString() + `-${incomingData.contactId}` }; });
            for (var i = 0; i < incomingData.logInfo.correspondents.length; i++) {
                // find cached contact by composite key; findByPk expects raw PK values, so use where clause
                const correspondentContactInfo = await AccountDataModel.findOne({
                    where: {
                        rcAccountId: user.rcAccountId,
                        platformName: platform,
                        dataKey: `contact-${incomingData.logInfo.correspondents[i].phoneNumber}`
                    }
                })
                if (correspondentContactInfo && correspondentContactInfo.data[0]?.name != incomingData.contactName) {
                    correspondents.push(correspondentContactInfo.data);
                }
            }
        }
        else {
            messageIds = incomingData.logInfo.messages.map(m => { return { id: m.id.toString() }; });
        }
        let existingMessages = null;
        try {
            existingMessages = await MessageLogModel.findAll({
                where: {
                    [Op.or]: messageIds
                }
            });
        }
        catch (error) {
            return handleDatabaseError(error, 'Error finding existing messages');
        }
        const existingIds = existingMessages.map(m => m.id);
        const logIds = [];
        // Case: Shared SMS
        if (isSharedSMS) {
            const existingMessageLog = await MessageLogModel.findOne({
                where: {
                    conversationLogId: incomingData.logInfo.conversationLogId
                }
            });
            const sharedSMSLogContent = composeSharedSMSLog({ logFormat: platformModule.getLogFormatType(platform, proxyConfig), conversation: incomingData.logInfo, contactName: contactInfo.name, timezoneOffset: user.timezoneOffset });
            if (existingMessageLog) {
                const updateMessageResult = await platformModule.updateMessageLog({ user, contactInfo, sharedSMSLogContent, existingMessageLog: existingMessageLog, authHeader, additionalSubmission, proxyConfig });
                returnMessage = updateMessageResult?.returnMessage;
            }
            else {
                const createMessageLogResult = await platformModule.createMessageLog({ user, contactInfo, sharedSMSLogContent, authHeader, additionalSubmission, proxyConfig });
                returnMessage = createMessageLogResult?.returnMessage;
                extraDataTracking = createMessageLogResult.extraDataTracking;
                if (createMessageLogResult.logId) {
                    const createdMessageLog =
                        await MessageLogModel.create({
                            id: incomingData.logInfo.conversationLogId,
                            platform,
                            conversationId: incomingData.logInfo.conversationId,
                            thirdPartyLogId: createMessageLogResult.logId,
                            userId,
                            conversationLogId: incomingData.logInfo.conversationLogId
                        });
                    logIds.push(createdMessageLog.id);
                }
            }
        }
        // Case: normal SMS
        else {
            if (isGroupSMS) {
                // eslint-disable-next-line no-param-reassign
                incomingData.logInfo.conversationLogId = incomingData.logInfo.conversationLogId + `-${incomingData.contactId}`;
                // eslint-disable-next-line no-param-reassign
                incomingData.logInfo.conversationId = incomingData.logInfo.conversationId + `-${incomingData.contactId}`;
            }
            // reverse the order of messages to log the oldest message first
            const reversedMessages = incomingData.logInfo.messages.reverse();
            for (const message of reversedMessages) {
                if (isGroupSMS) {
                    message.id = message.id.toString() + `-${incomingData.contactId}`;
                }
                if (existingIds.includes(message.id.toString())) {
                    continue;
                }
                let recordingLink = null;
                if (message.attachments && message.attachments.some(a => a.type === 'AudioRecording')) {
                    recordingLink = message.attachments.find(a => a.type === 'AudioRecording').link;
                }
                let faxDocLink = null;
                let faxDownloadLink = null;
                if (message.attachments && message.attachments.some(a => a.type === 'RenderedDocument') && incomingData.logInfo.rcAccessToken) {
                    faxDocLink = message.attachments.find(a => a.type === 'RenderedDocument').link;
                    faxDownloadLink = message.attachments.find(a => a.type === 'RenderedDocument').uri + `?access_token=${incomingData.logInfo.rcAccessToken}`
                }
                let imageLink = null;
                let imageDownloadLink = null;
                let imageContentType = null;
                if (message.attachments && message.attachments.some(a => a.type === 'MmsAttachment' && a.contentType.startsWith('image/')) && incomingData.logInfo.rcAccessToken) {
                    const imageAttachment = message.attachments.find(a => a.type === 'MmsAttachment' && a.contentType.startsWith('image/'));
                    if (imageAttachment) {
                        imageLink = getMediaReaderLinkByPlatformMediaLink(imageAttachment?.uri);
                        imageDownloadLink = imageAttachment?.uri + `?access_token=${incomingData.logInfo.rcAccessToken}`;
                        imageContentType = imageAttachment?.contentType;
                    }
                }
                let videoLink = null;
                if (message.attachments && message.attachments.some(a => a.type === 'MmsAttachment')) {
                    const imageAttachment = message.attachments.find(a => a.type === 'MmsAttachment' && a.contentType.startsWith('image/'));
                    if (imageAttachment) {
                        imageLink = getMediaReaderLinkByPlatformMediaLink(imageAttachment?.uri);
                    }
                    const videoAttachment = message.attachments.find(a => a.type === 'MmsAttachment' && a.contentType.startsWith('video/'));
                    if (videoAttachment) {
                        videoLink = getMediaReaderLinkByPlatformMediaLink(videoAttachment?.uri);
                    }
                }
                const existingSameDateMessageLog = await MessageLogModel.findOne({
                    where: {
                        conversationLogId: incomingData.logInfo.conversationLogId
                    }
                });
                let crmLogId = ''
                if (existingSameDateMessageLog) {
                    const updateMessageResult = await platformModule.updateMessageLog({ user, contactInfo, assigneeName, ownerName, existingMessageLog: existingSameDateMessageLog, message, authHeader, additionalSubmission, imageLink, imageDownloadLink, imageContentType, videoLink, proxyConfig });
                    crmLogId = existingSameDateMessageLog.thirdPartyLogId;
                    returnMessage = updateMessageResult?.returnMessage;
                    extraDataTracking = updateMessageResult.extraDataTracking;
                }
                else {
                    const createMessageLogResult = await platformModule.createMessageLog({ user, contactInfo, correspondents, assigneeName, ownerName, authHeader, message, additionalSubmission, recordingLink, faxDocLink, faxDownloadLink, imageLink, imageDownloadLink, imageContentType, videoLink, proxyConfig });
                    crmLogId = createMessageLogResult.logId;
                    returnMessage = createMessageLogResult?.returnMessage;
                    extraDataTracking = createMessageLogResult.extraDataTracking;
                }
                if (crmLogId) {
                    try {
                        const createdMessageLog =
                            await MessageLogModel.create({
                                id: message.id.toString(),
                                platform,
                                conversationId: incomingData.logInfo.conversationId,
                                thirdPartyLogId: crmLogId,
                                userId,
                                conversationLogId: incomingData.logInfo.conversationLogId
                            });
                        logIds.push(createdMessageLog.id);
                    } catch (error) {
                        return handleDatabaseError(error, 'Error creating message log');
                    }
                }
            }
        }
        return {
            successful: true,
            logIds,
            returnMessage: mergePluginWarnings({ returnMessage, warningMessages: pluginWarnings }),
            extraDataTracking
        };
    }
    catch (e) {
        return handleApiError(e, platform, 'createMessageLog', { userId });
    }
}

async function saveNoteCache({ platform, userId, sessionId, note }) {
    try {
        const now = moment();
        await NoteCache.create({ sessionId, note, ttl: now.unix() + 3600 });
        return { successful: true, returnMessage: 'Note cache saved' };
    } catch (e) {
        return handleApiError(e, platform, 'saveNoteCache', { userId, sessionId, note });
    }
}

exports.createCallLog = createCallLog;
exports.updateCallLog = updateCallLog;
exports.createMessageLog = createMessageLog;
exports.getCallLog = getCallLog;
exports.saveNoteCache = saveNoteCache;
exports.handleAsyncPluginCallback = handleAsyncPluginCallback;

export {};
