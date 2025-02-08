const path = require('path');
const express = require('express');
const bodyParser = require('body-parser')
const { UserModel } = require('./models/userModel');
const { CallLogModel } = require('./models/callLogModel');
const { MessageLogModel } = require('./models/messageLogModel');
const { AdminConfigModel } = require('./models/adminConfigModel');
const { CacheModel } = require('./models/cacheModel');
const cors = require('cors')
const jwt = require('./lib/jwt');
const logCore = require('./core/log');
const contactCore = require('./core/contact');
const authCore = require('./core/auth');
const adminCore = require('./core/admin');
const userCore = require('./core/user');
const releaseNotes = require('./releaseNotes.json');
const axios = require('axios');
const analytics = require('./lib/analytics');
const util = require('./lib/util');
let packageJson = null;
try {
    packageJson = require('./package.json');
}
catch (e) {
    packageJson = require('../package.json');
}

axios.defaults.headers.common['Unified-CRM-Extension-Version'] = packageJson.version;

async function initDB() {
    console.log('creating db tables if not exist...');
    await UserModel.sync();
    await CallLogModel.sync();
    await MessageLogModel.sync();
    await AdminConfigModel.sync();
    await CacheModel.sync();
    console.log('db tables created');
}

initDB();
analytics.init();
const app = express();
app.use(bodyParser.json())

app.use(cors({
    methods: ['GET', 'POST', 'PATCH']
}));

app.get('/releaseNotes', async function (req, res) {
    res.json(releaseNotes);
})

app.get('/crmManifest', (req, res) => {
    try {
        if (!!!req.query.platformName) {
            const defaultCrmManifest = require('./adapters/manifest.json');
            res.json(defaultCrmManifest);
            return;
        }
        const crmManifest = require(`./adapters/${req.query.platformName}/manifest.json`);
        if (!!crmManifest) {
            if (!!!crmManifest.author?.name) {
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
    const { hashedExtensionId, hashedAccountId, userAgent, ip, author } = getAnalyticsVariablesInReqHeaders({ headers: req.headers })
    try {
        const jwtToken = req.query.jwtToken;
        if (!!jwtToken) {
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
        }
    });
});

app.get('/serverVersionInfo', (req, res) => {
    const defaultCrmManifest = require('./adapters/manifest.json');
    res.send({ version: defaultCrmManifest.version });
});

// Unique: Pipedrive
app.get('/pipedrive-redirect', function (req, res) {
    try {
        res.sendFile(path.join(__dirname, 'adapters/pipedrive/redirect.html'));
    }
    catch (e) {
        console.log(`platform: pipedrive \n${e.stack}`);
        res.status(500).send(e);
    }
})
// Unique: Pipedrive
app.delete('/pipedrive-redirect', async function (req, res) {
    try {
        const basicAuthHeader = Buffer.from(`${process.env.PIPEDRIVE_CLIENT_ID}:${process.env.PIPEDRIVE_CLIENT_SECRET}`).toString('base64');
        if (`Basic ${basicAuthHeader}` === req.get('authorization')) {
            const platformModule = require(`./adapters/pipedrive`);
            await platformModule.unAuthorize({ id: req.body.user_id });
            await UserModel.destroy({
                where: {
                    id: req.body.user_id,
                    platform: 'pipedrive'
                }
            });
        }
    }
    catch (e) {
        console.log(`platform: pipedrive \n${e.stack}`);
        res.status(500).send(e);
    }
})

app.post('/admin/settings', async function (req, res) {
    const requestStartTime = new Date().getTime();
    let success = false;
    const { hashedExtensionId, hashedAccountId, userAgent, ip, author } = getAnalyticsVariablesInReqHeaders({ headers: req.headers })
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
        accountId: hashedAccountId,
        extensionId: hashedExtensionId,
        success,
        requestDuration: (requestEndTime - requestStartTime) / 1000,
        userAgent,
        ip,
        author
    });
});

app.get('/admin/settings', async function (req, res) {
    const requestStartTime = new Date().getTime();
    let platformName = null;
    let success = false;
    const { hashedExtensionId, hashedAccountId, userAgent, ip, author } = getAnalyticsVariablesInReqHeaders({ headers: req.headers })
    try {
        const jwtToken = req.query.jwtToken;
        if (!!jwtToken) {
            const unAuthData = jwt.decodeJwt(jwtToken);
            platformName = unAuthData.platform;
            const user = await UserModel.findOne({
                where: {
                    id: unAuthData.id,
                    platform: unAuthData.platform
                }
            });
            if (!!!user) {
                res.status(400).send('Unknown user');
            }
            const { isValidated, rcAccountId } = await adminCore.validateAdminRole({ rcAccessToken: req.query.rcAccessToken });
            const hashedRcAccountId = util.getHashValue(rcAccountId, process.env.HASH_KEY);
            if (isValidated) {
                const adminSettings = await adminCore.getAdminSettings({ hashedRcAccountId });
                if (!!adminSettings) {
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
        console.log(`platform: ${platformName} \n${e.stack}`);
        res.status(400).send(e);
    }
    const requestEndTime = new Date().getTime();
    analytics.track({
        eventName: 'Get admin settings',
        interfaceName: 'getAdminSettings',
        adapterName: platformName,
        accountId: hashedAccountId,
        extensionId: hashedExtensionId,
        success,
        requestDuration: (requestEndTime - requestStartTime) / 1000,
        userAgent,
        ip,
        author
    });
});

app.get('/user/preloadSettings', async function (req, res) {
    try {
        const rcAccessToken = req.query.rcAccessToken;
        if (!!rcAccessToken) {
            const userSettings = await userCore.userSettingsByAdmin({ rcAccessToken });
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
    const { hashedExtensionId, hashedAccountId, userAgent, ip, author } = getAnalyticsVariablesInReqHeaders({ headers: req.headers })
    try {
        const jwtToken = req.query.jwtToken;
        if (!!jwtToken) {
            const unAuthData = jwt.decodeJwt(jwtToken);
            platformName = unAuthData.platform;
            const user = await UserModel.findOne({
                where: {
                    id: unAuthData.id,
                    platform: unAuthData.platform
                }
            });
            if (!!!user) {
                res.status(400).send('Unknown user');
            }
            const rcAccessToken = req.query.rcAccessToken;
            let userSettingsByAdmin = [];
            if (!!rcAccessToken) {
                userSettingsByAdmin = await userCore.userSettingsByAdmin({ rcAccessToken });
            }

            // For non-readonly admin settings, user use its own setting
            let userSettings = await user.userSettings;
            let result = {};
            if (!!!userSettingsByAdmin?.userSettings) {
                result = userSettings;
            }
            else {
                if (!!userSettingsByAdmin?.userSettings && !!userSettings) {
                    const keys = Object.keys(userSettingsByAdmin.userSettings).concat(Object.keys(userSettings));
                    // distinct keys
                    for (const key of new Set(keys)) {
                        // from user's own settings
                        if ((userSettingsByAdmin.userSettings[key] === undefined || userSettingsByAdmin.userSettings[key].customizable) && userSettings[key] !== undefined) {
                            result[key] = {
                                customizable: true,
                                value: userSettings[key].value
                            };
                        }
                        // from admin settings
                        else {
                            result[key] = userSettingsByAdmin.userSettings[key];
                        }
                    }
                }
            }
            success = true;
            res.status(200).send(result);
        }
        else {
            success = false;
            res.status(400).send('Please go to Settings and authorize CRM platform');
        }
    }
    catch (e) {
        console.log(`platform: ${platformName} \n${e.stack}`);
        res.status(400).send(e);
    }
    const requestEndTime = new Date().getTime();
    analytics.track({
        eventName: 'Get user settings',
        interfaceName: 'getUserSettings',
        adapterName: platformName,
        accountId: hashedAccountId,
        extensionId: hashedExtensionId,
        success,
        requestDuration: (requestEndTime - requestStartTime) / 1000,
        userAgent,
        ip,
        author
    });
});

app.post('/user/settings', async function (req, res) {
    const requestStartTime = new Date().getTime();
    let platformName = null;
    let success = false;
    const { hashedExtensionId, hashedAccountId, userAgent, ip, author } = getAnalyticsVariablesInReqHeaders({ headers: req.headers })
    try {
        const jwtToken = req.query.jwtToken;
        if (!!jwtToken) {
            const unAuthData = jwt.decodeJwt(jwtToken);
            platformName = unAuthData.platform;
            const user = await UserModel.findOne({
                where: {
                    id: unAuthData.id,
                    platform: unAuthData.platform
                }
            });
            if (!!!user) {
                res.status(400).send('Unknown user');
            }
            await userCore.updateUserSettings({ user, userSettings: req.body.userSettings });
            res.status(200).send('User settings updated');
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
    }
    const requestEndTime = new Date().getTime();
    analytics.track({
        eventName: 'Set user settings',
        interfaceName: 'setUserSettings',
        adapterName: platformName,
        accountId: hashedAccountId,
        extensionId: hashedExtensionId,
        success,
        requestDuration: (requestEndTime - requestStartTime) / 1000,
        userAgent,
        ip,
        author
    });
});

app.get('/hostname', async function (req, res) {
    try {
        const jwtToken = req.query.jwtToken;
        if (!!jwtToken) {
            const unAuthData = jwt.decodeJwt(jwtToken);
            const user = await UserModel.findOne({
                where: {
                    id: unAuthData.id,
                    platform: unAuthData.platform
                }
            });
            if (!!!user) {
                res.status(400).send('Unknown user');
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
    const { hashedExtensionId, hashedAccountId, userAgent, ip, author } = getAnalyticsVariablesInReqHeaders({ headers: req.headers })
    try {
        if (!!!req.query?.callbackUri || req.query.callbackUri === 'undefined') {
            throw 'Missing callbackUri';
        }
        platformName = platform = req.query.state ?
            req.query.state.split('platform=')[1] :
            decodeURIComponent(req.originalUrl).split('state=')[1].split('&')[0].split('platform=')[1];
        const hostname = req.query.hostname;
        const tokenUrl = req.query.tokenUrl;
        if (!platform) {
            throw 'Missing platform name';
        }
        const hasAuthCodeInCallbackUri = req.query.callbackUri.includes('code=');
        if (!hasAuthCodeInCallbackUri) {
            req.query.callbackUri = `${req.query.callbackUri}&code=${req.query.code}`;
        }
        const { userInfo, returnMessage } = await authCore.onOAuthCallback({
            platform,
            hostname,
            tokenUrl,
            callbackUri: req.query.callbackUri,
            apiUrl: req.query.apiUrl,
            username: req.query.username,
            query: req.query
        });
        if (!!userInfo) {
            const jwtToken = jwt.generateJwt({
                id: userInfo.id.toString(),
                platform: platform
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
        accountId: hashedAccountId,
        extensionId: hashedExtensionId,
        success,
        requestDuration: (requestEndTime - requestStartTime) / 1000,
        userAgent,
        ip,
        author
    });
})
app.post('/apiKeyLogin', async function (req, res) {
    const requestStartTime = new Date().getTime();
    let platformName = null;
    let success = false;
    const { hashedExtensionId, hashedAccountId, userAgent, ip, author } = getAnalyticsVariablesInReqHeaders({ headers: req.headers })
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
        if (!!userInfo) {
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
        accountId: hashedAccountId,
        extensionId: hashedExtensionId,
        success,
        requestDuration: (requestEndTime - requestStartTime) / 1000,
        userAgent,
        ip,
        author
    });
})
app.post('/unAuthorize', async function (req, res) {
    const requestStartTime = new Date().getTime();
    let platformName = null;
    let success = false;
    const { hashedExtensionId, hashedAccountId, userAgent, ip, author } = getAnalyticsVariablesInReqHeaders({ headers: req.headers })
    try {
        const jwtToken = req.query.jwtToken;
        if (!!jwtToken) {
            const unAuthData = jwt.decodeJwt(jwtToken);
            platformName = unAuthData.platform;
            const userToLogout = await UserModel.findOne({
                where: {
                    id: unAuthData.id,
                    platform: unAuthData.platform
                }
            });
            if (!!!userToLogout) {
                res.status(400).send('Unknown user');
                return;
            }
            const platformModule = require(`./adapters/${unAuthData.platform}`);
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
        accountId: hashedAccountId,
        extensionId: hashedExtensionId,
        success,
        requestDuration: (requestEndTime - requestStartTime) / 1000,
        userAgent,
        ip,
        author
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
    let statusCode = 200;
    let extraData = {};
    const { hashedExtensionId, hashedAccountId, userAgent, ip, author } = getAnalyticsVariablesInReqHeaders({ headers: req.headers })
    try {
        const jwtToken = req.query.jwtToken;
        if (!!jwtToken) {
            const { id: userId, platform } = jwt.decodeJwt(jwtToken);
            platformName = platform;
            const { successful, returnMessage, contact, extraDataTracking } = await contactCore.findContact({ platform, userId, phoneNumber: req.query.phoneNumber, overridingFormat: req.query.overridingFormat, isExtension: req.query?.isExtension ?? false });
            res.status(200).send({ successful, returnMessage, contact });
            if (successful) {
                const nonNewContact = contact?.filter(c => !c.isNewContact) ?? [];
                resultCount = nonNewContact.length;
                success = true;
                if (!!extraDataTracking) {
                    extraData = extraDataTracking;
                }
            }
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
        eventName: 'Find contact',
        interfaceName: 'findContact',
        adapterName: platformName,
        accountId: hashedAccountId,
        extensionId: hashedExtensionId,
        success,
        requestDuration: (requestEndTime - requestStartTime) / 1000,
        userAgent,
        ip,
        author,
        extras: {
            resultCount,
            statusCode,
            ...extraData
        },
    });
});
app.post('/contact', async function (req, res) {
    const requestStartTime = new Date().getTime();
    let platformName = null;
    let success = false;
    let statusCode = 200;
    let extraData = {};
    const { hashedExtensionId, hashedAccountId, userAgent, ip, author } = getAnalyticsVariablesInReqHeaders({ headers: req.headers })
    try {
        const jwtToken = req.query.jwtToken;
        if (!!jwtToken) {
            const { id: userId, platform } = jwt.decodeJwt(jwtToken);
            platformName = platform;
            const { successful, returnMessage, contact, extraDataTracking } = await contactCore.createContact({ platform, userId, phoneNumber: req.body.phoneNumber, newContactName: req.body.newContactName, newContactType: req.body.newContactType });
            res.status(200).send({ successful, returnMessage, contact });
            success = true;
            if (!!extraDataTracking) {
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
        statusCode = e.response?.status ?? 'unknown';
        res.status(400).send(e);
        success = false;
    }
    const requestEndTime = new Date().getTime();
    analytics.track({
        eventName: 'Create contact',
        interfaceName: 'createContact',
        adapterName: platformName,
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
        }
    });
});
app.get('/callLog', async function (req, res) {
    const requestStartTime = new Date().getTime();
    let platformName = null;
    let success = false;
    let statusCode = 200;
    let extraData = {};
    const { hashedExtensionId, hashedAccountId, userAgent, ip, author } = getAnalyticsVariablesInReqHeaders({ headers: req.headers })
    try {
        const jwtToken = req.query.jwtToken;
        if (!!jwtToken) {
            const { id: userId, platform } = jwt.decodeJwt(jwtToken);
            platformName = platform;
            const { successful, logs, returnMessage, extraDataTracking } = await logCore.getCallLog({ userId, sessionIds: req.query.sessionIds, platform, requireDetails: req.query.requireDetails === 'true' });
            res.status(200).send({ successful, logs, returnMessage });
            success = true;
            if (!!extraDataTracking) {
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
        res.status(400).send(e);
        success = false;
    }
    const requestEndTime = new Date().getTime();
    analytics.track({
        eventName: 'Get call log',
        interfaceName: 'getCallLog',
        adapterName: platformName,
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
        }
    });
});
app.post('/callLog', async function (req, res) {
    const requestStartTime = new Date().getTime();
    let platformName = null;
    let success = false;
    let statusCode = 200;
    let extraData = {};
    const { hashedExtensionId, hashedAccountId, userAgent, ip, author } = getAnalyticsVariablesInReqHeaders({ headers: req.headers })
    try {
        const jwtToken = req.query.jwtToken;
        if (!!jwtToken) {
            const { id: userId, platform } = jwt.decodeJwt(jwtToken);
            platformName = platform;
            const { successful, logId, returnMessage, extraDataTracking } = await logCore.createCallLog({ platform, userId, incomingData: req.body });
            if (!!extraDataTracking) {
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
        statusCode = e.response?.status ?? 'unknown';
        res.status(400).send(e);
        success = false;
    }
    const requestEndTime = new Date().getTime();
    analytics.track({
        eventName: 'Create call log',
        interfaceName: 'createCallLog',
        adapterName: platformName,
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
        }
    });
});
app.patch('/callLog', async function (req, res) {
    const requestStartTime = new Date().getTime();
    let platformName = null;
    let success = false;
    let statusCode = 200;
    let extraData = {};
    const { hashedExtensionId, hashedAccountId, userAgent, ip, author } = getAnalyticsVariablesInReqHeaders({ headers: req.headers })
    try {
        const jwtToken = req.query.jwtToken;
        if (!!jwtToken) {
            const { id: userId, platform } = jwt.decodeJwt(jwtToken);
            platformName = platform;
            const { successful, logId, updatedNote, returnMessage, extraDataTracking } = await logCore.updateCallLog({ platform, userId, incomingData: req.body });
            if (!!extraDataTracking) {
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
        statusCode = e.response?.status ?? 'unknown';
        res.status(400).send(e);
        success = false;
    }
    const requestEndTime = new Date().getTime();
    analytics.track({
        eventName: 'Update call log',
        interfaceName: 'updateCallLog',
        adapterName: platformName,
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
        }
    });
});
app.post('/messageLog', async function (req, res) {
    const requestStartTime = new Date().getTime();
    let platformName = null;
    let success = false;
    let statusCode = 200;
    let extraData = {};
    const { hashedExtensionId, hashedAccountId, userAgent, ip, author } = getAnalyticsVariablesInReqHeaders({ headers: req.headers })
    try {
        const jwtToken = req.query.jwtToken;
        if (!!jwtToken) {
            const { id: userId, platform } = jwt.decodeJwt(jwtToken);
            platformName = platform;
            const { successful, returnMessage, logIds, extraDataTracking } = await logCore.createMessageLog({ platform, userId, incomingData: req.body });
            if (!!extraDataTracking) {
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
        }
    });
});

function getAnalyticsVariablesInReqHeaders({ headers }) {
    const hashedExtensionId = headers['rc-extension-id'];
    const hashedAccountId = headers['rc-account-id'];
    const ip = headers['x-forwarded-for']?.split(',')?.find(i => !i.startsWith('10.'));
    const userAgent = headers['user-agent'];
    const author = headers['developer-author-name'];
    return {
        hashedAccountId,
        hashedExtensionId,
        ip,
        userAgent,
        author
    }
}
exports.server = app;