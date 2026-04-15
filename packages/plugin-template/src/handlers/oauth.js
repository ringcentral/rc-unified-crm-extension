async function getOAuthUrl() {
    return 'https://sample.com/oauth/authorize'
}

async function checkAuth() {
    return { successful: true }
}

async function logout() {
    return { successful: true }
}

exports.getOAuthUrl = getOAuthUrl;
exports.checkAuth = checkAuth;
exports.logout = logout;