const express = require('express');
const { UserModel } = require('./models/userModel');
const cors = require('cors')
const axios = require('axios');
const oauth = require('./lib/oauth');

const app = express();

app.use(cors())
app.get('/oauth-callback', async function (req, res) {
    const oauthClient = oauth.getOAuthApp();
    try {
        const { accessToken, refreshToken, expires } = await oauthClient.code.getToken(req.query.callbackUri);
        const userInfoResponse = await axios.get('https://api.pipedrive.com/v1/users/me',{
            headers: {
                'Authorization': `Bearer ${accessToken}` 
              }
        });
        const userInfo = userInfoResponse.data.data;
        await UserModel.create({
            id: userInfo.id,
            name: userInfo.name,
            companyId:userInfo.company_id,
            companyName:userInfo.company_name,
            companyDomain:userInfo.company_domain,
            platform: 'pipedrive',
            accessToken,
            refreshToken,
            tokenExpiry: expires,
            rcUserId: req.query.rcUserNumber
        });
    }
    catch (e) {
        console.log(e)
    }
})

exports.server = app;