// CHOOSE: If using OAuth
function getOauthInfo() {
    return {
        clientId: process.env.TEST_CRM_CLIENT_ID,
        clientSecret: process.env.TEST_CRM_CLIENT_SECRET,
        accessTokenUri: process.env.TEST_CRM_TOKEN_URI,
        redirectUri: process.env.TEST_CRM_REDIRECT_URI
    }
}

module.exports = getOauthInfo;