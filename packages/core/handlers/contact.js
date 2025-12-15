const oauth = require('../lib/oauth');
const { UserModel } = require('../models/userModel');
const connectorRegistry = require('../connector/registry');
const { Connector } = require('../models/dynamo/connectorSchema');
const { handleApiError } = require('../lib/errorHandler');
const { DebugTracer } = require('../lib/debugTracer');

async function findContact({ platform, userId, phoneNumber, overridingFormat, isExtension, tracer }) {
    tracer?.trace('handler.findContact:entered', { platform, userId, phoneNumber });
    
    try {
        let user = await UserModel.findOne({
            where: {
                id: userId,
                platform
            }
        });
        tracer?.trace('handler.findContact:userFound', { user });
        
        if (!user || !user.accessToken) {
            tracer?.trace('handler.findContact:noUser', { userId });
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
            tracer?.trace('handler.findContact:proxyConfig', { proxyConfig });
        }
        const platformModule = connectorRegistry.getConnector(platform);
        const authType = await platformModule.getAuthType({ proxyId, proxyConfig });
        tracer?.trace('handler.findContact:authType', { authType });
        
        let authHeader = '';
        switch (authType) {
            case 'oauth':
                const oauthApp = oauth.getOAuthApp((await platformModule.getOauthInfo({ tokenUrl: user?.platformAdditionalInfo?.tokenUrl, hostname: user?.hostname, proxyId, proxyConfig })));
                user = await oauth.checkAndRefreshAccessToken(oauthApp, user);
                authHeader = `Bearer ${user.accessToken}`;
                tracer?.trace('handler.findContact:oauthAuth', { authHeader });
                break;
            case 'apiKey':
                const basicAuth = platformModule.getBasicAuth({ apiKey: user.accessToken });
                authHeader = `Basic ${basicAuth}`;
                tracer?.trace('handler.findContact:apiKeyAuth', {});
                break;
        }
        
        const { successful, matchedContactInfo, returnMessage, extraDataTracking } = await platformModule.findContact({ user, authHeader, phoneNumber, overridingFormat, isExtension, proxyConfig, tracer });
        tracer?.trace('handler.findContact:platformFindResult', { successful, matchedContactInfo });
        
        if (matchedContactInfo != null && matchedContactInfo?.filter(c => !c.isNewContact)?.length > 0) {
            tracer?.trace('handler.findContact:contactsFound', { count: matchedContactInfo.length });
            return { successful, returnMessage, contact: matchedContactInfo, extraDataTracking };
        }
        else {
            tracer?.trace('handler.findContact:noContactsMatched', { matchedContactInfo });
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
        tracer?.traceError('handler.findContact:error', e, { platform, statusCode: e.response?.status });
        
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