const path = require('path');
const express = require('express');
const crypto = require('crypto');
const bodyParser = require('body-parser')
const { UserModel } = require('./models/userModel');
const { CallLogModel } = require('./models/callLogModel');
const { MessageLogModel } = require('./models/messageLogModel');
const cors = require('cors')
const jwt = require('./lib/jwt');
const logCore = require('./core/log');
const contactCore = require('./core/contact');
const authCore = require('./core/auth');
const releaseNotes = require('./releaseNotes.json');
const axios = require('axios');
const analytics = require('./lib/analytics');
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
    console.log('db tables created');
}

function getHashValue(string, secretKey) {
    return crypto.createHash('sha256').update(
        `${string}:${secretKey}`
    ).digest('hex');
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

app.get('/temp-bullhorn-migrate-userId', async function (req, res) {
    try {
        const jwtToken = req.query.jwtToken;
        if (!!jwtToken) {
            const { id: userId, platform } = jwt.decodeJwt(jwtToken);
            const userInfo = await authCore.tempMigrateBullhornUserId({ oldUserId: userId });
            if (!!userInfo) {
                const jwtToken = jwt.generateJwt({
                    id: userInfo.id.toString(),
                    platform: platform
                });
                res.status(200).send({ jwtToken, name: userInfo.name });
            }
            else {
                res.status(200).send();
            }
        }
        else {
            res.status(400).send('Please go to Settings and authorize CRM platform');
            success = false;
        }
        console.log('Event: bullhorn user id migrate')
    }
    catch (e) {
        console.log(`platform: bullhorn \n${e.stack}`);
        res.status(400).send(e);
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
        const extensionId = getHashValue(req.query.extensionId, process.env.HASH_KEY);
        const accountId = getHashValue(req.query.accountId, process.env.HASH_KEY);
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
    const { hashedExtensionId, hashedAccountId, userAgent, ip, author } = getAnalyticsVariablesInReqHeaders({ headers: req.headers })
    try {
        const jwtToken = req.query.jwtToken;
        if (!!jwtToken) {
            const { id: userId, platform } = jwt.decodeJwt(jwtToken);
            platformName = platform;
            const { successful, returnMessage, contact } = await contactCore.findContact({ platform, userId, phoneNumber: req.query.phoneNumber, overridingFormat: req.query.overridingFormat, isExtension: req.query?.isExtension ?? false });
            res.status(200).send({ successful, returnMessage, contact });
            if (successful) {
                const nonNewContact = contact.filter(c => !c.isNewContact);
                resultCount = nonNewContact.length;
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
            resultCount
        }
    });
});
app.post('/contact', async function (req, res) {
    const requestStartTime = new Date().getTime();
    let platformName = null;
    let success = false;
    const { hashedExtensionId, hashedAccountId, userAgent, ip, author } = getAnalyticsVariablesInReqHeaders({ headers: req.headers })
    try {
        const jwtToken = req.query.jwtToken;
        if (!!jwtToken) {
            const { id: userId, platform } = jwt.decodeJwt(jwtToken);
            platformName = platform;
            const { successful, returnMessage, contact } = await contactCore.createContact({ platform, userId, phoneNumber: req.body.phoneNumber, newContactName: req.body.newContactName, newContactType: req.body.newContactType });
            res.status(200).send({ successful, returnMessage, contact });
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
        eventName: 'Create contact',
        interfaceName: 'createContact',
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
app.get('/callLog', async function (req, res) {
    const requestStartTime = new Date().getTime();
    let platformName = null;
    let success = false;
    const { hashedExtensionId, hashedAccountId, userAgent, ip, author } = getAnalyticsVariablesInReqHeaders({ headers: req.headers })
    try {
        const jwtToken = req.query.jwtToken;
        if (!!jwtToken) {
            const { id: userId, platform } = jwt.decodeJwt(jwtToken);
            platformName = platform;
            const { successful, logs, returnMessage } = await logCore.getCallLog({ userId, sessionIds: req.query.sessionIds, platform, requireDetails: req.query.requireDetails === 'true' });
            res.status(200).send({ successful, logs, returnMessage });
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
        eventName: 'Get call log',
        interfaceName: 'getCallLog',
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
app.post('/callLog', async function (req, res) {
    const requestStartTime = new Date().getTime();
    let platformName = null;
    let success = false;
    const { hashedExtensionId, hashedAccountId, userAgent, ip, author } = getAnalyticsVariablesInReqHeaders({ headers: req.headers })
    try {
        const jwtToken = req.query.jwtToken;
        if (!!jwtToken) {
            const { id: userId, platform } = jwt.decodeJwt(jwtToken);
            const { successful, logId, returnMessage } = await logCore.createCallLog({ platform, userId, incomingData: req.body });
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
        author
    });
});
app.patch('/callLog', async function (req, res) {
    const requestStartTime = new Date().getTime();
    let platformName = null;
    let success = false;
    const { hashedExtensionId, hashedAccountId, userAgent, ip, author } = getAnalyticsVariablesInReqHeaders({ headers: req.headers })
    try {
        const jwtToken = req.query.jwtToken;
        if (!!jwtToken) {
            const { id: userId, platform } = jwt.decodeJwt(jwtToken);
            platformName = platform;
            const { successful, logId, updatedNote, returnMessage } = await logCore.updateCallLog({ platform, userId, incomingData: req.body });
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
        author
    });
});
app.post('/messageLog', async function (req, res) {
    const requestStartTime = new Date().getTime();
    let platformName = null;
    let success = false;
    const { hashedExtensionId, hashedAccountId, userAgent, ip, author } = getAnalyticsVariablesInReqHeaders({ headers: req.headers })
    try {
        const jwtToken = req.query.jwtToken;
        if (!!jwtToken) {
            const { id: userId, platform } = jwt.decodeJwt(jwtToken);
            platformName = platform;
            const { successful, returnMessage, logIds } = await logCore.createMessageLog({ platform, userId, incomingData: req.body });
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
        author
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