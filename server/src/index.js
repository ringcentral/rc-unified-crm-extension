const path = require('path');
const express = require('express');
const crypto = require('crypto');
const bodyParser = require('body-parser')
const { UserModel } = require('./models/userModel');
const { CallLogModel } = require('./models/callLogModel');
const { MessageLogModel } = require('./models/messageLogModel');
const cors = require('cors')
const oauth = require('./lib/oauth');
const jwt = require('./lib/jwt');
const { addCallLog, addMessageLog, getCallLog } = require('./core/log');
const { getContact } = require('./core/contact');

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

const app = express();
app.use(bodyParser.json())

app.use(cors({
    methods: ['GET', 'POST']
}));

app.get('/is-alive', (req, res) => { res.send(`OK`); });
app.get('/init-db', async (req, res) => {
    await initDB();
    res.send(`OK`);
});
app.get('/pipedrive-redirect', function (req, res) {
    try {
        res.sendFile(path.join(__dirname, 'pipedriveRedirect/redirect.html'));
    }
    catch (e) {
        console.log(e);
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
                res.status(400).send('unknown user');
            }
            res.status(200).send(user.hostname);
        }
        else {
            res.status(400).send('Please go to Settings and authorize CRM platform');
        }
    }
    catch (e) {
        console.log(e);
        res.status(500).send(e);
    }
})
app.delete('/pipedrive-redirect', async function (req, res) {
    try {
        const basicAuthHeader = Buffer.from(`${process.env.PIPEDRIVE_CLIENT_ID}:${process.env.PIPEDRIVE_CLIENT_SECRET}`).toString('base64');
        if (`Basic ${basicAuthHeader}` === req.get('authorization')) {
            const platformModule = require(`./platformModules/pipedrive`);
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
        console.log(e);
        res.status(500).send(e);
    }
})
app.get('/oauth-callback', async function (req, res) {
    try {
        const platform = req.query.state.split('platform=')[1];
        const hostname = req.query.hostname;
        const tokenUrl = req.query.tokenUrl;
        if (!platform) {
            throw 'missing platform name';
        }
        const platformModule = require(`./platformModules/${platform}`);
        const oauthInfo = await platformModule.getOauthInfo({ tokenUrl });
        const oauthApp = oauth.getOAuthApp(oauthInfo);
        let overridingHeader = null;
        let overridingQuery = null;
        if (platform === 'bullhorn') {
            overridingQuery = {
                grant_type: 'authorization_code',
                code: req.query.callbackUri.split('code=')[1],
                client_id: oauthInfo.clientId,
                client_secret: oauthInfo.clientSecret,
                redirect_uri: oauthInfo.redirectUri
            };
            overridingHeader = {
                Authorization: ''
            };
        }
        const { accessToken, refreshToken, expires } = await oauthApp.code.getToken(req.query.callbackUri, { query: overridingQuery, headers: overridingHeader });
        const userInfo = await platformModule.getUserInfo({ authHeader: `Bearer ${accessToken}`, tokenUrl: tokenUrl, apiUrl: req.query.apiUrl, username: req.query.username });
        await platformModule.saveUserOAuthInfo({
            id: userInfo.id,
            name: userInfo.name,
            hostname,
            accessToken,
            refreshToken,
            tokenExpiry: expires,
            rcUserNumber: req.query.rcUserNumber.toString(),
            timezoneName: userInfo.timezoneName,
            timezoneOffset: userInfo.timezoneOffset,
            additionalInfo: userInfo.additionalInfo
        });
        const jwtToken = jwt.generateJwt({
            id: userInfo.id.toString(),
            rcUserNumber: req.query.rcUserNumber.toString(),
            platform: platform
        });
        res.status(200).send(jwtToken);
    }
    catch (e) {
        console.log(e);
        res.status(400).send(e);
    }
})
app.post('/apiKeyLogin', async function (req, res) {
    try {
        const platform = req.body.platform;
        const apiKey = req.body.apiKey;
        const hostname = req.body.hostname;
        const additionalInfo = req.body.additionalInfo;
        if (!platform) {
            throw 'missing platform name';
        }
        if (!apiKey) {
            throw 'missing api key';
        }
        const platformModule = require(`./platformModules/${platform}`);
        const basicAuth = platformModule.getBasicAuth({ apiKey });
        const userInfo = await platformModule.getUserInfo({ authHeader: `Basic ${basicAuth}`, additionalInfo });
        await platformModule.saveApiKeyUserInfo({
            id: userInfo.id,
            name: userInfo.name,
            hostname,
            apiKey,
            additionalInfo,
            rcUserNumber: req.body.rcUserNumber.toString(),
            timezoneName: userInfo.timezoneName,
            timezoneOffset: userInfo.timezoneOffset,
            additionalInfo: userInfo.additionalInfo
        });
        const jwtToken = jwt.generateJwt({
            id: userInfo.id.toString(),
            rcUserNumber: req.body.rcUserNumber.toString(),
            platform: platform
        });
        res.status(200).send(jwtToken);
    }
    catch (e) {
        console.log(e);
        res.status(400).send(e);
    }
})

app.post('/unAuthorize', async function (req, res) {
    try {
        const jwtToken = req.query.jwtToken;
        if (!!jwtToken) {
            const unAuthData = jwt.decodeJwt(jwtToken);
            const userToLogout = await UserModel.findOne({
                where: {
                    id: unAuthData.id,
                    platform: unAuthData.platform
                }
            });
            if (!!!userToLogout) {
                res.status(400).send('unknown user');
                return;
            }
            const platformModule = require(`./platformModules/${unAuthData.platform}`);
            await platformModule.unAuthorize({ id: unAuthData.id });
            res.status(200).send();
        }
        else {
            res.status(400).send('Please go to Settings and authorize CRM platform');
        }
    }
    catch (e) {
        console.log(e);
        res.status(400).send(e);
    }
});
app.get('/userInfoHash', async function (req, res) {
    try {
        const extensionId = getHashValue(req.query.extensionId, process.env.HASH_KEY);
        const accountId = getHashValue(req.query.accountId, process.env.HASH_KEY);
        res.status(200).send({ extensionId, accountId });
    }
    catch (e) {
        console.log(e);
        res.status(400).send(e);
    }
})
app.get('/contact', async function (req, res) {
    try {
        const jwtToken = req.query.jwtToken;
        if (!!jwtToken) {
            const { id: userId, platform } = jwt.decodeJwt(jwtToken);
            const { successful, message, contact } = await getContact({ platform, userId, phoneNumber: req.query.phoneNumber, overridingFormat: req.query.overridingFormat });
            res.status(200).send({ successful, message, contact });
        }
        else {
            res.status(400).send('Please go to Settings and authorize CRM platform');
        }
    }
    catch (e) {
        console.log(e);
        res.status(400).send(e);
    }
});
app.get('/callLog', async function (req, res) {
    try {
        const jwtToken = req.query.jwtToken;
        if (!!jwtToken) {
            const { successful, logs } = await getCallLog({ sessionIds: req.query.sessionIds });
            res.status(200).send({ successful, logs });
        }
        else {
            res.status(400).send('Please go to Settings and authorize CRM platform');
        }
    }
    catch (e) {
        console.log(e);
        res.status(400).send(e);
    }
});
app.post('/callLog', async function (req, res) {
    try {
        const jwtToken = req.query.jwtToken;
        if (!!jwtToken) {
            const { id: userId, platform } = jwt.decodeJwt(jwtToken);
            const { successful, message, logId } = await addCallLog({ platform, userId, incomingData: req.body });
            res.status(200).send({ successful, message, logId });
        }
        else {
            res.status(400).send('Please go to Settings and authorize CRM platform');
        }
    }
    catch (e) {
        console.log(e);
        res.status(400).send(e);
    }
});
app.post('/messageLog', async function (req, res) {
    try {
        const jwtToken = req.query.jwtToken;
        if (!!jwtToken) {
            const { id: userId, platform } = jwt.decodeJwt(jwtToken);
            const { successful, message, logIds } = await addMessageLog({ platform, userId, incomingData: req.body });
            res.status(200).send({ successful, message, logIds });
        }
        else {
            res.status(400).send('Please go to Settings and authorize CRM platform');
        }
    }
    catch (e) {
        console.log(e);
        res.status(400).send(e);
    }
});

exports.server = app;