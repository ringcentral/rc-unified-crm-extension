// @ts-check
/** @typedef {import('../types').ConnectorManifest} ConnectorManifest */
/** @typedef {import('../types').DeveloperPortalConnectorList} DeveloperPortalConnectorList */
/** @typedef {import('../types').DeveloperPortalPrivateConnectorList} DeveloperPortalPrivateConnectorList */
/** @typedef {import('../types').GetConnectorManifestParams} GetConnectorManifestParams */
/** @typedef {import('../types').GetPrivateConnectorListParams} GetPrivateConnectorListParams */

const axios = /** @type {any} */ (require('axios'));
const logger = require('../lib/logger');
const DEV_PORTAL_DOMAIN_URL = 'https://appconnect.labs.ringcentral.com';
// const DEV_PORTAL_DOMAIN_URL = 'http://localhost:6100';

/**
 * @returns {Promise<DeveloperPortalConnectorList | null>}
 */
async function getPublicConnectorList() {
    try {
        const response = await axios.get(`${DEV_PORTAL_DOMAIN_URL}/public-api/connectors`);
        return response.data;
    } catch (error) {
        logger.error('Error getting public connector list:', error);
        return null;
    }
}

/**
 * @param {GetPrivateConnectorListParams} params
 * @returns {Promise<DeveloperPortalPrivateConnectorList | null>}
 */
async function getPrivateConnectorList({ rcAccountId }) {
    try {
        const response = await axios.get(`${DEV_PORTAL_DOMAIN_URL}/public-api/connectors/internal`, {
            params: { accountId: String(rcAccountId) },
            maxRedirects: 0,
        });
        return response.data;
    } catch (error) {
        logger.error('Error getting private connector list:', error);
        return null;
    }
}

/**
 * @param {GetConnectorManifestParams} params
 * @returns {Promise<ConnectorManifest | null>}
 */
async function getConnectorManifest({ rcAccountId, devRcAccountId, connectorId, isPrivate = false }) {
    try {
        if (typeof connectorId !== 'string' || !connectorId || /[^a-zA-Z0-9_.-]/.test(connectorId)
            || connectorId === '.' || connectorId === '..') {
            throw new Error('Invalid connector ID');
        }

        let accountId = devRcAccountId;
        if (!devRcAccountId && isPrivate) {
            const privateConnectorList = await getPrivateConnectorList({ rcAccountId });
            if (privateConnectorList?.privateConnectors.some(connector => connector.id === connectorId)) {
                accountId = rcAccountId;
            }
            else {
                const sharedConnector = privateConnectorList?.sharedConnectors.find(connector => connector.id === connectorId);
                if (!sharedConnector) {
                    throw new Error('Connector not found');
                }
                accountId = sharedConnector.accountId;
            }
        }

        const response = await axios.get(`${DEV_PORTAL_DOMAIN_URL}/public-api/connectors/${connectorId}/manifest`, {
            params: devRcAccountId || isPrivate
                ? { access: 'internal', type: 'connector', accountId: String(accountId) }
                : undefined,
            maxRedirects: 0,
        });
        return response.data;
    } catch (error) {
        logger.error('Error getting connector manifest:', error);
        return null;
    }
}

exports.getPublicConnectorList = getPublicConnectorList;
exports.getConnectorManifest = getConnectorManifest;

export { };
