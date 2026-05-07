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

async function getConnectorManifest({ rcAccountId, connectorId, isPrivate = false }) {
    try {
        let response = null;
        if (isPrivate) {
            response = await axios.get(`https://appconnect.labs.ringcentral.com/public-api/connectors/${connectorId}/manifest?access=internal&type=connector&accountId=${rcAccountId}`);
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
exports.getConnectorManifest = getConnectorManifest;