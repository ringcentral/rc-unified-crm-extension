const axios = require('axios');

async function unAuthorize({ user }) {
    //--------------------------------------
    //--- TODO: Add CRM API call here ------
    //--------------------------------------
    // const revokeUrl = 'https://api.crm.com/oauth/unauthorize';
    // const revokeBody = {
    //     token: user.accessToken
    // }
    // const accessTokenRevokeRes = await axios.post(
    //     revokeUrl,
    //     revokeBody,
    //     {
    //         headers: { 'Authorization': `Basic ${getBasicAuth({ apiKey: user.accessToken })}` }
    //     });
    await user.destroy();
    return {
        returnMessage: {
            messageType: 'success',
            message: 'Logged out of TestCRM',
            ttl: 1000
        }
    }

    //--------------------------------------------------------------
    //--- CHECK: Open db.sqlite to check if user info is removed ---
    //--------------------------------------------------------------
}

module.exports = unAuthorize;