const express = require('express');
const cors = require('cors')
const bodyParser = require('body-parser');
require('body-parser-xml')(bodyParser);
const dynamoose = require('dynamoose');
const axios = require('axios');
const { UserModel } = require('./models/userModel');
const { CallDownListModel } = require('./models/callDownListModel');
const { Op } = require('sequelize');
const { CallLogModel } = require('./models/callLogModel');
const { MessageLogModel } = require('./models/messageLogModel');
const { AdminConfigModel } = require('./models/adminConfigModel');
const { CacheModel } = require('./models/cacheModel');
const { AccountDataModel } = require('./models/accountDataModel');
const jwt = require('./lib/jwt');
const logCore = require('./handlers/log');
const contactCore = require('./handlers/contact');
const authCore = require('./handlers/auth');
const adminCore = require('./handlers/admin');
const userCore = require('./handlers/user');
const dispositionCore = require('./handlers/disposition');
const mock = require('./connector/mock');
const proxyConnector = require('./connector/proxy');
const releaseNotes = require('./releaseNotes.json');
const analytics = require('./lib/analytics');
const util = require('./lib/util');
const connectorRegistry = require('./connector/registry');
const calldown = require('./handlers/calldown');
const { DebugTracer } = require('./lib/debugTracer');
const s3ErrorLogReport = require('./lib/s3ErrorLogReport');

let packageJson = null;
try {
    packageJson = require('./package.json');
}
catch (e) {
    packageJson = require('../package.json');
}

// For using dynamodb in local env
if (process.env.DYNAMODB_LOCALHOST) {
    dynamoose.aws.ddb.local(process.env.DYNAMODB_LOCALHOST);
}
// log axios requests
if (process.env.IS_PROD === 'false') {
    axios.interceptors.request.use(request => {
        console.log('Request:', `[${request.method}]`, request.url);
        return request;
    });
}
axios.defaults.headers.common['Unified-CRM-Extension-Version'] = packageJson.version;

async function initDB() {
    if (!process.env.DISABLE_SYNC_DB_TABLE) {
        console.log('creating db tables if not exist...');
        await UserModel.sync();
        await CallLogModel.sync();
        await MessageLogModel.sync();
        await AdminConfigModel.sync();
        await CacheModel.sync();
        await CallDownListModel.sync();
        await AccountDataModel.sync();
    }
}

function getAnalyticsVariablesInReqHeaders({ headers }) {
    const hashedExtensionId = headers['rc-extension-id'];
    const hashedAccountId = headers['rc-account-id'];
    const ip = headers['x-forwarded-for']?.split(',')?.find(i => !i.startsWith('10.'));
    const userAgent = headers['user-agent'];
    const author = headers['developer-author-name'];
    const eventAddedVia = headers['eventAddedVia'];
    return {
        hashedAccountId,
        hashedExtensionId,
        ip,
        userAgent,
        author,
        eventAddedVia
    }
}

// Create a router with all core routes
function createCoreRouter() {
    const router = express.Router();

    // Move all app.get, app.post, etc. to router.get, router.post, etc.
    router.get('/releaseNotes', async function (req, res) {
        const tracer = req.headers['is-debug'] === 'true' ? DebugTracer.fromRequest(req) : null;
        tracer?.trace('releaseNotes:start', { query: req.query });
        const globalReleaseNotes = releaseNotes;
        const connectorReleaseNotes = connectorRegistry.getReleaseNotes();
        const mergedReleaseNotes = {};
        const versions = Object.keys(connectorReleaseNotes);
        for (const version of versions) {
            mergedReleaseNotes[version] = {
                global: globalReleaseNotes[version]?.global ?? {},
                ...connectorReleaseNotes[version] ?? {}
            };
        }
        res.json(tracer ? tracer.wrapResponse(mergedReleaseNotes ?? {}) : (mergedReleaseNotes ?? {}));
    });
    // Obsolete
    router.get('/crmManifest', (req, res) => {
        try {
            const platformName = req.query.platformName || 'default';
            const crmManifest = connectorRegistry.getManifest(platformName);
            if (crmManifest) {
                // Override app server url for local development
                if (process.env.OVERRIDE_APP_SERVER) {
                    crmManifest.serverUrl = process.env.OVERRIDE_APP_SERVER;
                }
                // Override server side logging server url for local development
                if (process.env.OVERRIDE_SERVER_SIDE_LOGGING_SERVER && crmManifest.platforms) {
                    Object.keys(crmManifest.platforms).forEach(platformName => {
                        const platform = crmManifest.platforms[platformName];
                        if (platform.serverSideLogging) {
                            platform.serverSideLogging.url = process.env.OVERRIDE_SERVER_SIDE_LOGGING_SERVER;
                        }
                    });
                }
                if (!crmManifest.author?.name) {
                    throw 'author name is required';
                }
                res.json(crmManifest);
            }
            else {
                res.status(400).send('Platform not found');
            }
        }
        catch (e) {
            res.status(400).send('Platform not found');
        }
    });
    router.get('/isAlive', (req, res) => {
        res.send(`OK`);
    });
    router.get('/implementedInterfaces', (req, res) => {
        const tracer = req.headers['is-debug'] === 'true' ? DebugTracer.fromRequest(req) : null;
        tracer?.trace('implementedInterfaces:start', { query: req.query });
        try {
            const platform = req.query.platform;
            if (platform) {
                const platformModule = connectorRegistry.getConnector(platform);
                const result = {};
                const authType = platformModule.getAuthType();
                result.getAuthType = !!platformModule.getAuthType;
                switch (authType) {
                    case 'oauth':
                        result.getOauthInfo = !!platformModule.getOauthInfo;
                        break;
                    case 'apiKey':
                        result.getBasicAuth = !!platformModule.getBasicAuth;
                        break;
                }
                result.getUserInfo = !!platformModule.getUserInfo;
                result.createCallLog = !!platformModule.createCallLog;
                result.updateCallLog = !!platformModule.updateCallLog;
                result.getCallLog = !!platformModule.getCallLog;
                result.createMessageLog = !!platformModule.createMessageLog;
                result.updateMessageLog = !!platformModule.updateMessageLog;
                result.createContact = !!platformModule.createContact;
                result.findContact = !!platformModule.findContact;
                result.unAuthorize = !!platformModule.unAuthorize;
                result.upsertCallDisposition = !!platformModule.upsertCallDisposition;
                result.findContactWithName = !!platformModule.findContactWithName;
                result.getUserList = !!platformModule.getUserList;
                result.getLicenseStatus = !!platformModule.getLicenseStatus;
                result.getLogFormatType = !!platformModule.getLogFormatType;
                result.cacheCallNote = !!process.env.USE_CACHE;
                res.status(200).send(tracer ? tracer.wrapResponse(result) : result);
            }
            else {
                tracer?.trace('implementedInterfaces:noPlatform', {});
                res.status(400).send(tracer ? tracer.wrapResponse('Please provide platform.') : 'Please provide platform.');
                return;
            }
        }
        catch (e) {
            tracer?.traceError('implementedInterfaces:error', e);
            res.status(400).send(tracer ? tracer.wrapResponse({ error: e.message || e }) : { error: e.message || e });
        }
    });
    router.get('/licenseStatus', async (req, res) => {
        const requestStartTime = new Date().getTime();
        const tracer = req.headers['is-debug'] === 'true' ? DebugTracer.fromRequest(req) : null;
        tracer?.trace('licenseStatus:start', { query: req.query });
        let platformName = null;
        let success = false;
        let extraData = {};
        const { hashedExtensionId, hashedAccountId, userAgent, ip, author, eventAddedVia } = getAnalyticsVariablesInReqHeaders({ headers: req.headers })
        try {
            const jwtToken = req.query.jwtToken;
            if (jwtToken) {
                const { id: userId, platform } = jwt.decodeJwt(jwtToken);
                platformName = platform;
                if (!userId) {
                    tracer?.trace('licenseStatus:noUserId', {});
                    res.status(400).send(tracer ? tracer.wrapResponse('No user ID') : 'No user ID');
                    success = true;
                }
                const licenseStatus = await authCore.getLicenseStatus({ userId, platform });
                res.status(200).send(tracer ? tracer.wrapResponse(licenseStatus) : licenseStatus);
                success = true;
            }
            else {
                res.status(200).send(tracer ? tracer.wrapResponse({
                    isLicenseValid: false,
                    licenseStatus: 'Invalid (Invalid user session)',
                    licenseStatusDescription: ''
                }) : {
                    isLicenseValid: false,
                    licenseStatus: 'Invalid (Invalid user session)',
                    licenseStatusDescription: ''
                });
                success = true;
            }
        }
        catch (e) {
            res.status(200).send(tracer ? tracer.wrapResponse({
                isLicenseValid: false,
                licenseStatus: 'Invalid (Connect to get license status)',
                licenseStatusDescription: ''
            }) : {
                isLicenseValid: false,
                licenseStatus: 'Invalid (Connect to get license status)',
                licenseStatusDescription: ''
            });
            success = false;
        }
        const requestEndTime = new Date().getTime();
        analytics.track({
            eventName: 'Check license status',
            interfaceName: 'checkLicenseStatus',
            connectorName: platformName,
            accountId: hashedAccountId,
            extensionId: hashedExtensionId,
            success,
            requestDuration: (requestEndTime - requestStartTime) / 1000,
            userAgent,
            ip,
            author,
            extras: {
                ...extraData
            },
            eventAddedVia
        });
    });
    router.get('/authValidation', async (req, res) => {
        const requestStartTime = new Date().getTime();
        const tracer = req.headers['is-debug'] === 'true' ? DebugTracer.fromRequest(req) : null;
        tracer?.trace('authValidation:start', { query: req.query });
        let platformName = null;
        let success = false;
        let validationPass = false;
        let reason = '';
        let statusCode = 200;
        const { hashedExtensionId, hashedAccountId, userAgent, ip, author, eventAddedVia } = getAnalyticsVariablesInReqHeaders({ headers: req.headers })
        try {
            const jwtToken = req.query.jwtToken;
            if (jwtToken) {
                const decodedToken = jwt.decodeJwt(jwtToken);
                if (!decodedToken) {
                    tracer?.trace('authValidation:invalidJwtToken', {});
                    res.status(400).send(tracer ? tracer.wrapResponse('Invalid JWT token') : 'Invalid JWT token');
                    return;
                }
                const { id: userId, platform } = decodedToken;
                platformName = platform;
                const { successful, returnMessage, failReason, status } = await authCore.authValidation({ platform, userId });
                success = true;
                validationPass = successful;
                reason = failReason;
                statusCode = status;
                res.status(200).send(tracer ? tracer.wrapResponse({ successful, returnMessage }) : { successful, returnMessage });
            }
            else {
                tracer?.trace('authValidation:noToken', {});
                res.status(400).send(tracer ? tracer.wrapResponse('Please go to Settings and authorize CRM platform') : 'Please go to Settings and authorize CRM platform');
                success = false;
            }
        }
        catch (e) {
            console.log(`platform: ${platformName} \n${e.stack}`);
            tracer?.traceError('authValidation:error', e);
            statusCode = e.response?.status ?? 'unknown';
            res.status(400).send(tracer ? tracer.wrapResponse({ error: e.message || e }) : { error: e.message || e });
            success = false;
        }
        const requestEndTime = new Date().getTime();
        analytics.track({
            eventName: 'Auth validation',
            interfaceName: 'authValidation',
            connectorName: platformName,
            accountId: hashedAccountId,
            extensionId: hashedExtensionId,
            success,
            requestDuration: (requestEndTime - requestStartTime) / 1000,
            userAgent,
            ip,
            author,
            extras: {
                validationPass,
                reason,
                statusCode
            },
            eventAddedVia
        });
    });
    // Obsolete
    router.get('/serverVersionInfo', (req, res) => {
        const defaultCrmManifest = connectorRegistry.getManifest('default');
        res.send({ version: defaultCrmManifest?.version ?? 'unknown' });
    });
    router.post('/admin/settings', async function (req, res) {
        const requestStartTime = new Date().getTime();
        const tracer = req.headers['is-debug'] === 'true' ? DebugTracer.fromRequest(req) : null;
        tracer?.trace('setAdminSettings:start', { body: req.body });
        let success = false;
        const { hashedExtensionId, hashedAccountId, userAgent, ip, author, eventAddedVia } = getAnalyticsVariablesInReqHeaders({ headers: req.headers })
        try {
            const { isValidated, rcAccountId } = await adminCore.validateAdminRole({ rcAccessToken: req.query.rcAccessToken });
            const hashedRcAccountId = util.getHashValue(rcAccountId, process.env.HASH_KEY);
            if (isValidated) {
                await adminCore.upsertAdminSettings({ hashedRcAccountId, adminSettings: req.body.adminSettings });
                res.status(200).send(tracer ? tracer.wrapResponse('Admin settings updated') : 'Admin settings updated');
                success = true;
            }
            else {
                tracer?.trace('setAdminSettings:adminValidationFailed', {});
                res.status(401).send(tracer ? tracer.wrapResponse('Admin validation failed') : 'Admin validation failed');
                success = false;
            }
        }
        catch (e) {
            console.log(`${e.stack}`);
            tracer?.traceError('setAdminSettings:error', e);
            res.status(400).send(tracer ? tracer.wrapResponse({ error: e.message || e }) : { error: e.message || e });
            success = false;
        }
        const requestEndTime = new Date().getTime();
        analytics.track({
            eventName: 'Set admin settings',
            interfaceName: 'setAdminSettings',
            accountId: hashedAccountId,
            extensionId: hashedExtensionId,
            success,
            requestDuration: (requestEndTime - requestStartTime) / 1000,
            userAgent,
            ip,
            author,
            eventAddedVia
        });
    });
    router.get('/admin/settings', async function (req, res) {
        const requestStartTime = new Date().getTime();
        const tracer = req.headers['is-debug'] === 'true' ? DebugTracer.fromRequest(req) : null;
        tracer?.trace('getAdminSettings:start', { query: req.query });
        let platformName = null;
        let success = false;
        const { hashedExtensionId, hashedAccountId, userAgent, ip, author, eventAddedVia } = getAnalyticsVariablesInReqHeaders({ headers: req.headers })
        try {
            const jwtToken = req.query.jwtToken;
            if (jwtToken) {
                const unAuthData = jwt.decodeJwt(jwtToken);
                platformName = unAuthData?.platform ?? 'Unknown';
                const user = await UserModel.findByPk(unAuthData?.id);
                if (!user) {
                    tracer?.trace('getAdminSettings:userNotFound', {});
                    res.status(400).send(tracer ? tracer.wrapResponse('User not found') : 'User not found');
                    return;
                }
                const { isValidated, rcAccountId } = await adminCore.validateAdminRole({ rcAccessToken: req.query.rcAccessToken });
                const hashedRcAccountId = util.getHashValue(rcAccountId, process.env.HASH_KEY);
                if (isValidated) {
                    const adminSettings = await adminCore.getAdminSettings({ hashedRcAccountId });
                    if (adminSettings) {
                        res.status(200).send(tracer ? tracer.wrapResponse(adminSettings) : adminSettings);
                    }
                    else {
                        res.status(200).send(tracer ? tracer.wrapResponse({
                            customConnector: null,
                            userSettings: {}
                        }) : {
                            customConnector: null,
                            userSettings: {}
                        });
                    }
                    success = true;
                }
                else {
                    tracer?.trace('getAdminSettings:adminValidationFailed', {});
                    res.status(401).send(tracer ? tracer.wrapResponse('Admin validation failed') : 'Admin validation failed');
                    success = true;
                }
            }
            else {
                tracer?.trace('getAdminSettings:noToken', {});
                res.status(400).send(tracer ? tracer.wrapResponse('Please go to Settings and authorize CRM platform') : 'Please go to Settings and authorize CRM platform');
                success = false;
            }
        }
        catch (e) {
            console.log(`${e.stack}`);
            tracer?.traceError('getAdminSettings:error', e);
            res.status(400).send(tracer ? tracer.wrapResponse({ error: e.message || e }) : { error: e.message || e });
        }
        const requestEndTime = new Date().getTime();
        analytics.track({
            eventName: 'Get admin settings',
            interfaceName: 'getAdminSettings',
            connectorName: platformName,
            accountId: hashedAccountId,
            extensionId: hashedExtensionId,
            success,
            requestDuration: (requestEndTime - requestStartTime) / 1000,
            userAgent,
            ip,
            author,
            eventAddedVia
        });
    });
    router.post('/admin/userMapping', async function (req, res) {
        const requestStartTime = new Date().getTime();
        const tracer = req.headers['is-debug'] === 'true' ? DebugTracer.fromRequest(req) : null;
        tracer?.trace('getUserMapping:start', { query: req.query });
        let platformName = null;
        let success = false;
        const { hashedExtensionId, hashedAccountId, userAgent, ip, author, eventAddedVia } = getAnalyticsVariablesInReqHeaders({ headers: req.headers })
        try {
            const jwtToken = req.query.jwtToken;
            if (jwtToken) {
                const unAuthData = jwt.decodeJwt(jwtToken);
                platformName = unAuthData?.platform ?? 'Unknown';
                const user = await UserModel.findByPk(unAuthData?.id);
                if (!user) {
                    tracer?.trace('getUserMapping:userNotFound', {});
                    res.status(400).send(tracer ? tracer.wrapResponse('User not found') : 'User not found');
                    return;
                }
                const { isValidated, rcAccountId } = await adminCore.validateAdminRole({ rcAccessToken: req.query.rcAccessToken });
                const hashedRcAccountId = util.getHashValue(rcAccountId, process.env.HASH_KEY);
                if (isValidated) {
                    const userMapping = await adminCore.getUserMapping({ user, hashedRcAccountId, rcExtensionList: req.body.rcExtensionList });
                    res.status(200).send(tracer ? tracer.wrapResponse(userMapping) : userMapping);
                    success = true;
                }
                else {
                    tracer?.trace('getUserMapping:adminValidationFailed', {});
                    res.status(401).send(tracer ? tracer.wrapResponse('Admin validation failed') : 'Admin validation failed');
                    success = true;
                }
            }
            else {
                tracer?.trace('getUserMapping:noToken', {});
                res.status(400).send(tracer ? tracer.wrapResponse('Please go to Settings and authorize CRM platform') : 'Please go to Settings and authorize CRM platform');
                success = false;
            }
        }
        catch (e) {
            console.log(`${e.stack}`);
            tracer?.traceError('getUserMapping:error', e);
            res.status(400).send(tracer ? tracer.wrapResponse({ error: e.message || e }) : { error: e.message || e });
        }
        const requestEndTime = new Date().getTime();
        analytics.track({
            eventName: 'Get user mapping',
            interfaceName: 'getUserMapping',
            connectorName: platformName,
            accountId: hashedAccountId,
            extensionId: hashedExtensionId,
            success,
            requestDuration: (requestEndTime - requestStartTime) / 1000,
            userAgent,
            ip,
            author,
            eventAddedVia
        });
    });
    router.get('/admin/serverLoggingSettings', async function (req, res) {
        const requestStartTime = new Date().getTime();
        const tracer = req.headers['is-debug'] === 'true' ? DebugTracer.fromRequest(req) : null;
        tracer?.trace('getServerLoggingSettings:start', { query: req.query });
        let platformName = null;
        let success = false;
        const jwtToken = req.query.jwtToken;
        if (!jwtToken) {
            tracer?.trace('getServerLoggingSettings:noToken', {});
            res.status(400).send(tracer ? tracer.wrapResponse('Please go to Settings and authorize CRM platform') : 'Please go to Settings and authorize CRM platform');
            return;
        }
        const { hashedExtensionId, hashedAccountId, userAgent, ip, author, eventAddedVia } = getAnalyticsVariablesInReqHeaders({ headers: req.headers })
        try {
            const unAuthData = jwt.decodeJwt(jwtToken);
            if (!unAuthData?.id) {
                tracer?.trace('getServerLoggingSettings:noToken', {});
                res.status(400).send(tracer ? tracer.wrapResponse('Please go to Settings and authorize CRM platform') : 'Please go to Settings and authorize CRM platform');
                return;
            }
            platformName = unAuthData?.platform ?? 'Unknown';
            const user = await UserModel.findByPk(unAuthData?.id);
            if (!user) {
                tracer?.trace('getServerLoggingSettings:userNotFound', {});
                res.status(400).send(tracer ? tracer.wrapResponse('User not found') : 'User not found');
                return;
            }
            const serverLoggingSettings = await adminCore.getServerLoggingSettings({ user });
            res.status(200).send(tracer ? tracer.wrapResponse(serverLoggingSettings) : serverLoggingSettings);
            success = true;
        }
        catch (e) {
            console.log(`${e.stack}`);
            tracer?.traceError('getServerLoggingSettings:error', e);
            res.status(400).send(tracer ? tracer.wrapResponse({ error: e.message || e }) : { error: e.message || e });
        }
        const requestEndTime = new Date().getTime();
        analytics.track({
            eventName: 'Get server logging settings',
            interfaceName: 'getServerLoggingSettings',
            connectorName: platformName,
            accountId: hashedAccountId,
            extensionId: hashedExtensionId,
            success,
            requestDuration: (requestEndTime - requestStartTime) / 1000,
            userAgent,
            ip,
            author,
            eventAddedVia
        });
    });
    router.post('/admin/serverLoggingSettings', async function (req, res) {
        const requestStartTime = new Date().getTime();
        const tracer = req.headers['is-debug'] === 'true' ? DebugTracer.fromRequest(req) : null;
        tracer?.trace('setServerLoggingSettings:start', { body: req.body });
        let platformName = null;
        let success = false;
        const jwtToken = req.query.jwtToken;
        if (!jwtToken) {
            tracer?.trace('setServerLoggingSettings:noToken', {});
            res.status(400).send(tracer ? tracer.wrapResponse('Please go to Settings and authorize CRM platform') : 'Please go to Settings and authorize CRM platform');
            return;
        }
        if (!req.body.additionalFieldValues) {
            tracer?.trace('setServerLoggingSettings:missingAdditionalFieldValues', {});
            res.status(400).send(tracer ? tracer.wrapResponse('Missing additionalFieldValues') : 'Missing additionalFieldValues');
            return;
        }
        const { hashedExtensionId, hashedAccountId, userAgent, ip, author, eventAddedVia } = getAnalyticsVariablesInReqHeaders({ headers: req.headers })
        try {
            const unAuthData = jwt.decodeJwt(jwtToken);
            if (!unAuthData?.id) {
                tracer?.trace('setServerLoggingSettings:noToken', {});
                res.status(400).send(tracer ? tracer.wrapResponse('Please go to Settings and authorize CRM platform') : 'Please go to Settings and authorize CRM platform');
                return;
            }
            platformName = unAuthData?.platform ?? 'Unknown';
            const user = await UserModel.findByPk(unAuthData?.id);
            if (!user) {
                tracer?.trace('setServerLoggingSettings:userNotFound', {});
                res.status(400).send(tracer ? tracer.wrapResponse('User not found') : 'User not found');
                return;
            }
            const { successful, returnMessage } = await adminCore.updateServerLoggingSettings({ user, additionalFieldValues: req.body.additionalFieldValues });
            res.status(200).send(tracer ? tracer.wrapResponse({ successful, returnMessage }) : { successful, returnMessage });
            success = true;
        }
        catch (e) {
            console.log(`${e.stack}`);
            tracer?.traceError('setServerLoggingSettings:error', e);
            res.status(400).send(tracer ? tracer.wrapResponse({ successful: false, returnMessage: { messageType: 'warning', message: 'Server logging settings update failed', ttl: 5000 } }) : { successful: false, returnMessage: { messageType: 'warning', message: 'Server logging settings update failed', ttl: 5000 } });
            success = false;
        }
        const requestEndTime = new Date().getTime();
        analytics.track({
            eventName: 'Set server logging settings',
            interfaceName: 'setServerLoggingSettings',
            connectorName: platformName,
            accountId: hashedAccountId,
            extensionId: hashedExtensionId,
            success,
            requestDuration: (requestEndTime - requestStartTime) / 1000,
            userAgent,
            ip,
            author,
            eventAddedVia
        });
    })
    router.get('/user/preloadSettings', async function (req, res) {
        const tracer = req.headers['is-debug'] === 'true' ? DebugTracer.fromRequest(req) : null;
        tracer?.trace('getUserSettingsByAdmin:start', { query: req.query });
        try {
            const rcAccessToken = req.query.rcAccessToken;
            const rcAccountId = req.query.rcAccountId;
            if (rcAccessToken || rcAccountId) {
                const userSettings = await userCore.getUserSettingsByAdmin({ rcAccessToken, rcAccountId });
                res.status(200).send(tracer ? tracer.wrapResponse(userSettings) : userSettings);
            }
            else {
                tracer?.trace('getUserSettingsByAdmin:noRcAccessTokenOrRcAccountId', {});
                res.status(400).send(tracer ? tracer.wrapResponse('Cannot find rc user login') : 'Cannot find rc user login');
            }
        }
        catch (e) {
            console.log(`${e.stack}`);
            tracer?.traceError('getUserSettingsByAdmin:error', e);
            res.status(400).send(tracer ? tracer.wrapResponse({ error: e.message || e }) : { error: e.message || e });
        }
    }
    );
    router.get('/user/settings', async function (req, res) {
        const requestStartTime = new Date().getTime();
        const tracer = req.headers['is-debug'] === 'true' ? DebugTracer.fromRequest(req) : null;
        tracer?.trace('getUserSettings:start', { query: req.query });
        let platformName = null;
        let success = false;
        const { hashedExtensionId, hashedAccountId, userAgent, ip, author, eventAddedVia } = getAnalyticsVariablesInReqHeaders({ headers: req.headers })
        try {
            const jwtToken = req.query.jwtToken;
            if (jwtToken) {
                const unAuthData = jwt.decodeJwt(jwtToken);
                platformName = unAuthData?.platform ?? 'Unknown';
                const user = await UserModel.findByPk(unAuthData?.id);
                if (!user) {
                    tracer?.trace('getUserSettings:userNotFound', {});
                    res.status(400).send(tracer ? tracer.wrapResponse('User not found') : 'User not found');
                    return;
                }
                else {
                    const rcAccessToken = req.query.rcAccessToken;
                    const rcAccountId = req.query.rcAccountId;
                    const userSettings = await userCore.getUserSettings({ user, rcAccessToken, rcAccountId });
                    success = true;
                    res.status(200).send(tracer ? tracer.wrapResponse(userSettings) : userSettings);
                }
            }
            else {
                success = false;
                tracer?.trace('getUserSettings:noToken', {});
                res.status(400).send(tracer ? tracer.wrapResponse('Please go to Settings and authorize CRM platform') : 'Please go to Settings and authorize CRM platform');
            }
        }
        catch (e) {
            console.log(`platform: ${platformName} \n${e.stack}`);
            tracer?.traceError('getUserSettings:error', e, { platform: platformName });
            res.status(400).send(tracer ? tracer.wrapResponse({ error: e.message || e }) : { error: e.message || e });
        }
        const requestEndTime = new Date().getTime();
        analytics.track({
            eventName: 'Get user settings',
            interfaceName: 'getUserSettings',
            connectorName: platformName,
            accountId: hashedAccountId,
            extensionId: hashedExtensionId,
            success,
            requestDuration: (requestEndTime - requestStartTime) / 1000,
            userAgent,
            ip,
            author,
            eventAddedVia
        });
    });
    router.post('/user/settings', async function (req, res) {
        const requestStartTime = new Date().getTime();
        const tracer = req.headers['is-debug'] === 'true' ? DebugTracer.fromRequest(req) : null;
        tracer?.trace('setUserSettings:start', { body: req.body });
        let platformName = null;
        let success = false;
        const { hashedExtensionId, hashedAccountId, userAgent, ip, author, eventAddedVia } = getAnalyticsVariablesInReqHeaders({ headers: req.headers })
        try {
            const jwtToken = req.query.jwtToken;
            if (jwtToken) {
                const unAuthData = jwt.decodeJwt(jwtToken);
                platformName = unAuthData?.platform;
                if (!platformName) {
                    tracer?.trace('setUserSettings:unknownPlatform', {});
                    res.status(400).send(tracer ? tracer.wrapResponse('Unknown platform') : 'Unknown platform');
                    return;
                }
                const user = await UserModel.findByPk(unAuthData?.id);
                if (!user) {
                    tracer?.trace('setUserSettings:userNotFound', {});
                    res.status(400).send(tracer ? tracer.wrapResponse('User not found') : 'User not found');
                    return;
                }
                const { userSettings } = await userCore.updateUserSettings({ user, userSettings: req.body.userSettings, platformName });
                res.status(200).send(tracer ? tracer.wrapResponse({ userSettings }) : { userSettings });
                success = true;
            }
            else {
                tracer?.trace('setUserSettings:noToken', {});
                res.status(400).send(tracer ? tracer.wrapResponse('Please go to Settings and authorize CRM platform') : 'Please go to Settings and authorize CRM platform');
                success = false;
            }
        }
        catch (e) {
            console.log(`platform: ${platformName} \n${e.stack}`);
            tracer?.traceError('setUserSettings:error', e, { platform: platformName });
            res.status(400).send(tracer ? tracer.wrapResponse({ error: e.message || e }) : { error: e.message || e });
        }
        const requestEndTime = new Date().getTime();
        analytics.track({
            eventName: 'Set user settings',
            interfaceName: 'setUserSettings',
            connectorName: platformName,
            accountId: hashedAccountId,
            extensionId: hashedExtensionId,
            success,
            requestDuration: (requestEndTime - requestStartTime) / 1000,
            userAgent,
            ip,
            author,
            eventAddedVia
        });
    });
    router.get('/hostname', async function (req, res) {
        const tracer = req.headers['is-debug'] === 'true' ? DebugTracer.fromRequest(req) : null;
        tracer?.trace('hostname:start', { query: req.query });
        try {
            const jwtToken = req.query.jwtToken;
            if (jwtToken) {
                const unAuthData = jwt.decodeJwt(jwtToken);
                const user = await UserModel.findByPk(unAuthData?.id);
                if (!user) {
                    tracer?.trace('hostname:userNotFound', {});
                    res.status(400).send(tracer ? tracer.wrapResponse('User not found') : 'User not found');
                    return;
                }
                res.status(200).send(tracer ? tracer.wrapResponse(user.hostname) : user.hostname);
            }
            else {
                tracer?.trace('hostname:noToken', {});
                res.status(400).send(tracer ? tracer.wrapResponse('Please go to Settings and authorize CRM platform') : 'Please go to Settings and authorize CRM platform');
            }
        }
        catch (e) {
            console.log(`${e.stack}`);
            tracer?.traceError('hostname:error', e);
            res.status(500).send(tracer ? tracer.wrapResponse({ error: e.message || e }) : { error: e.message || e });
        }
    })
    router.get('/oauth-callback', async function (req, res) {
        const requestStartTime = new Date().getTime();
        const tracer = req.headers['is-debug'] === 'true' ? DebugTracer.fromRequest(req) : null;
        tracer?.trace('oauth-callback:start', { query: req.query });
        let platformName = null;
        let success = false;
        const { hashedExtensionId, hashedAccountId, userAgent, ip, author, eventAddedVia } = getAnalyticsVariablesInReqHeaders({ headers: req.headers })
        try {
            if (!req.query?.callbackUri || req.query.callbackUri === 'undefined') {
                tracer?.trace('oauth-callback:missingCallbackUri', {});
                res.status(400).send(tracer ? tracer.wrapResponse('Missing callbackUri') : 'Missing callbackUri');
                return;
            }
            platformName = req.query.state ?
                req.query.state.split('platform=')[1] :
                decodeURIComponent(decodeURIComponent(req.originalUrl).split('state=')[1].split('&')[0]).split('platform=')[1];
            const hostname = req.query.hostname;
            const tokenUrl = req.query.tokenUrl;
            if (!platformName) {
                tracer?.trace('oauth-callback:missingPlatformName', {});
                res.status(400).send(tracer ? tracer.wrapResponse('Missing platform name') : 'Missing platform name');
                return;
            }
            const hasAuthCodeInCallbackUri = req.query.callbackUri.includes('code=');
            if (!hasAuthCodeInCallbackUri) {
                // eslint-disable-next-line no-param-reassign
                req.query.callbackUri = `${req.query.callbackUri}&code=${req.query.code}`;
            }
            const { userInfo, returnMessage } = await authCore.onOAuthCallback({
                platform: platformName,
                hostname,
                tokenUrl,
                query: req.query
            });
            if (userInfo) {
                const jwtToken = jwt.generateJwt({
                    id: userInfo.id.toString(),
                    platform: platformName
                });
                res.status(200).send(tracer ? tracer.wrapResponse({ jwtToken, name: userInfo.name, returnMessage }) : { jwtToken, name: userInfo.name, returnMessage });
                success = true;
            }
            else {
                res.status(200).send(tracer ? tracer.wrapResponse({ returnMessage }) : { returnMessage });
                success = false;
            }
        }
        catch (e) {
            console.log(`platform: ${platformName} \n${e.stack}`);
            tracer?.traceError('oauth-callback:error', e, { platform: platformName });
            res.status(400).send(tracer ? tracer.wrapResponse({ error: e.message || e }) : { error: e.message || e });
            success = false;
        }
        const requestEndTime = new Date().getTime();
        analytics.track({
            eventName: 'OAuth Callback',
            interfaceName: 'onOAuthCallback',
            connectorName: platformName,
            accountId: hashedAccountId,
            extensionId: hashedExtensionId,
            success,
            requestDuration: (requestEndTime - requestStartTime) / 1000,
            userAgent,
            ip,
            author,
            eventAddedVia
        });
    })
    router.post('/apiKeyLogin', async function (req, res) {
        const requestStartTime = new Date().getTime();
        const tracer = req.headers['is-debug'] === 'true' ? DebugTracer.fromRequest(req) : null;
        tracer?.trace('apiKeyLogin:start', { body: req.body });
        let platformName = null;
        let success = false;
        const { hashedExtensionId, hashedAccountId, userAgent, ip, author, eventAddedVia } = getAnalyticsVariablesInReqHeaders({ headers: req.headers })
        try {
            const platform = req.body.platform;
            platformName = platform;
            const apiKey = req.body.apiKey;
            const hostname = req.body.hostname;
            const proxyId = req.body.proxyId;
            const additionalInfo = req.body.additionalInfo;
            if (!platform) {
                tracer?.trace('apiKeyLogin:missingPlatform', {});
                res.status(400).send(tracer ? tracer.wrapResponse('Missing platform name') : 'Missing platform name');
                return;
            }
            if (!apiKey) {
                tracer?.trace('apiKeyLogin:missingApiKey', {});
                res.status(400).send(tracer ? tracer.wrapResponse('Missing api key') : 'Missing api key');
                return;
            }
            const { userInfo, returnMessage } = await authCore.onApiKeyLogin({ platform, hostname, apiKey, proxyId, additionalInfo });
            if (userInfo) {
                const jwtToken = jwt.generateJwt({
                    id: userInfo.id.toString(),
                    platform: platform
                });
                res.status(200).send(tracer ? tracer.wrapResponse({ jwtToken, name: userInfo.name, returnMessage }) : { jwtToken, name: userInfo.name, returnMessage });
                success = true;
            }
            else {
                res.status(400).send(tracer ? tracer.wrapResponse({ returnMessage }) : { returnMessage });
                success = false;
            }
        }
        catch (e) {
            console.log(`platform: ${platformName} \n${e.stack}`);
            tracer?.traceError('apiKeyLogin:error', e, { platform: platformName });
            res.status(400).send(tracer ? tracer.wrapResponse({ error: e.message || e }) : { error: e.message || e });
            success = false;
        }
        const requestEndTime = new Date().getTime();
        analytics.track({
            eventName: 'API Key Login',
            interfaceName: 'onApiKeyLogin',
            connectorName: platformName,
            accountId: hashedAccountId,
            extensionId: hashedExtensionId,
            success,
            requestDuration: (requestEndTime - requestStartTime) / 1000,
            userAgent,
            ip,
            author,
            eventAddedVia
        });
    })
    router.post('/unAuthorize', async function (req, res) {
        const requestStartTime = new Date().getTime();
        const tracer = req.headers['is-debug'] === 'true' ? DebugTracer.fromRequest(req) : null;
        tracer?.trace('unAuthorize:start', { query: req.query });
        let platformName = null;
        let success = false;
        const { hashedExtensionId, hashedAccountId, userAgent, ip, author, eventAddedVia } = getAnalyticsVariablesInReqHeaders({ headers: req.headers })
        try {
            const jwtToken = req.query.jwtToken;
            if (jwtToken) {
                const unAuthData = jwt.decodeJwt(jwtToken);
                platformName = unAuthData?.platform ?? 'Unknown';
                const userToLogout = await UserModel.findByPk(unAuthData?.id);
                if (!userToLogout) {
                    tracer?.trace('unAuthorize:userNotFound', {});
                    res.status(400).send(tracer ? tracer.wrapResponse('User not found') : 'User not found');
                    return;
                }
                const platformModule = connectorRegistry.getConnector(unAuthData?.platform ?? 'Unknown');
                const { returnMessage } = await platformModule.unAuthorize({ user: userToLogout });
                res.status(200).send(tracer ? tracer.wrapResponse(returnMessage) : returnMessage);
                success = true;
            }
            else {
                tracer?.trace('unAuthorize:noToken', {});
                res.status(400).send(tracer ? tracer.wrapResponse('Please go to Settings and authorize CRM platform') : 'Please go to Settings and authorize CRM platform');
                success = false;
            }
        }
        catch (e) {
            console.log(`platform: ${platformName} \n${e.stack}`);
            tracer?.traceError('unAuthorize:error', e, { platform: platformName });
            res.status(400).send(tracer ? tracer.wrapResponse({ error: e.message || e }) : { error: e.message || e });
            success = false;
        }
        const requestEndTime = new Date().getTime();
        analytics.track({
            eventName: 'Unauthorize',
            interfaceName: 'unAuthorize',
            connectorName: platformName,
            accountId: hashedAccountId,
            extensionId: hashedExtensionId,
            success,
            requestDuration: (requestEndTime - requestStartTime) / 1000,
            userAgent,
            ip,
            author,
            eventAddedVia
        });
    });
    router.get('/userInfoHash', async function (req, res) {
        const tracer = req.headers['is-debug'] === 'true' ? DebugTracer.fromRequest(req) : null;
        try {
            tracer?.trace('userInfoHash:start', { query: req.query });
            const extensionId = util.getHashValue(req.query.extensionId, process.env.HASH_KEY);
            const accountId = util.getHashValue(req.query.accountId, process.env.HASH_KEY);
            res.status(200).send(tracer ? tracer.wrapResponse({ extensionId, accountId }) : { extensionId, accountId });
        }
        catch (e) {
            console.log(`${e.stack}`);
            res.status(400).send(tracer ? tracer.wrapResponse({ error: e.message || e }) : { error: e.message || e });
            tracer?.traceError('userInfoHash:error', e);
        }
    })
    router.get('/contact', async function (req, res) {
        const requestStartTime = new Date().getTime();
        const tracer = req.headers['is-debug'] === 'true' ? DebugTracer.fromRequest(req) : null;
        tracer?.trace('findContact:start', { query: req.query });

        let platformName = null;
        let success = false;
        let resultCount = 0;
        let extraData = {};
        const { hashedExtensionId, hashedAccountId, userAgent, ip, author, eventAddedVia } = getAnalyticsVariablesInReqHeaders({ headers: req.headers })
        try {
            const jwtToken = req.query.jwtToken;
            if (jwtToken) {
                const decodedToken = jwt.decodeJwt(jwtToken);
                tracer?.trace('findContact:jwtDecoded', { decodedToken });
                if (!decodedToken) {
                    tracer?.trace('findContact:invalidToken', {});
                    res.status(400).send(tracer ? tracer.wrapResponse('Please go to Settings and authorize CRM platform') : 'Please go to Settings and authorize CRM platform');
                    return;
                }
                const { id: userId, platform } = decodedToken;
                platformName = platform;
                const { successful, returnMessage, contact, extraDataTracking } = await contactCore.findContact({
                    platform,
                    userId,
                    phoneNumber: req.query.phoneNumber.replace(' ', '+'),
                    overridingFormat: req.query.overridingFormat,
                    isExtension: req.query?.isExtension ?? false,
                    tracer,
                    isForceRefreshAccountData: req.query?.isForceRefreshAccountData === 'true'
                });
                tracer?.trace('findContact:result', { successful, returnMessage, contact });
                res.status(200).send(tracer ? tracer.wrapResponse({ successful, returnMessage, contact }) : { successful, returnMessage, contact });
                if (successful) {
                    const nonNewContact = contact?.filter(c => !c.isNewContact) ?? [];
                    resultCount = nonNewContact.length;
                }
                success = successful;
                if (extraDataTracking) {
                    extraData = extraDataTracking;
                }
            }
            else {
                tracer?.trace('findContact:noToken', {});
                res.status(400).send(tracer ? tracer.wrapResponse('Please go to Settings and authorize CRM platform') : 'Please go to Settings and authorize CRM platform');
                success = false;
            }
        }
        catch (e) {
            console.log(`platform: ${platformName} \n${e.stack}`);
            tracer?.traceError('findContact:error', e, { platform: platformName });
            extraData.statusCode = e.response?.status ?? 'unknown';
            res.status(400).send(tracer ? tracer.wrapResponse({ error: e.message || e }) : { error: e.message || e });
            success = false;
        }
        const requestEndTime = new Date().getTime();
        analytics.track({
            eventName: 'Find contact',
            interfaceName: 'findContact',
            connectorName: platformName,
            accountId: hashedAccountId,
            extensionId: hashedExtensionId,
            success,
            requestDuration: (requestEndTime - requestStartTime) / 1000,
            userAgent,
            ip,
            author,
            extras: {
                resultCount,
                ...extraData
            },
            eventAddedVia
        });
    });
    router.post('/contact', async function (req, res) {
        const requestStartTime = new Date().getTime();
        const tracer = req.headers['is-debug'] === 'true' ? DebugTracer.fromRequest(req) : null;
        tracer?.trace('createContact:start', { query: req.query });
        let platformName = null;
        let success = false;
        let extraData = {};
        const { hashedExtensionId, hashedAccountId, userAgent, ip, author, eventAddedVia } = getAnalyticsVariablesInReqHeaders({ headers: req.headers })
        try {
            const jwtToken = req.query.jwtToken;
            if (jwtToken) {
                const decodedToken = jwt.decodeJwt(jwtToken);
                if (!decodedToken) {
                    tracer?.trace('createContact:invalidToken', {});
                    res.status(400).send(tracer ? tracer.wrapResponse('Please go to Settings and authorize CRM platform') : 'Please go to Settings and authorize CRM platform');
                    return;
                }
                const { id: userId, platform } = decodedToken;
                platformName = platform;
                const { successful, returnMessage, contact, extraDataTracking } = await contactCore.createContact({ platform, userId, phoneNumber: req.body.phoneNumber, newContactName: req.body.newContactName, newContactType: req.body.newContactType, additionalSubmission: req.body.additionalSubmission });
                res.status(200).send(tracer ? tracer.wrapResponse({ successful, returnMessage, contact }) : { successful, returnMessage, contact });
                success = true;
                if (extraDataTracking) {
                    extraData = extraDataTracking;
                }
            }
            else {
                tracer?.trace('createContact:noToken', {});
                res.status(400).send(tracer ? tracer.wrapResponse('Please go to Settings and authorize CRM platform') : 'Please go to Settings and authorize CRM platform');
                success = false;
            }
        }
        catch (e) {
            console.log(`platform: ${platformName} \n${e.stack}`);
            tracer?.traceError('createContact:error', e, { platform: platformName });
            extraData.statusCode = e.response?.status ?? 'unknown';
            res.status(400).send(tracer ? tracer.wrapResponse({ error: e.message || e }) : { error: e.message || e });
            success = false;
        }
        const requestEndTime = new Date().getTime();
        analytics.track({
            eventName: 'Create contact',
            interfaceName: 'createContact',
            connectorName: platformName,
            accountId: hashedAccountId,
            extensionId: hashedExtensionId,
            success,
            requestDuration: (requestEndTime - requestStartTime) / 1000,
            userAgent,
            ip,
            author,
            extras: {
                ...extraData
            },
            eventAddedVia
        });
    });
    router.post('/callLog/cacheNote', async function (req, res) {
        const requestStartTime = new Date().getTime();
        const tracer = req.headers['is-debug'] === 'true' ? DebugTracer.fromRequest(req) : null;
        tracer?.trace('saveNoteCache:start', { query: req.query });
        let platformName = null;
        let success = false;
        let extraData = {};
        const { hashedExtensionId, hashedAccountId, userAgent, ip, author, eventAddedVia } = getAnalyticsVariablesInReqHeaders({ headers: req.headers })
        try {
            const jwtToken = req.query.jwtToken;
            if (jwtToken) {
                const decodedToken = jwt.decodeJwt(jwtToken);
                if (!decodedToken) {
                    tracer?.trace('saveNoteCache:invalidToken', {});
                    res.status(400).send(tracer ? tracer.wrapResponse('Please go to Settings and authorize CRM platform') : 'Please go to Settings and authorize CRM platform');
                    return;
                }
                const { id: userId, platform } = decodedToken;
                platformName = platform;
                const { successful, returnMessage, extraDataTracking } = await logCore.saveNoteCache({ sessionId: req.body.sessionId, note: req.body.note });
                res.status(200).send(tracer ? tracer.wrapResponse({ successful, returnMessage }) : { successful, returnMessage });
                success = true;
                if (extraDataTracking) {
                    extraData = extraDataTracking;
                }
            }
        } catch (e) {
            console.log(`platform: ${platformName} \n${e.stack}`);
            tracer?.traceError('saveNoteCache:error', e, { platform: platformName });
            extraData.statusCode = e.response?.status ?? 'unknown';
            res.status(400).send(tracer ? tracer.wrapResponse({ error: e.message || e }) : { error: e.message || e });
            success = false;
        }
        const requestEndTime = new Date().getTime();
        analytics.track({
            eventName: 'Save note cache',
            interfaceName: 'saveNoteCache',
            connectorName: platformName,
            accountId: hashedAccountId,
            extensionId: hashedExtensionId,
            success,
        });
    })
    router.get('/callLog', async function (req, res) {
        const requestStartTime = new Date().getTime();
        const tracer = req.headers['is-debug'] === 'true' ? DebugTracer.fromRequest(req) : null;
        tracer?.trace('getCallLog:start', { query: req.query });
        let platformName = null;
        let success = false;
        let extraData = {};
        const { hashedExtensionId, hashedAccountId, userAgent, ip, author, eventAddedVia } = getAnalyticsVariablesInReqHeaders({ headers: req.headers })
        try {
            const jwtToken = req.query.jwtToken;
            if (jwtToken) {
                const decodedToken = jwt.decodeJwt(jwtToken);
                if (!decodedToken) {
                    tracer?.trace('getCallLog:invalidToken', {});
                    res.status(400).send(tracer ? tracer.wrapResponse('Please go to Settings and authorize CRM platform') : 'Please go to Settings and authorize CRM platform');
                    return;
                }
                const { id: userId, platform } = decodedToken;
                platformName = platform;
                const { successful, logs, returnMessage, extraDataTracking } = await logCore.getCallLog({ userId, sessionIds: req.query.sessionIds, platform, requireDetails: req.query.requireDetails === 'true' });
                res.status(200).send(tracer ? tracer.wrapResponse({ successful, logs, returnMessage }) : { successful, logs, returnMessage });
                success = true;
                if (extraDataTracking) {
                    extraData = extraDataTracking;
                }
                extraData.requireDetails = req.query.requireDetails === 'true';
            }
            else {
                tracer?.trace('getCallLog:noToken', {});
                res.status(400).send(tracer ? tracer.wrapResponse('Please go to Settings and authorize CRM platform') : 'Please go to Settings and authorize CRM platform');
                success = false;
            }
        }
        catch (e) {
            console.log(`platform: ${platformName} \n${e.stack}`);
            extraData.statusCode = e.response?.status ?? 'unknown';
            res.status(400).send(tracer ? tracer.wrapResponse({ error: e.message || e }) : { error: e.message || e });
            tracer?.traceError('getCallLog:error', e, { platform: platformName });
            success = false;
        }
        const requestEndTime = new Date().getTime();
        analytics.track({
            eventName: 'Get call log',
            interfaceName: 'getCallLog',
            connectorName: platformName,
            accountId: hashedAccountId,
            extensionId: hashedExtensionId,
            success,
            requestDuration: (requestEndTime - requestStartTime) / 1000,
            userAgent,
            ip,
            author,
            extras: {
                ...extraData
            },
            eventAddedVia
        });
    });
    router.post('/callLog', async function (req, res) {
        const requestStartTime = new Date().getTime();
        const tracer = req.headers['is-debug'] === 'true' ? DebugTracer.fromRequest(req) : null;
        tracer?.trace('createCallLog:start', { query: req.query });
        let platformName = null;
        let success = false;
        let extraData = {};
        const { hashedExtensionId, hashedAccountId, userAgent, ip, author, eventAddedVia } = getAnalyticsVariablesInReqHeaders({ headers: req.headers })
        try {
            const jwtToken = req.query.jwtToken;
            if (jwtToken) {
                const decodedToken = jwt.decodeJwt(jwtToken);
                if (!decodedToken) {
                    tracer?.trace('createCallLog:invalidToken', {});
                    res.status(400).send(tracer ? tracer.wrapResponse('Please go to Settings and authorize CRM platform') : 'Please go to Settings and authorize CRM platform');
                    return;
                }
                const { id: userId, platform } = decodedToken;
                platformName = platform;
                const { successful, logId, returnMessage, extraDataTracking } = await logCore.createCallLog({ platform, userId, incomingData: req.body, hashedAccountId: hashedAccountId ?? util.getHashValue(req.body.logInfo?.accountId, process.env.HASH_KEY), isFromSSCL: userAgent === 'SSCL' });
                if (extraDataTracking) {
                    extraData = extraDataTracking;
                }
                res.status(200).send(tracer ? tracer.wrapResponse({ successful, logId, returnMessage }) : { successful, logId, returnMessage });
                success = true;
            }
            else {
                tracer?.trace('createCallLog:noToken', {});
                res.status(400).send(tracer ? tracer.wrapResponse('Please go to Settings and authorize CRM platform') : 'Please go to Settings and authorize CRM platform');
                success = false;
            }
        }
        catch (e) {
            console.log(`platform: ${platformName} \n${e.stack}`);
            extraData.statusCode = e.response?.status ?? 'unknown';
            res.status(400).send(tracer ? tracer.wrapResponse({ error: e.message || e }) : { error: e.message || e });
            tracer?.traceError('createCallLog:error', e, { platform: platformName });
            success = false;
        }
        const requestEndTime = new Date().getTime();
        analytics.track({
            eventName: 'Create call log',
            interfaceName: 'createCallLog',
            connectorName: platformName,
            accountId: hashedAccountId,
            extensionId: hashedExtensionId,
            success,
            requestDuration: (requestEndTime - requestStartTime) / 1000,
            userAgent,
            ip,
            author,
            extras: {
                ...extraData
            },
            eventAddedVia
        });
    });
    router.patch('/callLog', async function (req, res) {
        const requestStartTime = new Date().getTime();
        const tracer = req.headers['is-debug'] === 'true' ? DebugTracer.fromRequest(req) : null;
        tracer?.trace('updateCallLog:start', { query: req.query });
        let platformName = null;
        let success = false;
        let extraData = {};
        const { hashedExtensionId, hashedAccountId, userAgent, ip, author, eventAddedVia } = getAnalyticsVariablesInReqHeaders({ headers: req.headers })
        try {
            const jwtToken = req.query.jwtToken;
            if (jwtToken) {
                const decodedToken = jwt.decodeJwt(jwtToken);
                if (!decodedToken) {
                    tracer?.trace('updateCallLog:invalidToken', {});
                    res.status(400).send(tracer ? tracer.wrapResponse('Please go to Settings and authorize CRM platform') : 'Please go to Settings and authorize CRM platform');
                    return;
                }
                const { id: userId, platform } = decodedToken;
                platformName = platform;
                const { successful, logId, updatedNote, returnMessage, extraDataTracking } = await logCore.updateCallLog({ platform, userId, incomingData: req.body, hashedAccountId: hashedAccountId ?? util.getHashValue(req.body.accountId, process.env.HASH_KEY), isFromSSCL: userAgent === 'SSCL' });
                if (extraDataTracking) {
                    extraData = extraDataTracking;
                }
                res.status(200).send(tracer ? tracer.wrapResponse({ successful, logId, updatedNote, returnMessage }) : { successful, logId, updatedNote, returnMessage });
                success = true;
            }
            else {
                tracer?.trace('updateCallLog:noToken', {});
                res.status(400).send(tracer ? tracer.wrapResponse('Please go to Settings and authorize CRM platform') : 'Please go to Settings and authorize CRM platform');
                success = false;
            }
        }
        catch (e) {
            console.log(`platform: ${platformName} \n${e.stack}`);
            extraData.statusCode = e.response?.status ?? 'unknown';
            res.status(400).send(tracer ? tracer.wrapResponse({ error: e.message || e }) : { error: e.message || e });
            tracer?.traceError('updateCallLog:error', e, { platform: platformName });
            success = false;
        }
        const requestEndTime = new Date().getTime();
        analytics.track({
            eventName: 'Update call log',
            interfaceName: 'updateCallLog',
            connectorName: platformName,
            accountId: hashedAccountId,
            extensionId: hashedExtensionId,
            success,
            requestDuration: (requestEndTime - requestStartTime) / 1000,
            userAgent,
            ip,
            author,
            extras: {
                ...extraData
            },
            eventAddedVia
        });
    });
    router.put('/callDisposition', async function (req, res) {
        const requestStartTime = new Date().getTime();
        const tracer = req.headers['is-debug'] === 'true' ? DebugTracer.fromRequest(req) : null;
        tracer?.trace('upsertCallDisposition:start', { query: req.query });
        let platformName = null;
        let success = false;
        let extraData = {};
        const { hashedExtensionId, hashedAccountId, userAgent, ip, author, eventAddedVia } = getAnalyticsVariablesInReqHeaders({ headers: req.headers })
        try {
            const jwtToken = req.query.jwtToken;
            if (jwtToken) {
                const { id: userId, platform } = jwt.decodeJwt(jwtToken);
                platformName = platform;
                if (!userId) {
                    tracer?.trace('upsertCallDisposition:invalidToken', {});
                    res.status(400).send(tracer ? tracer.wrapResponse('Please go to Settings and authorize CRM platform') : 'Please go to Settings and authorize CRM platform');
                    return;
                }
                const { successful, returnMessage, extraDataTracking } = await dispositionCore.upsertCallDisposition({
                    platform,
                    userId,
                    sessionId: req.body.sessionId,
                    dispositions: req.body.dispositions,
                    additionalSubmission: req.body.additionalSubmission
                });
                if (extraDataTracking) {
                    extraData = extraDataTracking;
                }
                res.status(200).send(tracer ? tracer.wrapResponse({ successful, returnMessage }) : { successful, returnMessage });
                success = true;
            }
            else {
                tracer?.trace('upsertCallDisposition:noToken', {});
                res.status(400).send(tracer ? tracer.wrapResponse('Please go to Settings and authorize CRM platform') : 'Please go to Settings and authorize CRM platform');
                success = false;
            }
        }
        catch (e) {
            console.log(`platform: ${platformName} \n${e.stack}`);
            extraData.statusCode = e.response?.status ?? 'unknown';
            res.status(400).send(tracer ? tracer.wrapResponse({ error: e.message || e }) : { error: e.message || e });
            tracer?.traceError('upsertCallDisposition:error', e, { platform: platformName });
            success = false;
        }
        const requestEndTime = new Date().getTime();
        analytics.track({
            eventName: 'Create call log',
            interfaceName: 'createCallLog',
            connectorName: platformName,
            accountId: hashedAccountId,
            extensionId: hashedExtensionId,
            success,
            requestDuration: (requestEndTime - requestStartTime) / 1000,
            userAgent,
            ip,
            author,
            extras: {
                ...extraData
            },
            eventAddedVia
        });
    });
    router.post('/messageLog', async function (req, res) {
        const requestStartTime = new Date().getTime();
        const tracer = req.headers['is-debug'] === 'true' ? DebugTracer.fromRequest(req) : null;
        tracer?.trace('createMessageLog:start', { query: req.query });
        let platformName = null;
        let success = false;
        let statusCode = 200;
        let extraData = {};
        const { hashedExtensionId, hashedAccountId, userAgent, ip, author, eventAddedVia } = getAnalyticsVariablesInReqHeaders({ headers: req.headers })
        try {
            const jwtToken = req.query.jwtToken;
            if (jwtToken) {
                const decodedToken = jwt.decodeJwt(jwtToken);
                if (!decodedToken) {
                    tracer?.trace('createMessageLog:invalidToken', {});
                    res.status(400).send(tracer ? tracer.wrapResponse('Please go to Settings and authorize CRM platform') : 'Please go to Settings and authorize CRM platform');
                    return;
                }
                const { id: userId, platform } = decodedToken;
                platformName = platform;
                const { successful, returnMessage, logIds, extraDataTracking } = await logCore.createMessageLog({ platform, userId, incomingData: req.body });
                if (extraDataTracking) {
                    extraData = extraDataTracking;
                }
                res.status(200).send(tracer ? tracer.wrapResponse({ successful, returnMessage, logIds }) : { successful, returnMessage, logIds });
                success = true;
            }
            else {
                tracer?.trace('createMessageLog:noToken', {});
                res.status(400).send(tracer ? tracer.wrapResponse('Please go to Settings and authorize CRM platform') : 'Please go to Settings and authorize CRM platform');
                success = false;
            }
        }
        catch (e) {
            console.log(`platform: ${platformName} \n${e.stack}`);
            statusCode = e.response?.status ?? 'unknown';
            res.status(400).send(tracer ? tracer.wrapResponse({ error: e.message || e }) : { error: e.message || e });
            tracer?.traceError('createMessageLog:error', e, { platform: platformName });
            success = false;
        }
        const requestEndTime = new Date().getTime();
        analytics.track({
            eventName: 'Create message log',
            interfaceName: 'createMessageLog',
            connectorName: platformName,
            accountId: hashedAccountId,
            extensionId: hashedExtensionId,
            success,
            requestDuration: (requestEndTime - requestStartTime) / 1000,
            userAgent,
            ip,
            author,
            extras: {
                statusCode,
                ...extraData
            },
            eventAddedVia
        });
    });
    router.post('/calldown', async function (req, res) {
        const requestStartTime = new Date().getTime();
        const tracer = req.headers['is-debug'] === 'true' ? DebugTracer.fromRequest(req) : null;
        tracer?.trace('scheduleCallDown:start', { query: req.query });
        let platformName = null;
        let success = false;
        let statusCode = 200;
        const { hashedExtensionId, hashedAccountId, userAgent, ip, author, eventAddedVia } = getAnalyticsVariablesInReqHeaders({ headers: req.headers })
        try {
            const jwtToken = req.query.jwtToken;
            if (!jwtToken) {
                tracer?.trace('scheduleCallDown:noToken', {});
                res.status(400).send(tracer ? tracer.wrapResponse('Please go to Settings and authorize CRM platform') : 'Please go to Settings and authorize CRM platform');
                return;
            }
            const { id } = await calldown.schedule({ jwtToken, rcAccessToken: req.query.rcAccessToken, body: req.body });
            success = true;
            res.status(200).send(tracer ? tracer.wrapResponse({ successful: true, id }) : { successful: true, id });
        } catch (e) {
            console.log(`platform: ${platformName} \n${e.stack}`);
            statusCode = e.response?.status ?? 'unknown';
            res.status(400).send(tracer ? tracer.wrapResponse({ error: e.message || e }) : { error: e.message || e });
            tracer?.traceError('scheduleCallDown:error', e, { platform: platformName });
            success = false;
        }
        const requestEndTime = new Date().getTime();
        analytics.track({
            eventName: 'Schedule call down',
            interfaceName: 'scheduleCallDown',
            connectorName: platformName,
            accountId: hashedAccountId,
            extensionId: hashedExtensionId,
            success,
            requestDuration: (requestEndTime - requestStartTime) / 1000,
            userAgent,
            ip,
            author,
            extras: {
                statusCode
            },
            eventAddedVia
        });
    });
    router.get('/calldown', async function (req, res) {
        const requestStartTime = new Date().getTime();
        const tracer = req.headers['is-debug'] === 'true' ? DebugTracer.fromRequest(req) : null;
        tracer?.trace('getCallDownList:start', { query: req.query });
        let platformName = null;
        let success = false;
        let statusCode = 200;
        const { hashedExtensionId, hashedAccountId, userAgent, ip, author, eventAddedVia } = getAnalyticsVariablesInReqHeaders({ headers: req.headers })
        try {
            const jwtToken = req.query.jwtToken;
            if (!jwtToken) {
                tracer?.trace('getCallDownList:noToken', {});
                res.status(400).send(tracer ? tracer.wrapResponse('Please go to Settings and authorize CRM platform') : 'Please go to Settings and authorize CRM platform');
                return;
            }
            const { items } = await calldown.list({ jwtToken, status: req.query.status });
            success = true;
            res.status(200).send(tracer ? tracer.wrapResponse({ successful: true, items }) : { successful: true, items });
        } catch (e) {
            console.log(`platform: ${platformName} \n${e.stack}`);
            statusCode = e.response?.status ?? 'unknown';
            res.status(400).send(tracer ? tracer.wrapResponse({ error: e.message || e }) : { error: e.message || e });
            tracer?.traceError('getCallDownList:error', e, { platform: platformName });
            success = false;
        }
        const requestEndTime = new Date().getTime();
        analytics.track({
            eventName: 'Get call down list',
            interfaceName: 'getCallDownList',
            connectorName: platformName,
            accountId: hashedAccountId,
            extensionId: hashedExtensionId,
            success,
            requestDuration: (requestEndTime - requestStartTime) / 1000,
            userAgent,
            ip,
            author,
            extras: { statusCode },
            eventAddedVia
        });
    });
    router.delete('/calldown/:id', async function (req, res) {
        const requestStartTime = new Date().getTime();
        const tracer = req.headers['is-debug'] === 'true' ? DebugTracer.fromRequest(req) : null;
        tracer?.trace('deleteCallDownItem:start', { query: req.query });
        let platformName = null;
        let success = false;
        let statusCode = 200;
        const { hashedExtensionId, hashedAccountId, userAgent, ip, author, eventAddedVia } = getAnalyticsVariablesInReqHeaders({ headers: req.headers })
        try {
            const jwtToken = req.query.jwtToken;
            const id = req.query.id;
            if (!jwtToken) {
                tracer?.trace('deleteCallDownItem:noToken', {});
                res.status(400).send(tracer ? tracer.wrapResponse('Please go to Settings and authorize CRM platform') : 'Please go to Settings and authorize CRM platform');
                return;
            }
            const rid = req.params.id || id;
            if (!rid) {
                tracer?.trace('deleteCallDownItem:missingId', {});
                res.status(400).send(tracer ? tracer.wrapResponse('Missing id') : 'Missing id');
                return;
            }
            await calldown.remove({ jwtToken, id: rid });
            success = true;
            res.status(200).send(tracer ? tracer.wrapResponse({ successful: true }) : { successful: true });
        } catch (e) {
            console.log(`platform: ${platformName} \n${e.stack}`);
            statusCode = e.response?.status ?? 'unknown';
            res.status(400).send(tracer ? tracer.wrapResponse({ error: e.message || e }) : { error: e.message || e });
            tracer?.traceError('deleteCallDownItem:error', e, { platform: platformName });
            success = false;
        }
        const requestEndTime = new Date().getTime();
        analytics.track({
            eventName: 'Delete call down item',
            interfaceName: 'deleteCallDownItem',
            connectorName: platformName,
            accountId: hashedAccountId,
            extensionId: hashedExtensionId,
            success,
            requestDuration: (requestEndTime - requestStartTime) / 1000,
            userAgent,
            ip,
            author,
            extras: { statusCode },
            eventAddedVia
        });
    });
    router.patch('/calldown/:id', async function (req, res) {
        const requestStartTime = new Date().getTime();
        const tracer = req.headers['is-debug'] === 'true' ? DebugTracer.fromRequest(req) : null;
        tracer?.trace('markCallDownCalled:start', { query: req.query });
        let platformName = null;
        let success = false;
        let statusCode = 200;
        const { hashedExtensionId, hashedAccountId, userAgent, ip, author, eventAddedVia } = getAnalyticsVariablesInReqHeaders({ headers: req.headers })
        try {
            const jwtToken = req.query.jwtToken;
            if (!jwtToken) {
                tracer?.trace('markCallDownCalled:noToken', {});
                res.status(400).send(tracer ? tracer.wrapResponse('Please go to Settings and authorize CRM platform') : 'Please go to Settings and authorize CRM platform');
                return;
            }
            const id = req.params.id || req.body?.id;
            if (!id) {
                tracer?.trace('markCallDownCalled:missingId', {});
                res.status(400).send(tracer ? tracer.wrapResponse('Missing id') : 'Missing id');
                return;
            }
            await calldown.update({ jwtToken, id, updateData: req.body });
            success = true;
            res.status(200).send(tracer ? tracer.wrapResponse({ successful: true }) : { successful: true });
        } catch (e) {
            console.log(`platform: ${platformName} \n${e.stack}`);
            statusCode = e.response?.status ?? 'unknown';
            res.status(400).send(tracer ? tracer.wrapResponse({ error: e.message || e }) : { error: e.message || e });
            tracer?.traceError('markCallDownCalled:error', e, { platform: platformName });
            success = false;
        }
        const requestEndTime = new Date().getTime();
        analytics.track({
            eventName: 'Mark call down called',
            interfaceName: 'markCallDownCalled',
            connectorName: platformName,
            accountId: hashedAccountId,
            extensionId: hashedExtensionId,
            success,
            requestDuration: (requestEndTime - requestStartTime) / 1000,
            userAgent,
            ip,
            author,
            extras: { statusCode },
            eventAddedVia
        });
    });
    router.get('/custom/contact/search', async function (req, res) {
        const requestStartTime = new Date().getTime();
        const tracer = req.headers['is-debug'] === 'true' ? DebugTracer.fromRequest(req) : null;
        tracer?.trace('contactSearchByName:start', { query: req.query });
        let platformName = null;
        let success = false;
        let resultCount = 0;
        let statusCode = 200;
        const { hashedExtensionId, hashedAccountId, userAgent, ip, author } = getAnalyticsVariablesInReqHeaders({ headers: req.headers })
        try {
            const jwtToken = req.query.jwtToken;
            if (jwtToken) {
                const { id: userId, platform } = jwt.decodeJwt(jwtToken);
                platformName = platform;
                const { successful, returnMessage, contact } = await contactCore.findContactWithName({ platform, userId, name: req.query.name });
                res.status(200).send(tracer ? tracer.wrapResponse({ successful, returnMessage, contact }) : { successful, returnMessage, contact });
                success = successful;
            }
            else {
                tracer?.trace('contactSearchByName:noToken', {});
                res.status(400).send(tracer ? tracer.wrapResponse('Please go to Settings and authorize CRM platform') : 'Please go to Settings and authorize CRM platform');
                success = false;
            }

        }
        catch (e) {
            console.log(`platform: ${platformName} \n${e.stack}`);
            statusCode = e.response?.status ?? 'unknown';
            res.status(400).send(tracer ? tracer.wrapResponse({ error: e.message || e }) : { error: e.message || e });
            tracer?.traceError('contactSearchByName:error', e, { platform: platformName });
            success = false;
        }
        const requestEndTime = new Date().getTime();
        analytics.track({
            eventName: 'Contact Search by Name',
            interfaceName: 'contactSearchByName',
            connectorName: platformName,
            accountId: hashedAccountId,
            extensionId: hashedExtensionId,
            success,
            requestDuration: (requestEndTime - requestStartTime) / 1000,
            userAgent,
            ip,
            author,
            extras: {
                statusCode
            }
        });
    });
    router.get('/ringcentral/admin/report', async function (req, res) {
        const requestStartTime = new Date().getTime();
        const tracer = req.headers['is-debug'] === 'true' ? DebugTracer.fromRequest(req) : null;
        tracer?.trace('getAdminReport:start', { query: req.query });
        let platformName = null;
        let success = false;
        const { hashedExtensionId, hashedAccountId, userAgent, ip, author, eventAddedVia } = getAnalyticsVariablesInReqHeaders({ headers: req.headers })
        const jwtToken = req.query.jwtToken;
        try {
            if (jwtToken) {
                const unAuthData = jwt.decodeJwt(jwtToken);
                const user = await UserModel.findByPk(unAuthData?.id);
                if (!user) {
                    tracer?.trace('getAdminReport:userNotFound', {});
                    res.status(400).send(tracer ? tracer.wrapResponse('User not found') : 'User not found');
                    return;
                }
                const report = await adminCore.getAdminReport({ rcAccountId: user.rcAccountId, timezone: req.query.timezone, timeFrom: req.query.timeFrom, timeTo: req.query.timeTo, groupBy: req.query.groupBy });
                res.status(200).send(tracer ? tracer.wrapResponse(report) : report);
                success = true;
                return;
            }
            tracer?.trace('getAdminReport:invalidRequest', {});
            res.status(400).send(tracer ? tracer.wrapResponse('Invalid request') : 'Invalid request');
            success = false;
        }
        catch (e) {
            console.log(`${e.stack}`);
            res.status(400).send(tracer ? tracer.wrapResponse({ error: e.message || e }) : { error: e.message || e });
            tracer?.traceError('getAdminReport:error', e, { platform: platformName });
        }
        const requestEndTime = new Date().getTime();
        analytics.track({
            eventName: 'Get admin report',
            interfaceName: 'getAdminReport',
            connectorName: platformName,
            accountId: hashedAccountId,
            extensionId: hashedExtensionId,
            success,
            requestDuration: (requestEndTime - requestStartTime) / 1000,
            userAgent,
            ip,
            author,
            eventAddedVia
        });
    });
    router.get('/ringcentral/admin/userReport', async function (req, res) {
        const requestStartTime = new Date().getTime();
        const tracer = req.headers['is-debug'] === 'true' ? DebugTracer.fromRequest(req) : null;
        tracer?.trace('getUserReport:start', { query: req.query });
        let platformName = null;
        let success = false;
        const { hashedExtensionId, hashedAccountId, userAgent, ip, author, eventAddedVia } = getAnalyticsVariablesInReqHeaders({ headers: req.headers })
        const jwtToken = req.query.jwtToken;
        try {
            if (jwtToken) {
                const unAuthData = jwt.decodeJwt(jwtToken);
                const user = await UserModel.findByPk(unAuthData?.id);
                if (!user) {
                    tracer?.trace('getUserReport:userNotFound', {});
                    res.status(400).send(tracer ? tracer.wrapResponse('User not found') : 'User not found');
                    return;
                }
                const report = await adminCore.getUserReport({ rcAccountId: user.rcAccountId, rcExtensionId: req.query.rcExtensionId, timezone: req.query.timezone, timeFrom: req.query.timeFrom, timeTo: req.query.timeTo });
                res.status(200).send(tracer ? tracer.wrapResponse(report) : report);
                return;
            }
            tracer?.trace('getUserReport:invalidRequest', {});
            res.status(400).send(tracer ? tracer.wrapResponse('Invalid request') : 'Invalid request');
            success = false;
        }
        catch (e) {
            console.log(`${e.stack}`);
            res.status(400).send(tracer ? tracer.wrapResponse({ error: e.message || e }) : { error: e.message || e });
            tracer?.traceError('getUserReport:error', e, { platform: platformName });
        }
        const requestEndTime = new Date().getTime();
        analytics.track({
            eventName: 'Get user report',
            interfaceName: 'getUserReport',
            connectorName: platformName,
            accountId: hashedAccountId,
            extensionId: hashedExtensionId,
            success,
            requestDuration: (requestEndTime - requestStartTime) / 1000,
            userAgent,
            ip,
            author,
            eventAddedVia
        });
    });
    router.get('/ringcentral/oauth/callback', async function (req, res) {
        const tracer = req.headers['is-debug'] === 'true' ? DebugTracer.fromRequest(req) : null;
        tracer?.trace('onRingcentralOAuthCallback:start', { query: req.query });
        const jwtToken = req.query.jwtToken;
        if (jwtToken) {
            const unAuthData = jwt.decodeJwt(jwtToken);
            const { code } = req.query;
            const user = await UserModel.findByPk(unAuthData?.id);
            if (!user) {
                tracer?.trace('onRingcentralOAuthCallback:userNotFound', {});
                res.status(400).send(tracer ? tracer.wrapResponse('User not found') : 'User not found');
                return;
            }
            await authCore.onRingcentralOAuthCallback({ code, rcAccountId: user.rcAccountId });
            res.status(200).send(tracer ? tracer.wrapResponse({ successful: true }) : { successful: true });
            return;
        }
        tracer?.trace('onRingcentralOAuthCallback:invalidRequest', {});
        res.status(400).send(tracer ? tracer.wrapResponse('Invalid request') : 'Invalid request');
    });
    router.get('/debug/report/url', async function (req, res) {
        const requestStartTime = new Date().getTime();
        const tracer = req.headers['is-debug'] === 'true' ? DebugTracer.fromRequest(req) : null;
        tracer?.trace('getErrorLogReportURL:start', { query: req.query });
        let platformName = null;
        let success = false;
        const { hashedExtensionId, hashedAccountId, userAgent, ip, author, eventAddedVia } = getAnalyticsVariablesInReqHeaders({ headers: req.headers })
        const jwtToken = req.query.jwtToken;
        if (jwtToken) {
            const unAuthData = jwt.decodeJwt(jwtToken);
            const uploadUrl = await s3ErrorLogReport.getUploadUrl({ userId: unAuthData?.id, platform: unAuthData?.platform });
            res.status(200).send(tracer ? tracer.wrapResponse({ presignedUrl: uploadUrl }) : { presignedUrl: uploadUrl });
            success = true;
        }
        else {
            tracer?.trace('getErrorLogReportURL:invalidRequest', {});
            res.status(400).send(tracer ? tracer.wrapResponse('Invalid request') : 'Invalid request');
            success = false;
        }
        const requestEndTime = new Date().getTime();
        analytics.track({
            eventName: 'Get error log report URL',
            interfaceName: 'getErrorLogReportURL',
            connectorName: platformName,
            accountId: hashedAccountId,
            extensionId: hashedExtensionId,
            success,
            requestDuration: (requestEndTime - requestStartTime) / 1000,
            userAgent,
            ip,
            author,
            eventAddedVia
        });
    });

    if (process.env.IS_PROD === 'false') {
        router.post('/registerMockUser', async function (req, res) {
            const secretKey = req.query.secretKey;
            if (secretKey === process.env.APP_SERVER_SECRET_KEY) {
                const mockUser = await mock.createUser({ userName: req.body.userName });
                res.status(200).send(mockUser ? 'Mock user registered' : 'Mock user already existed');
            }
            else {
                res.status(401).send('Unauthorized');
            }
        });
        router.delete('/deleteMockUser', async function (req, res) {
            const secretKey = req.query.secretKey;
            if (secretKey === process.env.APP_SERVER_SECRET_KEY) {
                const foundAndDeleted = await mock.deleteUser({ userName: req.query.userName });
                res.status(200).send(foundAndDeleted ? 'Mock user deleted' : 'Mock user not found');
            }
            else {
                res.status(401).send('Unauthorized');
            }
        });
        router.get('/mockCallLog', async function (req, res) {
            const secretKey = req.query.secretKey;
            if (secretKey === process.env.APP_SERVER_SECRET_KEY) {
                const callLogs = await mock.getCallLog({ sessionIds: req.query.sessionIds });
                res.status(200).send(callLogs);
            }
            else {
                res.status(401).send('Unauthorized');
            }
        });
        router.post('/mockCallLog', async function (req, res) {
            const secretKey = req.query.secretKey;
            if (secretKey === process.env.APP_SERVER_SECRET_KEY) {
                await mock.createCallLog({ sessionId: req.body.sessionId });
                res.status(200).send('Mock call log created');
            }
            else {
                res.status(401).send('Unauthorized');
            }
        });
        router.delete('/mockCallLog', async function (req, res) {
            const secretKey = req.query.secretKey;
            if (secretKey === process.env.APP_SERVER_SECRET_KEY) {
                await mock.cleanUpMockLogs();
                res.status(200).send('Mock call logs cleaned up');
            }
            else {
                res.status(401).send('Unauthorized');
            }
        });
    }

    return router;
}

// Create middleware for core functionality
function createCoreMiddleware() {
    return [
        bodyParser.json(),
        bodyParser.xml({
            limit: '50mb',
            xmlParseOptions: {
                explicitArray: false,
                normalize: true,
                normalizeTags: false,
                trim: true
            }
        }),
        cors({
            methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE']
        })
    ];
}

// Initialize core services
async function initializeCore(options = {}) {
    const {
        skipDatabaseInit = false,
        skipAnalyticsInit = false,
    } = options;

    if (!skipAnalyticsInit) {
        analytics.init();
    }

    if (!skipDatabaseInit) {
        await initDB();
    }
}

// Create a complete app with core functionality
function createCoreApp(options = {}) {
    initializeCore(options);
    const app = express();

    // Allow bigger POST body size
    app.use(express.json({ limit: '50mb' }));
    app.use(express.urlencoded({ limit: '50mb', extended: true }));

    // Apply core middleware
    const coreMiddleware = createCoreMiddleware();
    coreMiddleware.forEach(middleware => app.use(middleware));

    // Apply core routes
    const coreRouter = createCoreRouter();
    app.use('/', coreRouter);

    return app;
}

exports.createCoreRouter = createCoreRouter;
exports.createCoreMiddleware = createCoreMiddleware;
exports.createCoreApp = createCoreApp;
exports.initializeCore = initializeCore;
exports.connectorRegistry = connectorRegistry;
exports.proxyConnector = proxyConnector;
exports.DebugTracer = DebugTracer;
