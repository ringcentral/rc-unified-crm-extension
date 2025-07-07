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
const dispositionCore = require('./core/disposition');
const mock = require('./adapters/mock');
const releaseNotes = require('./releaseNotes.json');
const axios = require('axios');
const analytics = require('./lib/analytics');
const util = require('./lib/util');
const dynamoose = require('dynamoose');
const googleSheetsExtra = require('./adapters/googleSheets/extra.js');
const { truncate } = require('fs');
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
    res.json(releaseNotes);
})

app.get('/crmManifest', (req, res) => {
    try {
        if (!req.query.platformName) {
            const defaultCrmManifest = require('./adapters/manifest.json');
            if (process.env.OVERRIDE_APP_SERVER) {
                defaultCrmManifest.serverUrl = process.env.OVERRIDE_APP_SERVER;
            }
            res.json(defaultCrmManifest);
            return;
        }
        const crmManifest = require(`./adapters/${req.query.platformName}/manifest.json`);
        if (crmManifest) {
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
    const defaultCrmManifest = require('./adapters/manifest.json');
    res.send({ version: defaultCrmManifest.version });
});

// Unique: Google Sheets
app.get('/googleSheets/filePicker', async function (req, res) {
    try {
        const jwtToken = req.query.token;
        if (jwtToken) {
            const unAuthData = jwt.decodeJwt(jwtToken);
            const user = await UserModel.findByPk(unAuthData?.id);
            if (!user) {
                res.status(400).send();
                return;
            }
            const fileContent = await googleSheetsExtra.renderPickerFile({ user });
            res.send(fileContent);
        }


    }
    catch (e) {
        console.log(`platform: googleSheets \n${e.stack}`);
        res.status(500).send(e);
    }
})
// Unique: Google Sheets
app.post('/googleSheets/sheet', async function (req, res) {
    try {
        const jwtToken = req.query.jwtToken;
        if (jwtToken) {
            const unAuthData = jwt.decodeJwt(jwtToken);
            const user = await UserModel.findByPk(unAuthData?.id);
            if (!user) {
                res.status(400).send();
                return;
            }
            const { successful, sheetName, sheetUrl } = await googleSheetsExtra.createNewSheet({ user, data: req.body });
            if (successful) {
                res.status(200).send({
                    name: sheetName,
                    url: sheetUrl
                });
                return;
            }
            else {
                res.status(500).send('Failed to create new sheet');
                return;
            }
        }
        else {
            res.status(400).send('Please go to Settings and authorize CRM platform');
            return;
        }
    }
    catch (e) {
        console.log(`platform: googleSheets \n${e.stack}`);
        res.status(500).send(e);
    }
});

// Unique: Google Sheets
app.delete('/googleSheets/sheet', async function (req, res) {
    try {
        const jwtToken = req.query.jwtToken;
        if (jwtToken) {
            const unAuthData = jwt.decodeJwt(jwtToken);
            const user = await UserModel.findByPk(unAuthData?.id);
            if (!user) {
                res.status(400).send();
            }
            await googleSheetsExtra.removeSheet({ user });
            res.status(200).send('Sheet removed');
        }
        else {
            res.status(400).send('Please go to Settings and authorize CRM platform');
        }
    }
    catch (e) {
        console.log(`platform: googleSheets \n${e.stack}`);
        res.status(500).send(e);
    }
});

// Unique: Google Sheets
app.post('/googleSheets/selectedSheet', async function (req, res) {
    const authHeader = `Bearer ${req.body.accessToken}`;
    const response = await axios.get(`https://www.googleapis.com/oauth2/v3/userinfo`, {
        headers: {
            Authorization: authHeader
        }
    });
    const data = response?.data;
    const user = await UserModel.findByPk(data?.sub);
    if (!user) {
        res.status(400).send();
    }
    const { successful, sheetName, sheetUrl } = await googleSheetsExtra.updateSelectedSheet({ user, data: req.body });

    res.status(200).send({ message: 'Sheet selected', Id: req.body.field });
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
            const platformModule = require(`./adapters/${unAuthData?.platform ?? 'Unknown'}`);
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
            const { id: userId, platform } = jwt.decodeJwt(jwtToken);
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
            const { id: userId, platform } = jwt.decodeJwt(jwtToken);
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
            const { id: userId, platform } = jwt.decodeJwt(jwtToken);
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
            const { id: userId, platform } = jwt.decodeJwt(jwtToken);
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
            const { id: userId, platform } = jwt.decodeJwt(jwtToken);
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
            const { id: userId, platform } = jwt.decodeJwt(jwtToken);
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

exports.getServer = function getServer() {
    initDB();
    analytics.init();
    return app;
}