const express = require('express');
const cors = require('cors')
const bodyParser = require('body-parser');
const dynamoose = require('dynamoose');
const axios = require('axios');
const { UserModel } = require('./models/userModel');
const { CallLogModel } = require('./models/callLogModel');
const { MessageLogModel } = require('./models/messageLogModel');
const { AdminConfigModel } = require('./models/adminConfigModel');
const { CacheModel } = require('./models/cacheModel');
const jwt = require('./lib/jwt');
const logCore = require('./handlers/log');
const contactCore = require('./handlers/contact');
const authCore = require('./handlers/auth');
const adminCore = require('./handlers/admin');
const userCore = require('./handlers/user');
const dispositionCore = require('./handlers/disposition');
const mock = require('./adapter/mock');
const releaseNotes = require('./releaseNotes.json');
const analytics = require('./lib/analytics');
const util = require('./lib/util');
const adapterRegistry = require('./adapter/registry');

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

axios.defaults.headers.common['Unified-CRM-Extension-Version'] = packageJson.version;

async function initDB() {
    if (!process.env.DISABLE_SYNC_DB_TABLE) {
        console.log('creating db tables if not exist...');
        await UserModel.sync();
        await CallLogModel.sync();
        await MessageLogModel.sync();
        await AdminConfigModel.sync();
        await CacheModel.sync();
    }
}

const app = express();
app.use(bodyParser.json())

app.use(cors({
    methods: ['GET', 'POST', 'PATCH', 'PUT']
}));

app.get('/releaseNotes', async function (req, res) {
    const globalReleaseNotes = releaseNotes;
    const adapterReleaseNotes = adapterRegistry.getReleaseNotes();
    const mergedReleaseNotes = {};
    const versions = Object.keys(adapterReleaseNotes);
    for (const version of versions) {
        mergedReleaseNotes[version] = {
            global: globalReleaseNotes[version].global,
            ...adapterReleaseNotes[version] ?? {}
        };
    }
    res.json(mergedReleaseNotes);
});

app.get('/crmManifest', (req, res) => {
    try {
        const platformName = req.query.platformName || 'default';
        const crmManifest = adapterRegistry.getManifest(platformName);
        if (crmManifest) {
            if (process.env.OVERRIDE_APP_SERVER) {
                crmManifest.serverUrl = process.env.OVERRIDE_APP_SERVER;
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
})

app.get('/is-alive', (req, res) => {
    res.send(`OK`);
});

app.get('/authValidation', async (req, res) => {
    const requestStartTime = new Date().getTime();
    let platformName = null;
    let success = false;
    let validationPass = false;
    let reason = '';
    let statusCode = 200;
    const { hashedExtensionId, hashedAccountId, userAgent, ip, author, eventAddedVia } = getAnalyticsVariablesInReqHeaders({ headers: req.headers })
    try {
        const jwtToken = req.query.jwtToken;
        if (jwtToken) {
            const { id: userId, platform } = jwt.decodeJwt(jwtToken);
            platformName = platform;
            const { successful, returnMessage, failReason, status } = await authCore.authValidation({ platform, userId });
            success = true;
            validationPass = successful;
            reason = failReason;
            statusCode = status;
            res.status(200).send({ successful, returnMessage });
        }
        else {
            res.status(400).send('Please go to Settings and authorize CRM platform');
            success = false;
        }
    }
    catch (e) {
        console.log(`platform: ${platformName} \n${e.stack}`);
        statusCode = e.response?.status ?? 'unknown';
        res.status(400).send(e);
        success = false;
    }
    const requestEndTime = new Date().getTime();
    analytics.track({
        eventName: 'Auth validation',
        interfaceName: 'authValidation',
        adapterName: platformName,
        rcAccountId: hashedAccountId,
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

app.get('/serverVersionInfo', (req, res) => {
    const defaultCrmManifest = adapterRegistry.getManifest('default');
    res.send({ version: defaultCrmManifest?.version ?? 'unknown' });
});

app.post('/admin/settings', async function (req, res) {
    const requestStartTime = new Date().getTime();
    let success = false;
    const { hashedExtensionId, hashedAccountId, userAgent, ip, author, eventAddedVia } = getAnalyticsVariablesInReqHeaders({ headers: req.headers })
    try {
        const { isValidated, rcAccountId } = await adminCore.validateAdminRole({ rcAccessToken: req.query.rcAccessToken });
        const hashedRcAccountId = util.getHashValue(rcAccountId, process.env.HASH_KEY);
        if (isValidated) {
            await adminCore.upsertAdminSettings({ hashedRcAccountId, adminSettings: req.body.adminSettings });
            res.status(200).send('Admin settings updated');
            success = true;
        }
        else {
            res.status(401).send('Admin validation failed');
            success = false;
        }
    }
    catch (e) {
        console.log(`${e.stack}`);
        res.status(400).send(e);
    }
    const requestEndTime = new Date().getTime();
    analytics.track({
        eventName: 'Set admin settings',
        interfaceName: 'setAdminSettings',
        rcAccountId: hashedAccountId,
        extensionId: hashedExtensionId,
        success,
        requestDuration: (requestEndTime - requestStartTime) / 1000,
        userAgent,
        ip,
        author,
        eventAddedVia
    });
});

app.get('/admin/settings', async function (req, res) {
    const requestStartTime = new Date().getTime();
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
                res.status(400).send();
            }
            const { isValidated, rcAccountId } = await adminCore.validateAdminRole({ rcAccessToken: req.query.rcAccessToken });
            const hashedRcAccountId = util.getHashValue(rcAccountId, process.env.HASH_KEY);
            if (isValidated) {
                const adminSettings = await adminCore.getAdminSettings({ hashedRcAccountId });
                if (adminSettings) {
                    res.status(200).send(adminSettings);
                }
                else {
                    res.status(200).send({
                        customAdapter: null,
                        userSettings: {}
                    });
                }
                success = true;
            }
            else {
                res.status(401).send('Admin validation failed');
                success = true;
            }
        }
        else {
            res.status(400).send('Please go to Settings and authorize CRM platform');
            success = false;
        }
    }
    catch (e) {
        res.status(400).send(e);
    }
    const requestEndTime = new Date().getTime();
    analytics.track({
        eventName: 'Get admin settings',
        interfaceName: 'getAdminSettings',
        adapterName: platformName,
        rcAccountId: hashedAccountId,
        extensionId: hashedExtensionId,
        success,
        requestDuration: (requestEndTime - requestStartTime) / 1000,
        userAgent,
        ip,
        author,
        eventAddedVia
    });
});

app.get('/admin/serverLoggingSettings', async function (req, res) {
    const requestStartTime = new Date().getTime();
    let platformName = null;
    let success = false;
    const jwtToken = req.query.jwtToken;
    if (!jwtToken) {
        res.status(400).send('Please go to Settings and authorize CRM platform');
        return;
    }
    const { hashedExtensionId, hashedAccountId, userAgent, ip, author, eventAddedVia } = getAnalyticsVariablesInReqHeaders({ headers: req.headers })
    try {
        const unAuthData = jwt.decodeJwt(jwtToken);
        if (!unAuthData?.id) {
            res.status(400).send('Please go to Settings and authorize CRM platform');
            return;
        }
        platformName = unAuthData?.platform ?? 'Unknown';
        const user = await UserModel.findByPk(unAuthData?.id);
        if (!user) {
            res.status(400).send('User not found');
            return;
        }
        const serverLoggingSettings = await adminCore.getServerLoggingSettings({ user });
        res.status(200).send(serverLoggingSettings);
        success = true;
    }
    catch (e) {
        console.log(`${e.stack}`);
        res.status(400).send(e);
    }
    const requestEndTime = new Date().getTime();
    analytics.track({
        eventName: 'Get server logging settings',
        interfaceName: 'getServerLoggingSettings',
        adapterName: platformName,
        rcAccountId: hashedAccountId,
        extensionId: hashedExtensionId,
        success,
        requestDuration: (requestEndTime - requestStartTime) / 1000,
        userAgent,
        ip,
        author,
        eventAddedVia
    });
});

app.post('/admin/serverLoggingSettings', async function (req, res) {
    const requestStartTime = new Date().getTime();
    let platformName = null;
    let success = false;
    const jwtToken = req.query.jwtToken;
    if (!jwtToken) {
        res.status(400).send('Please go to Settings and authorize CRM platform');
        return;
    }
    if (!req.body.additionalFieldValues) {
        res.status(400).send('Missing additionalFieldValues');
        return;
    }
    const { hashedExtensionId, hashedAccountId, userAgent, ip, author, eventAddedVia } = getAnalyticsVariablesInReqHeaders({ headers: req.headers })
    try {
        const unAuthData = jwt.decodeJwt(jwtToken);
        if (!unAuthData?.id) {
            res.status(400).send('Please go to Settings and authorize CRM platform');
            return;
        }
        platformName = unAuthData?.platform ?? 'Unknown';
        const user = await UserModel.findByPk(unAuthData?.id);
        if (!user) {
            res.status(400).send('User not found');
            return;
        }
        const serverLoggingSettings = await adminCore.updateServerLoggingSettings({ user, additionalFieldValues: req.body.additionalFieldValues });
        res.status(200).send(serverLoggingSettings);
        success = true;
    }
    catch (e) {
        console.log(`${e.stack}`);
        res.status(400).send(e);
        success = false;
    }
    const requestEndTime = new Date().getTime();
    analytics.track({
        eventName: 'Set server logging settings',
        interfaceName: 'setServerLoggingSettings',
        adapterName: platformName,
        rcAccountId: hashedAccountId,
        extensionId: hashedExtensionId,
        success,
        requestDuration: (requestEndTime - requestStartTime) / 1000,
        userAgent,
        ip,
        author,
        eventAddedVia
    });
})

app.get('/user/preloadSettings', async function (req, res) {
    try {
        const rcAccessToken = req.query.rcAccessToken;
        const rcAccountId = req.query.rcAccountId;
        if (rcAccessToken || rcAccountId) {
            const userSettings = await userCore.getUserSettingsByAdmin({ rcAccessToken, rcAccountId });
            res.status(200).send(userSettings);
        }
        else {
            res.status(400).send('Cannot find rc user login');
        }
    }
    catch (e) {
        console.log(`${e.stack}`);
        res.status(400).send(e);
    }
}
);
app.get('/user/settings', async function (req, res) {
    const requestStartTime = new Date().getTime();
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
                res.status(400).send();
            }
            else {
                const rcAccessToken = req.query.rcAccessToken;
                const rcAccountId = req.query.rcAccountId;
                const userSettings = await userCore.getUserSettings({ user, rcAccessToken, rcAccountId });
                success = true;
                res.status(200).send(userSettings);
            }
        }
        else {
            success = false;
            res.status(400).send('Please go to Settings and authorize CRM platform');
        }
    }
    catch (e) {
        console.log(`platform: ${platformName} \n${e.stack}`);
    }
    const requestEndTime = new Date().getTime();
    analytics.track({
        eventName: 'Get user settings',
        interfaceName: 'getUserSettings',
        adapterName: platformName,
        rcAccountId: hashedAccountId,
        extensionId: hashedExtensionId,
        success,
        requestDuration: (requestEndTime - requestStartTime) / 1000,
        userAgent,
        ip,
        author,
        eventAddedVia
    });
});

app.post('/user/settings', async function (req, res) {
    const requestStartTime = new Date().getTime();
    let platformName = null;
    let success = false;
    const { hashedExtensionId, hashedAccountId, userAgent, ip, author, eventAddedVia } = getAnalyticsVariablesInReqHeaders({ headers: req.headers })
    try {
        const jwtToken = req.query.jwtToken;
        if (jwtToken) {
            const unAuthData = jwt.decodeJwt(jwtToken);
            platformName = unAuthData?.platform;
            if (!platformName) {
                res.status(400).send('Unknown platform');
            }
            const user = await UserModel.findByPk(unAuthData?.id);
            if (!user) {
                res.status(400).send();
            }
            const { userSettings } = await userCore.updateUserSettings({ user, userSettings: req.body.userSettings, platformName });
            res.status(200).send({ userSettings });
            success = true;
        }
        else {
            res.status(400).send('Please go to Settings and authorize CRM platform');
            success = false;
        }
    }
    catch (e) {
        console.log(`platform: ${platformName} \n${e.stack}`);
    }
    const requestEndTime = new Date().getTime();
    analytics.track({
        eventName: 'Set user settings',
        interfaceName: 'setUserSettings',
        adapterName: platformName,
        rcAccountId: hashedAccountId,
        extensionId: hashedExtensionId,
        success,
        requestDuration: (requestEndTime - requestStartTime) / 1000,
        userAgent,
        ip,
        author,
        eventAddedVia
    });
});

app.get('/hostname', async function (req, res) {
    try {
        const jwtToken = req.query.jwtToken;
        if (jwtToken) {
            const unAuthData = jwt.decodeJwt(jwtToken);
            const user = await UserModel.findByPk(unAuthData?.id);
            if (!user) {
                res.status(400).send();
                return;
            }
            res.status(200).send(user.hostname);
        }
        else {
            res.status(400).send('Please go to Settings and authorize CRM platform');
        }
    }
    catch (e) {
        console.log(`${e.stack}`);
        res.status(500).send(e);
    }
})

app.get('/oauth-callback', async function (req, res) {
    const requestStartTime = new Date().getTime();
    let platformName = null;
    let success = false;
    const { hashedExtensionId, hashedAccountId, userAgent, ip, author, eventAddedVia } = getAnalyticsVariablesInReqHeaders({ headers: req.headers })
    try {
        if (!req.query?.callbackUri || req.query.callbackUri === 'undefined') {
            throw 'Missing callbackUri';
        }
        platformName = req.query.state ?
            req.query.state.split('platform=')[1] :
            decodeURIComponent(req.originalUrl).split('state=')[1].split('&')[0].split('platform=')[1];
        const hostname = req.query.hostname;
        const tokenUrl = req.query.tokenUrl;
        if (!platformName) {
            throw 'Missing platform name';
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
            callbackUri: req.query.callbackUri,
            apiUrl: req.query.apiUrl,
            username: req.query.username,
            query: req.query
        });
        if (userInfo) {
            const jwtToken = jwt.generateJwt({
                id: userInfo.id.toString(),
                platform: platformName
            });
            res.status(200).send({ jwtToken, name: userInfo.name, returnMessage });
            success = true;
        }
        else {
            res.status(200).send({ returnMessage });
            success = false;
        }
    }
    catch (e) {
        console.log(`platform: ${platformName} \n${e.stack}`);
        res.status(400).send(e);
        success = false;
    }
    const requestEndTime = new Date().getTime();
    analytics.track({
        eventName: 'OAuth Callback',
        interfaceName: 'onOAuthCallback',
        adapterName: platformName,
        rcAccountId: hashedAccountId,
        extensionId: hashedExtensionId,
        success,
        requestDuration: (requestEndTime - requestStartTime) / 1000,
        userAgent,
        ip,
        author,
        eventAddedVia
    });
})
app.post('/apiKeyLogin', async function (req, res) {
    const requestStartTime = new Date().getTime();
    let platformName = null;
    let success = false;
    const { hashedExtensionId, hashedAccountId, userAgent, ip, author, eventAddedVia } = getAnalyticsVariablesInReqHeaders({ headers: req.headers })
    try {
        const platform = req.body.platform;
        platformName = platform;
        const apiKey = req.body.apiKey;
        const hostname = req.body.hostname;
        const additionalInfo = req.body.additionalInfo;
        if (!platform) {
            throw 'Missing platform name';
        }
        if (!apiKey) {
            throw 'Missing api key';
        }
        const { userInfo, returnMessage } = await authCore.onApiKeyLogin({ platform, hostname, apiKey, additionalInfo });
        if (userInfo) {
            const jwtToken = jwt.generateJwt({
                id: userInfo.id.toString(),
                platform: platform
            });
            res.status(200).send({ jwtToken, name: userInfo.name, returnMessage });
            success = true;
        }
        else {
            res.status(400).send({ returnMessage });
            success = false;
        }
    }
    catch (e) {
        console.log(`platform: ${platformName} \n${e.stack}`);
        res.status(400).send(e);
        success = false;
    }
    const requestEndTime = new Date().getTime();
    analytics.track({
        eventName: 'API Key Login',
        interfaceName: 'onApiKeyLogin',
        adapterName: platformName,
        rcAccountId: hashedAccountId,
        extensionId: hashedExtensionId,
        success,
        requestDuration: (requestEndTime - requestStartTime) / 1000,
        userAgent,
        ip,
        author,
        eventAddedVia
    });
})
app.post('/unAuthorize', async function (req, res) {
    const requestStartTime = new Date().getTime();
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
                res.status(400).send();
                return;
            }
            const platformModule = adapterRegistry.getAdapter(unAuthData?.platform ?? 'Unknown');
            const { returnMessage } = await platformModule.unAuthorize({ user: userToLogout });
            res.status(200).send({ returnMessage });
            success = true;
        }
        else {
            res.status(400).send('Please go to Settings and authorize CRM platform');
            success = false;
        }
    }
    catch (e) {
        console.log(`platform: ${platformName} \n${e.stack}`);
        res.status(400).send(e);
        success = false;
    }
    const requestEndTime = new Date().getTime();
    analytics.track({
        eventName: 'Unauthorize',
        interfaceName: 'unAuthorize',
        adapterName: platformName,
        rcAccountId: hashedAccountId,
        extensionId: hashedExtensionId,
        success,
        requestDuration: (requestEndTime - requestStartTime) / 1000,
        userAgent,
        ip,
        author,
        eventAddedVia
    });
});
app.get('/userInfoHash', async function (req, res) {
    try {
        const extensionId = util.getHashValue(req.query.extensionId, process.env.HASH_KEY);
        const accountId = util.getHashValue(req.query.accountId, process.env.HASH_KEY);
        res.status(200).send({ extensionId, accountId });
    }
    catch (e) {
        console.log(`${e.stack}`);
        res.status(400).send(e);
    }
})
app.get('/contact', async function (req, res) {
    const requestStartTime = new Date().getTime();
    let platformName = null;
    let success = false;
    let resultCount = 0;
    let extraData = {};
    const { hashedExtensionId, hashedAccountId, userAgent, ip, author, eventAddedVia } = getAnalyticsVariablesInReqHeaders({ headers: req.headers })
    try {
        const jwtToken = req.query.jwtToken;
        if (jwtToken) {
            const decodedToken = jwt.decodeJwt(jwtToken);
            if (!decodedToken) {
                res.status(400).send('Please go to Settings and authorize CRM platform');
                return;
            }
            const { id: userId, platform } = decodedToken;
            platformName = platform;
            const { successful, returnMessage, contact, extraDataTracking } = await contactCore.findContact({ platform, userId, phoneNumber: req.query.phoneNumber.replace(' ', '+'), overridingFormat: req.query.overridingFormat, isExtension: req.query?.isExtension ?? false });
            res.status(200).send({ successful, returnMessage, contact });
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
            res.status(400).send('Please go to Settings and authorize CRM platform');
            success = false;
        }
    }
    catch (e) {
        console.log(`platform: ${platformName} \n${e.stack}`);
        extraData.statusCode = e.response?.status ?? 'unknown';
        res.status(400).send(e);
        success = false;
    }
    const requestEndTime = new Date().getTime();
    analytics.track({
        eventName: 'Find contact',
        interfaceName: 'findContact',
        adapterName: platformName,
        rcAccountId: hashedAccountId,
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
app.post('/contact', async function (req, res) {
    const requestStartTime = new Date().getTime();
    let platformName = null;
    let success = false;
    let extraData = {};
    const { hashedExtensionId, hashedAccountId, userAgent, ip, author, eventAddedVia } = getAnalyticsVariablesInReqHeaders({ headers: req.headers })
    try {
        const jwtToken = req.query.jwtToken;
        if (jwtToken) {
            const decodedToken = jwt.decodeJwt(jwtToken);
            if (!decodedToken) {
                res.status(400).send('Please go to Settings and authorize CRM platform');
                return;
            }
            const { id: userId, platform } = decodedToken;
            platformName = platform;
            const { successful, returnMessage, contact, extraDataTracking } = await contactCore.createContact({ platform, userId, phoneNumber: req.body.phoneNumber, newContactName: req.body.newContactName, newContactType: req.body.newContactType, additionalSubmission: req.body.additionalSubmission });
            res.status(200).send({ successful, returnMessage, contact });
            success = true;
            if (extraDataTracking) {
                extraData = extraDataTracking;
            }
        }
        else {
            res.status(400).send('Please go to Settings and authorize CRM platform');
            success = false;
        }
    }
    catch (e) {
        console.log(`platform: ${platformName} \n${e.stack}`);
        extraData.statusCode = e.response?.status ?? 'unknown';
        res.status(400).send(e);
        success = false;
    }
    const requestEndTime = new Date().getTime();
    analytics.track({
        eventName: 'Create contact',
        interfaceName: 'createContact',
        adapterName: platformName,
        rcAccountId: hashedAccountId,
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
app.get('/callLog', async function (req, res) {
    const requestStartTime = new Date().getTime();
    let platformName = null;
    let success = false;
    let extraData = {};
    const { hashedExtensionId, hashedAccountId, userAgent, ip, author, eventAddedVia } = getAnalyticsVariablesInReqHeaders({ headers: req.headers })
    try {
        const jwtToken = req.query.jwtToken;
        if (jwtToken) {
            const decodedToken = jwt.decodeJwt(jwtToken);
            if (!decodedToken) {
                res.status(400).send('Please go to Settings and authorize CRM platform');
                return;
            }
            const { id: userId, platform } = decodedToken;
            platformName = platform;
            const { successful, logs, returnMessage, extraDataTracking } = await logCore.getCallLog({ userId, sessionIds: req.query.sessionIds, platform, requireDetails: req.query.requireDetails === 'true' });
            res.status(200).send({ successful, logs, returnMessage });
            success = true;
            if (extraDataTracking) {
                extraData = extraDataTracking;
            }
        }
        else {
            res.status(400).send('Please go to Settings and authorize CRM platform');
            success = false;
        }
    }
    catch (e) {
        console.log(`platform: ${platformName} \n${e.stack}`);
        extraData.statusCode = e.response?.status ?? 'unknown';
        res.status(400).send(e);
        success = false;
    }
    const requestEndTime = new Date().getTime();
    analytics.track({
        eventName: 'Get call log',
        interfaceName: 'getCallLog',
        adapterName: platformName,
        rcAccountId: hashedAccountId,
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
app.post('/callLog', async function (req, res) {
    const requestStartTime = new Date().getTime();
    let platformName = null;
    let success = false;
    let extraData = {};
    const { hashedExtensionId, hashedAccountId, userAgent, ip, author, eventAddedVia } = getAnalyticsVariablesInReqHeaders({ headers: req.headers })
    try {
        const jwtToken = req.query.jwtToken;
        if (jwtToken) {
            const decodedToken = jwt.decodeJwt(jwtToken);
            if (!decodedToken) {
                res.status(400).send('Please go to Settings and authorize CRM platform');
                return;
            }
            const { id: userId, platform } = decodedToken;
            platformName = platform;
            const { successful, logId, returnMessage, extraDataTracking } = await logCore.createCallLog({ platform, userId, incomingData: req.body });
            if (extraDataTracking) {
                extraData = extraDataTracking;
            }
            res.status(200).send({ successful, logId, returnMessage });
            success = true;
        }
        else {
            res.status(400).send('Please go to Settings and authorize CRM platform');
            success = false;
        }
    }
    catch (e) {
        console.log(`platform: ${platformName} \n${e.stack}`);
        extraData.statusCode = e.response?.status ?? 'unknown';
        res.status(400).send(e);
        success = false;
    }
    const requestEndTime = new Date().getTime();
    analytics.track({
        eventName: 'Create call log',
        interfaceName: 'createCallLog',
        adapterName: platformName,
        rcAccountId: hashedAccountId,
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
app.patch('/callLog', async function (req, res) {
    const requestStartTime = new Date().getTime();
    let platformName = null;
    let success = false;
    let extraData = {};
    const { hashedExtensionId, hashedAccountId, userAgent, ip, author, eventAddedVia } = getAnalyticsVariablesInReqHeaders({ headers: req.headers })
    try {
        const jwtToken = req.query.jwtToken;
        if (jwtToken) {
            const decodedToken = jwt.decodeJwt(jwtToken);
            if (!decodedToken) {
                res.status(400).send('Please go to Settings and authorize CRM platform');
                return;
            }
            const { id: userId, platform } = decodedToken;
            platformName = platform;
            const { successful, logId, updatedNote, returnMessage, extraDataTracking } = await logCore.updateCallLog({ platform, userId, incomingData: req.body });
            if (extraDataTracking) {
                extraData = extraDataTracking;
            }
            res.status(200).send({ successful, logId, updatedNote, returnMessage });
            success = true;
        }
        else {
            res.status(400).send('Please go to Settings and authorize CRM platform');
            success = false;
        }
    }
    catch (e) {
        console.log(`platform: ${platformName} \n${e.stack}`);
        extraData.statusCode = e.response?.status ?? 'unknown';
        res.status(400).send(e);
        success = false;
    }
    const requestEndTime = new Date().getTime();
    analytics.track({
        eventName: 'Update call log',
        interfaceName: 'updateCallLog',
        adapterName: platformName,
        rcAccountId: hashedAccountId,
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
app.put('/callDisposition', async function (req, res) {
    const requestStartTime = new Date().getTime();
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
                res.status(400).send();
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
            res.status(200).send({ successful, returnMessage });
            success = true;
        }
        else {
            res.status(400).send('Please go to Settings and authorize CRM platform');
            success = false;
        }
    }
    catch (e) {
        console.log(`platform: ${platformName} \n${e.stack}`);
        extraData.statusCode = e.response?.status ?? 'unknown';
        res.status(400).send(e);
        success = false;
    }
    const requestEndTime = new Date().getTime();
    analytics.track({
        eventName: 'Create call log',
        interfaceName: 'createCallLog',
        adapterName: platformName,
        rcAccountId: hashedAccountId,
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
app.post('/messageLog', async function (req, res) {
    const requestStartTime = new Date().getTime();
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
                res.status(400).send('Please go to Settings and authorize CRM platform');
                return;
            }
            const { id: userId, platform } = decodedToken;
            platformName = platform;
            const { successful, returnMessage, logIds, extraDataTracking } = await logCore.createMessageLog({ platform, userId, incomingData: req.body });
            if (extraDataTracking) {
                extraData = extraDataTracking;
            }
            res.status(200).send({ successful, returnMessage, logIds });
            success = true;
        }
        else {
            res.status(400).send('Please go to Settings and authorize CRM platform');
            success = false;
        }
    }
    catch (e) {
        console.log(`platform: ${platformName} \n${e.stack}`);
        statusCode = e.response?.status ?? 'unknown';
        res.status(400).send(e);
        success = false;
    }
    const requestEndTime = new Date().getTime();
    analytics.track({
        eventName: 'Create message log',
        interfaceName: 'createMessageLog',
        adapterName: platformName,
        rcAccountId: hashedAccountId,
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

app.get('/custom/contact/search', async function (req, res) {
    const requestStartTime = new Date().getTime();
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
            res.status(200).send({ successful, returnMessage, contact });
            success = successful;
        }
        else {
            res.status(400).send('Please go to Settings and authorize CRM platform');
            success = false;
        }

    }
    catch (e) {
        console.log(`platform: ${platformName} \n${e.stack}`);
        statusCode = e.response?.status ?? 'unknown';
        res.status(400).send(e);
        success = false;
    }
    const requestEndTime = new Date().getTime();
    analytics.track({
        eventName: 'Contact Search by Name',
        interfaceName: 'contactSearchByName',
        adapterName: platformName,
        rcAccountId: hashedAccountId,
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
if (process.env.IS_PROD === 'false') {
    app.post('/registerMockUser', async function (req, res) {
        const secretKey = req.query.secretKey;
        if (secretKey === process.env.APP_SERVER_SECRET_KEY) {
            const mockUser = await mock.createUser({ userName: req.body.userName });
            res.status(200).send(mockUser ? 'Mock user registered' : 'Mock user already existed');
        }
        else {
            res.status(401).send('Unauthorized');
        }
    });
    app.delete('/deleteMockUser', async function (req, res) {
        const secretKey = req.query.secretKey;
        if (secretKey === process.env.APP_SERVER_SECRET_KEY) {
            const foundAndDeleted = await mock.deleteUser({ userName: req.query.userName });
            res.status(200).send(foundAndDeleted ? 'Mock user deleted' : 'Mock user not found');
        }
        else {
            res.status(401).send('Unauthorized');
        }
    });
    app.get('/mockCallLog', async function (req, res) {
        const secretKey = req.query.secretKey;
        if (secretKey === process.env.APP_SERVER_SECRET_KEY) {
            const callLogs = await mock.getCallLog({ sessionIds: req.query.sessionIds });
            res.status(200).send(callLogs);
        }
        else {
            res.status(401).send('Unauthorized');
        }
    });
    app.post('/mockCallLog', async function (req, res) {
        const secretKey = req.query.secretKey;
        if (secretKey === process.env.APP_SERVER_SECRET_KEY) {
            await mock.createCallLog({ sessionId: req.body.sessionId });
            res.status(200).send('Mock call log created');
        }
        else {
            res.status(401).send('Unauthorized');
        }
    });
    app.delete('/mockCallLog', async function (req, res) {
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

exports.getApp = function getServer() {
    initDB();
    analytics.init();
    return app;
}
exports.adapterRegistry = adapterRegistry;
