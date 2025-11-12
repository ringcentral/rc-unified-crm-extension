const oauth = require('../lib/oauth');
const { UserModel } = require('../models/userModel');
const connectorRegistry = require('../connector/registry');
const { Connector } = require('../models/dynamo/connectorSchema');
const { handleApiError } = require('../lib/errorHandler');

async function findContact({ platform, userId, phoneNumber, overridingFormat, isExtension }) {
    try {
        let user = await UserModel.findOne({
            where: {
                id: userId,
                platform
            }
        });
        if (!user || !user.accessToken) {
            return {
                successful: false,
                returnMessage: {
                    message: `Contact not found`,
                    messageType: 'warning',
                    ttl: 5000
                }
            };
        }
        const proxyId = user.platformAdditionalInfo?.proxyId;
        let proxyConfig = null;
        if (proxyId) {
            proxyConfig = await Connector.getProxyConfig(proxyId);
        }
        const platformModule = connectorRegistry.getConnector(platform);
        const authType = await platformModule.getAuthType({ proxyId, proxyConfig });
        let authHeader = '';
        switch (authType) {
            case 'oauth':
                const oauthApp = oauth.getOAuthApp((await platformModule.getOauthInfo({ tokenUrl: user?.platformAdditionalInfo?.tokenUrl, hostname: user?.hostname, proxyId, proxyConfig })));
                user = await oauth.checkAndRefreshAccessToken(oauthApp, user);
                authHeader = `Bearer ${user.accessToken}`;
                break;
            case 'apiKey':
                const basicAuth = platformModule.getBasicAuth({ apiKey: user.accessToken });
                authHeader = `Basic ${basicAuth}`;
                break;
        }
        const { successful, matchedContactInfo, returnMessage, extraDataTracking } = await platformModule.findContact({ user, authHeader, phoneNumber, overridingFormat, isExtension, proxyConfig });
        if (matchedContactInfo != null && matchedContactInfo?.filter(c => !c.isNewContact)?.length > 0) {
            return { successful, returnMessage, contact: matchedContactInfo, extraDataTracking };
        }
        else {
            if (returnMessage) {
                return {
                    successful,
                    returnMessage,
                    extraDataTracking,
                    contact: matchedContactInfo,
                }
            }
            return {
                successful,
                returnMessage:
                {
                    message: `Contact not found`,
                    messageType: 'warning',
                    details: [{
                        title: 'Details',
                        items: [
                            {
                                id: '1',
                                type: 'text',
                                text: `A contact with the phone number ${phoneNumber} could not be found in your ${platform} account.`
                            }
                        ]
                    }],
                    ttl: 5000
                },
                contact: matchedContactInfo,
                extraDataTracking
            };
        }
    } catch (e) {
        return handleApiError(e, platform, 'findContact', { userId, overridingFormat, isExtension });
    }
}

async function createContact({ platform, userId, phoneNumber, newContactName, newContactType, additionalSubmission }) {
    try {
        let user = await UserModel.findOne({
            where: {
                id: userId,
                platform
            }
        });
        if (!user || !user.accessToken) {
            return { successful: false, message: `Contact not found` };
        }
        const proxyId = user.platformAdditionalInfo?.proxyId;
        let proxyConfig = null;
        if (proxyId) {
            proxyConfig = await Connector.getProxyConfig(proxyId);
        }
        const platformModule = connectorRegistry.getConnector(platform);
        const authType = await platformModule.getAuthType({ proxyId, proxyConfig });
        let authHeader = '';
        switch (authType) {
            case 'oauth':
                const oauthApp = oauth.getOAuthApp((await platformModule.getOauthInfo({ tokenUrl: user?.platformAdditionalInfo?.tokenUrl, hostname: user?.hostname, proxyId, proxyConfig })));
                user = await oauth.checkAndRefreshAccessToken(oauthApp, user);
                authHeader = `Bearer ${user.accessToken}`;
                break;
            case 'apiKey':
                const basicAuth = platformModule.getBasicAuth({ apiKey: user.accessToken });
                authHeader = `Basic ${basicAuth}`;
                break;
        }
        const { contactInfo, returnMessage, extraDataTracking } = await platformModule.createContact({ user, authHeader, phoneNumber, newContactName, newContactType, additionalSubmission, proxyConfig });
        if (contactInfo != null) {
            return { successful: true, returnMessage, contact: contactInfo, extraDataTracking };
        }
        else {
            return { successful: false, returnMessage };
        }
    } catch (e) {
        return handleApiError(e, platform, 'createContact', { userId, phoneNumber, newContactName, newContactType, additionalSubmission });
    }
}

async function findContactWithName({ platform, userId, name }) {
    try {
        let user = await UserModel.findOne({
            where: {
                id: userId,
                platform
            }
        });
        if (!user || !user.accessToken) {
            return {
                successful: false,
                returnMessage: {
                    message: `No contact found with name ${name}`,
                    messageType: 'warning',
                    ttl: 5000
                }
            };
        }
        const proxyId = user.platformAdditionalInfo?.proxyId;
        let proxyConfig = null;
        if (proxyId) {
            proxyConfig = await Connector.getProxyConfig(proxyId);
        }
        const platformModule = connectorRegistry.getConnector(platform);
        const authType = await platformModule.getAuthType({ proxyId, proxyConfig });
        let authHeader = '';
        switch (authType) {
            case 'oauth':
                const oauthApp = oauth.getOAuthApp((await platformModule.getOauthInfo({ tokenUrl: user?.platformAdditionalInfo?.tokenUrl, hostname: user?.hostname, proxyId, proxyConfig })));
                user = await oauth.checkAndRefreshAccessToken(oauthApp, user);
                authHeader = `Bearer ${user.accessToken}`;
                break;
            case 'apiKey':
                const basicAuth = platformModule.getBasicAuth({ apiKey: user.accessToken });
                authHeader = `Basic ${basicAuth}`;
                break;
        }
        const { successful, matchedContactInfo, returnMessage } = await platformModule.findContactWithName({ user, authHeader, name, proxyConfig });
        if (matchedContactInfo != null && matchedContactInfo?.filter(c => !c.isNewContact)?.length > 0) {
            return { successful, returnMessage, contact: matchedContactInfo };
        }
        else {
            if (returnMessage) {
                return {
                    successful,
                    returnMessage,
                    contact: matchedContactInfo,
                }
            }
            return {
                successful,
                returnMessage:
                {
                    message: `No contact found with name ${name} `,
                    messageType: 'warning',
                    ttl: 5000
                },
                contact: matchedContactInfo
            };
        }
    } catch (e) {
        return handleApiError(e, platform, 'findContactWithName', { userId, name });
    }
}

exports.findContact = findContact;
exports.createContact = createContact;
exports.findContactWithName = findContactWithName;