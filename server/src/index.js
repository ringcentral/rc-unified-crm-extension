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
const logCore = require('./core/log');
const contactCore = require('./core/contact');

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
const app = express();
app.use(bodyParser.json())

app.use(cors({
    methods: ['GET', 'POST', 'PATCH']
}));

app.get('/is-alive', (req, res) => { res.send(`OK`); });
// Unique: Pipedrive
app.get('/pipedrive-redirect', function (req, res) {
    try {
        res.sendFile(path.join(__dirname, 'pipedriveRedirect/redirect.html'));
    }
    catch (e) {
        console.log(e);
        res.status(500).send(e);
    }
})
// Unique: Pipedrive
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
app.get('/oauth-callback', async function (req, res) {
    try {
        if (req.query.callbackUri === 'undefined') {
            res.status(400).send('missing callbackUri');
            return;
        }
        const platform = req.query.state ?
            req.query.state.split('platform=')[1] :
            decodeURIComponent(req.originalUrl.split('state=')[1].split('&')[0]).split('platform=')[1];
        const hostname = req.query.hostname;
        const tokenUrl = req.query.tokenUrl;
        if (!platform) {
            throw 'missing platform name';
        }
        const platformModule = require(`./platformModules/${platform}`);
        const oauthInfo = platformModule.getOauthInfo({ tokenUrl });

        // Some platforms require different oauth queries, this won't affect normal OAuth process unless CRM module implements getOverridingOAuthOption() method
        let overridingOAuthOption = null;
        if (platformModule.getOverridingOAuthOption != null) {
            overridingOAuthOption = platformModule.getOverridingOAuthOption({ code: req.query.callbackUri.split('code=')[1] });
        }
        const oauthApp = oauth.getOAuthApp(oauthInfo);
        const { accessToken, refreshToken, expires } = await oauthApp.code.getToken(req.query.callbackUri, overridingOAuthOption);
        const userInfo = await platformModule.saveUserInfo({
            authHeader: `Bearer ${accessToken}`,
            tokenUrl: tokenUrl,
            apiUrl: req.query.apiUrl,
            username: req.query.username,
            hostname,
            accessToken,
            refreshToken,
            tokenExpiry: expires
        });
        const jwtToken = jwt.generateJwt({
            id: userInfo.id.toString(),
            rcUserNumber: req.query.rcUserNumber.toString(),
            platform: platform
        });
        res.status(200).send({ jwtToken, name: userInfo.name });
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
        const userInfo = await platformModule.saveUserInfo({
            authHeader: `Basic ${basicAuth}`,
            hostname,
            apiKey,
            additionalInfo
        });
        const jwtToken = jwt.generateJwt({
            id: userInfo.id.toString(),
            rcUserNumber: req.body.rcUserNumber.toString(),
            platform: platform
        });
        res.status(200).send({ jwtToken, name: userInfo.name });
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
            await platformModule.unAuthorize({ user: userToLogout });
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
            const { successful, message, contact } = await contactCore.getContact({ platform, userId, phoneNumber: req.query.phoneNumber, overridingFormat: req.query.overridingFormat });
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
app.post('/contact', async function (req, res) {
    try {
        const jwtToken = req.query.jwtToken;
        if (!!jwtToken) {
            const { id: userId, platform } = jwt.decodeJwt(jwtToken);
            const { successful, message, contact } = await contactCore.createContact({ platform, userId, phoneNumber: req.body.phoneNumber, newContactName: req.body.newContactName, newContactType: req.body.newContactType });
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
            const { id: userId, platform } = jwt.decodeJwt(jwtToken);
            const { successful, logs } = await logCore.getCallLog({ userId, sessionIds: req.query.sessionIds, platform });
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
            const { successful, message, logId } = await logCore.addCallLog({ platform, userId, incomingData: req.body });
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
app.patch('/callLog', async function (req, res) {
    try {
        const jwtToken = req.query.jwtToken;
        if (!!jwtToken) {
            const { id: userId, platform } = jwt.decodeJwt(jwtToken);
            const { successful, logId } = await logCore.updateCallLog({ platform, userId, incomingData: req.body });
            res.status(200).send({ successful, logId });
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
            const { successful, message, logIds } = await logCore.addMessageLog({ platform, userId, incomingData: req.body });
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