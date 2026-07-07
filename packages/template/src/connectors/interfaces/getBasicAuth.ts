// CHOOSE: If using apiKey auth
function getBasicAuth({ apiKey }) {
    return Buffer.from(`${apiKey}:`).toString('base64');
}

module.exports = getBasicAuth;
