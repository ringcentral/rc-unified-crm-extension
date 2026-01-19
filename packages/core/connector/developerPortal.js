const axios = require('axios');
const { logger } = require('../lib/logger');


async function getPublicConnectorList() {
    try {
        const response = await axios.get('https://appconnect.labs.ringcentral.com/public-api/connectors');
        return response.data;
    } catch (error) {
        logger.error('Error getting public connector list:', error);
        return null;
    }
}

async function getPrivateConnectorList() {
    try {
        const response = await axios.get(`https://appconnect.labs.ringcentral.com/public-api/connectors/internal?accountId=${process.env.RC_ACCOUNT_ID}`);
        return response.data;
    } catch (error) {
        logger.error('Error getting private connector list:', error);
        return null;
    }
}

async function getConnectorManifest({connectorId, isPrivate = false}) {
    try {
        let response = null;
        if(isPrivate) {
            response = await axios.get(`https://appconnect.labs.ringcentral.com/public-api/connectors/${connectorId}/manifest?type=internal&accountId=${process.env.RC_ACCOUNT_ID}`);
        }
        else {
            response = await axios.get(`https://appconnect.labs.ringcentral.com/public-api/connectors/${connectorId}/manifest`);
        }
        return response.data;
    } catch (error) {
        logger.error('Error getting connector manifest:', error);
        return null;
    }
}   

exports.getPublicConnectorList = getPublicConnectorList;
exports.getPrivateConnectorList = getPrivateConnectorList;
exports.getConnectorManifest = getConnectorManifest;