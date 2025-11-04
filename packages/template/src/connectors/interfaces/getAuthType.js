function getAuthType() {
    return 'apiKey'; // Return either 'oauth' OR 'apiKey'
}

module.exports = getAuthType;