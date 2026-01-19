const Op = require('sequelize').Op;
const { CallLogModel } = require('../models/callLogModel');
const { MessageLogModel } = require('../models/messageLogModel');
const { UserModel } = require('../models/userModel');
const { CacheModel } = require('../models/cacheModel');
const oauth = require('../lib/oauth');
const { composeCallLog } = require('../lib/callLogComposer');
const { composeSharedSMSLog } = require('../lib/sharedSMSComposer');
const connectorRegistry = require('../connector/registry');
const { LOG_DETAILS_FORMAT_TYPE } = require('../lib/constants');
const { NoteCache } = require('../models/dynamo/noteCacheSchema');
const { Connector } = require('../models/dynamo/connectorSchema');
const moment = require('moment');
const { getMediaReaderLinkByPlatformMediaLink } = require('../lib/util');
const axios = require('axios');
const { getProcessorsFromUserSettings } = require('../lib/util');
const logger = require('../lib/logger');
const { handleApiError, handleDatabaseError } = require('../lib/errorHandler');
const { v4: uuidv4 } = require('uuid');

async function createCallLog({ jwtToken, platform, userId, incomingData, hashedAccountId, isFromSSCL }) {
    try {
        let existingCallLog = null;
        try {
            existingCallLog = await CallLogModel.findOne({
                where: {
                    sessionId: incomingData.logInfo.sessionId
                }
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
        const ptpAsyncTaskIds = [];
        // Pass-thru processors
        const beforeLoggingProcessor = getProcessorsFromUserSettings({ userSettings: user.userSettings, phase: 'beforeLogging', logType: 'call' });
        for (const processorSetting of beforeLoggingProcessor) {
            const processorId = processorSetting.id;
            const processorDataResponse = await axios.get(`${process.env.DEV_PORTAL_URL}/public-api/connectors/${processorId}/manifest?type=processor`);
            const processorData = processorDataResponse.data;
            const processorManifest = processorData.platforms[processorSetting.value.name];
            let processorEndpointUrl = processorManifest.endpointUrl;
            if (!processorEndpointUrl) {
                throw new Error('Processor URL is not set');
            }
            else {
                // check if endpoint has query params already
                if (processorEndpointUrl.includes('?')) {
                    processorEndpointUrl += `&jwtToken=${jwtToken}`;
                }
                else {
                    processorEndpointUrl += `?jwtToken=${jwtToken}`;
                }
            }
            if (processorSetting.value.isAsync) {
                const asyncTaskId = `${userId}-${uuidv4()}`;
                ptpAsyncTaskIds.push(asyncTaskId);
                await CacheModel.create({
                    id: asyncTaskId,
                    status: 'initialized',
                    userId,
                    cacheKey: `ptpTask-${processorSetting.value.name}`,
                    expiry: moment().add(1, 'hour').toDate()
                });
                axios.post(processorEndpointUrl, {
                    data: incomingData,
                    asyncTaskId
                });
            }
            else {
                const processedResultResponse = await axios.post(processorEndpointUrl, {
                    data: incomingData
                });
                // eslint-disable-next-line no-param-reassign
                incomingData = processedResultResponse.data;
            }
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

        const { logId, returnMessage, extraDataTracking } = await platformModule.createCallLog({
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
        if (logId) {
            try {
                await CallLogModel.create({
                    id: incomingData.logInfo.telephonySessionId || incomingData.logInfo.id,
                    sessionId: incomingData.logInfo.sessionId,
                    platform,
                    thirdPartyLogId: logId,
                    userId,
                    contactId
                });
            }
            catch (error) {
                return handleDatabaseError(error, 'Error creating call log');
            }
            // after-logging processor
            const afterLoggingProcessor = getProcessorsFromUserSettings({ userSettings: user.userSettings, phase: 'afterLogging', logType: 'call' });
            for (const processorSetting of afterLoggingProcessor) {
                const processorId = processorSetting.id;
                const processorDataResponse = await axios.get(`${process.env.DEV_PORTAL_URL}/public-api/connectors/${processorId}/manifest?type=processor`);
                const processorData = processorDataResponse.data;
                const processorManifest = processorData.platforms[processorSetting.value.name];
                let processorEndpointUrl = processorManifest.endpointUrl;
                if (!processorEndpointUrl) { throw new Error('Processor URL is not set'); }
                else {
                    if (processorEndpointUrl.includes('?')) {
                        processorEndpointUrl += `&jwtToken=${jwtToken}`;
                    }
                    else {
                        processorEndpointUrl += `?jwtToken=${jwtToken}`;
                    }
                }
                if (processorSetting.value.isAsync) {
                    const asyncTaskId = `${userId}-${uuidv4()}`;
                    ptpAsyncTaskIds.push(asyncTaskId);
                    await CacheModel.create({
                        id: asyncTaskId,
                        status: 'initialized',
                        userId,
                        cacheKey: `ptpTask-${processorSetting.value.name}`,
                        expiry: moment().add(1, 'hour').toDate()
                    });
                    axios.post(processorEndpointUrl, {
                        data: {
                            ...incomingData,
                            logId,
                            text: returnMessage?.message ?? ''
                        },
                        asyncTaskId
                    });
                }
                else {
                    const processedResultResponse = await axios.post(processorEndpointUrl, {
                        data: {
                            ...incomingData,
                            logId,
                            text: returnMessage?.message ?? ''
                        }
                    }
                    );
                }
            }
            return { successful: !!logId, logId, returnMessage, extraDataTracking, ptpAsyncTaskIds };
        }
    } catch (e) {
        return handleApiError(e, platform, 'createCallLog', { userId });
    }
}

async function getCallLog({ userId, sessionIds, platform, requireDetails }) {
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
                    authHeader = `Bearer ${user.accessToken}`;
                    break;
                case 'apiKey':
                    const basicAuth = platformModule.getBasicAuth({ apiKey: user.accessToken });
                    authHeader = `Basic ${basicAuth}`;
                    break;
            }
            const callLogs = await CallLogModel.findAll({
                where: {
                    sessionId: {
                        [Op.in]: sessionIdsArray
                    }
                }
            });
            for (const sId of sessionIdsArray) {
                if (sId == 0) {
                    logs.push({ sessionId: sId, matched: false });
                    continue;
                }
                const callLog = callLogs.find(c => c.sessionId === sId);
                if (!callLog) {
                    logs.push({ sessionId: sId, matched: false });
                }
                else {
                    const getCallLogResult = await platformModule.getCallLog({ user, callLogId: callLog.thirdPartyLogId, contactId: callLog.contactId, authHeader, proxyConfig });
                    returnMessage = getCallLogResult.returnMessage;
                    extraDataTracking = getCallLogResult.extraDataTracking;
                    logs.push({ sessionId: callLog.sessionId, matched: true, logId: callLog.thirdPartyLogId, logData: getCallLogResult.callLogInfo });
                }
            }
        }
        else {
            const callLogs = await CallLogModel.findAll({
                where: {
                    sessionId: {
                        [Op.in]: sessionIdsArray
                    }
                }
            });
            for (const sId of sessionIdsArray) {
                const callLog = callLogs.find(c => c.sessionId === sId);
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
        return handleApiError(e, platform, 'getCallLog', { userId, sessionIds, requireDetails });
    }
}

async function updateCallLog({ jwtToken, platform, userId, incomingData, hashedAccountId, isFromSSCL }) {
    try {
        let existingCallLog = null;
        try {
            existingCallLog = await CallLogModel.findOne({
                where: {
                    sessionId: incomingData.sessionId
                }
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
            const ptpAsyncTaskIds = [];
            // Pass-thru processors
            const beforeLoggingProcessor = getProcessorsFromUserSettings({ userSettings: user.userSettings, phase: 'beforeLogging', logType: 'call' });
            for (const processorSetting of beforeLoggingProcessor) {
                const processorId = processorSetting.id;
                const processorDataResponse = await axios.get(`${process.env.DEV_PORTAL_URL}/public-api/connectors/${processorId}/manifest?type=processor`);
                const processorData = processorDataResponse.data;
                const processorManifest = processorData.platforms[processorSetting.value.name];
                let processorEndpointUrl = processorManifest.endpointUrl;
                if (!processorEndpointUrl) {
                    throw new Error('Processor URL is not set');
                }
                else {
                    if (processorEndpointUrl.includes('?')) {
                        processorEndpointUrl += `&jwtToken=${jwtToken}`;
                    }
                    else {
                        processorEndpointUrl += `?jwtToken=${jwtToken}`;
                    }
                }
                if (processorSetting.value.isAsync) {
                    const asyncTaskId = `${userId}-${uuidv4()}`;
                    ptpAsyncTaskIds.push(asyncTaskId);
                    await CacheModel.create({
                        id: asyncTaskId,
                        status: 'initialized',
                        userId,
                        cacheKey: `ptpTask-${processorSetting.value.name}`,
                        expiry: moment().add(1, 'hour').toDate()
                    });
                    axios.post(processorEndpointUrl, {
                        data: { logInfo: { ...incomingData } },
                        asyncTaskId
                    });
                }
                else {
                    const processedResultResponse = await axios.post(processorEndpointUrl, {
                        data: { logInfo: { ...incomingData } }
                    });
                    // eslint-disable-next-line no-param-reassign
                    incomingData = processedResultResponse.data;
                }
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
                    authHeader = `Bearer ${user.accessToken}`;
                    break;
                case 'apiKey':
                    const basicAuth = platformModule.getBasicAuth({ apiKey: user.accessToken });
                    authHeader = `Basic ${basicAuth}`;
                    break;
            }

            // Fetch existing call log details once to avoid duplicate API calls
            let existingCallLogDetails = null;    // Compose updated call log details centrally
            const logFormat = platformModule.getLogFormatType ? platformModule.getLogFormatType(platform, proxyConfig) : LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT;
            let composedLogDetails = '';
            if (logFormat === LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT || logFormat === LOG_DETAILS_FORMAT_TYPE.HTML || logFormat === LOG_DETAILS_FORMAT_TYPE.MARKDOWN) {
                let existingBody = '';
                try {
                    const getLogResult = await platformModule.getCallLog({
                        user,
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

            const { updatedNote, returnMessage, extraDataTracking } = await platformModule.updateCallLog({
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
            // after-logging processor
            const afterLoggingProcessor = getProcessorsFromUserSettings({ userSettings: user.userSettings, phase: 'afterLogging', logType: 'call' });
            for (const processorSetting of afterLoggingProcessor) {
                const processorId = processorSetting.id;
                const processorDataResponse = await axios.get(`${process.env.DEV_PORTAL_URL}/public-api/connectors/${processorId}/manifest?type=processor`);
                const processorData = processorDataResponse.data;
                const processorManifest = processorData.platforms[processorSetting.value.name];
                let processorEndpointUrl = processorManifest.endpointUrl;
                if (!processorEndpointUrl) { throw new Error('Processor URL is not set'); }
                else {
                    // check if endpoint has query params already
                    if (processorEndpointUrl.includes('?')) {
                        processorEndpointUrl += `&jwtToken=${jwtToken}`;
                    }
                    else {
                        processorEndpointUrl += `?jwtToken=${jwtToken}`;
                    }
                }
                if (processorSetting.value.isAsync) {
                    const asyncTaskId = `${userId}-${uuidv4()}`;
                    ptpAsyncTaskIds.push(asyncTaskId);
                    await CacheModel.create({
                        id: asyncTaskId,
                        status: 'initialized',
                        userId,
                        cacheKey: `ptpTask-${processorSetting.value.name}`,
                        expiry: moment().add(1, 'hour').toDate()
                    });
                    axios.post(processorEndpointUrl, {
                        data: {
                            logInfo: { ...incomingData },
                            logId: existingCallLog.id,
                            text: returnMessage?.message ?? ''
                        },
                        asyncTaskId
                    });
                }
                else {
                    await axios.post(processorEndpointUrl, {
                        data: {
                            logInfo: { ...incomingData },
                            logId: existingCallLog.id,
                            text: returnMessage?.message ?? ''
                        }
                    }
                    );
                }
            }
            return { successful: true, logId: existingCallLog.thirdPartyLogId, updatedNote, returnMessage, extraDataTracking, ptpAsyncTaskIds };
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
        // For shared SMS
        const assigneeName = incomingData.logInfo.assignee?.name;
        const ownerName = incomingData.logInfo.owner?.name;
        const isSharedSMS = !!ownerName;

        const messageIds = incomingData.logInfo.messages.map(m => { return { id: m.id.toString() }; });
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
            const entities = incomingData.logInfo.entities;
            const sharedSMSLogContent = composeSharedSMSLog({ logFormat: platformModule.getLogFormatType(platform, proxyConfig), conversation: incomingData.logInfo, contactName: contactInfo.name, timezoneOffset: user.timezoneOffset });
            if (existingMessageLog) {
                const updateMessageResult = await platformModule.updateMessageLog({ user, contactInfo, sharedSMSLogContent, existingMessageLog: existingMessageLog, authHeader, additionalSubmission, proxyConfig });
                returnMessage = updateMessageResult?.returnMessage;
            }
            else {
                const createMessageLogResult = await platformModule.createMessageLog({ user, contactInfo, sharedSMSLogContent, authHeader, additionalSubmission, proxyConfig });
                const crmLogId = createMessageLogResult.logId;
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
            // reverse the order of messages to log the oldest message first
            const reversedMessages = incomingData.logInfo.messages.reverse();
            for (const message of reversedMessages) {
                if (existingIds.includes(message.id.toString())) {
                    continue;
                }
                let recordingLink = null;
                if (message.attachments && message.attachments.some(a => a.type === 'AudioRecording')) {
                    recordingLink = message.attachments.find(a => a.type === 'AudioRecording').link;
                }
                let faxDocLink = null;
                let faxDownloadLink = null;
                if (message.attachments && message.attachments.some(a => a.type === 'RenderedDocument')) {
                    faxDocLink = message.attachments.find(a => a.type === 'RenderedDocument').link;
                    faxDownloadLink = message.attachments.find(a => a.type === 'RenderedDocument').uri + `?access_token=${incomingData.logInfo.rcAccessToken}`
                }
                let imageLink = null;
                let imageDownloadLink = null;
                let imageContentType = null;
                if (message.attachments && message.attachments.some(a => a.type === 'MmsAttachment' && a.contentType.startsWith('image/'))) {
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
                if (existingSameDateMessageLog) {
                    const updateMessageResult = await platformModule.updateMessageLog({ user, contactInfo, assigneeName, ownerName, existingMessageLog: existingSameDateMessageLog, message, authHeader, additionalSubmission, imageLink, videoLink, proxyConfig });
                    returnMessage = updateMessageResult?.returnMessage;
                }
                else {
                    const createMessageLogResult = await platformModule.createMessageLog({ user, contactInfo, assigneeName, ownerName, authHeader, message, additionalSubmission, recordingLink, faxDocLink, faxDownloadLink, imageLink, imageDownloadLink, imageContentType, videoLink, proxyConfig });
                    const crmLogId = createMessageLogResult.logId;
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
                    returnMessage = createMessageLogResult?.returnMessage;
                    extraDataTracking = createMessageLogResult.extraDataTracking;
                }
            }
        }
        return { successful: true, logIds, returnMessage, extraDataTracking };
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