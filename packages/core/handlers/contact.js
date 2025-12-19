const oauth = require('../lib/oauth');
const { UserModel } = require('../models/userModel');
const errorMessage = require('../lib/generalErrorMessage');
const connectorRegistry = require('../connector/registry');
const { Connector } = require('../models/dynamo/connectorSchema');
const { DebugTracer } = require('../lib/debugTracer');
const { AccountDataModel } = require('../models/accountDataModel');

async function findContact({ platform, userId, phoneNumber, overridingFormat, isExtension, tracer, isForceRefreshAccountData = false }) {
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
        // find cached contact by composite key; findByPk expects raw PK values, so use where clause
        const existingMatchedContactInfo = await AccountDataModel.findOne({
            where: {
                rcAccountId: user.rcAccountId,
                platformName: platform,
                dataKey: `contact-${phoneNumber}`
            }
        })
        if (!isForceRefreshAccountData) {
            if (existingMatchedContactInfo) {
                console.log('found existing matched contact info in account data');
                return { successful: true, returnMessage: null, contact: existingMatchedContactInfo.data, extraDataTracking: null };
            }
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

        const { successful, matchedContactInfo, returnMessage, extraDataTracking } = await platformModule.findContact({ user, authHeader, phoneNumber, overridingFormat, isExtension, proxyConfig, tracer, isForceRefreshAccountData });
        tracer?.trace('handler.findContact:platformFindResult', { successful, matchedContactInfo });

        if (matchedContactInfo != null && matchedContactInfo?.filter(c => !c.isNewContact)?.length > 0) {
            tracer?.trace('handler.findContact:contactsFound', { count: matchedContactInfo.length });
            // save in org data
            // Danger: it does NOT support one RC account mapping to multiple CRM platforms, because contacts will be shared
            if (user.rcAccountId) {
                if(existingMatchedContactInfo)
                {
                    await existingMatchedContactInfo.update({
                        data: matchedContactInfo
                    });
                }
                else{
                    await AccountDataModel.create({
                        rcAccountId: user.rcAccountId,
                        platformName: platform,
                        dataKey: `contact-${phoneNumber}`,
                        data: matchedContactInfo
                    });
                }
                console.log('store new matched contact info in account data');
            }
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
        console.error(`platform: ${platform} \n${e.stack} \n${JSON.stringify(e.responxse?.data)}`);
        tracer?.traceError('handler.findContact:error', e, { platform, statusCode: e.response?.status });

        if (e.response?.status === 429) {
            return {
                successful: false,
                returnMessage: errorMessage.rateLimitErrorMessage({ platform }),
                extraDataTracking: {
                    statusCode: e.response?.status,
                }
            };
        }
        else if (e.response?.status >= 400 && e.response?.status < 410) {
            return {
                successful: false,
                returnMessage: errorMessage.authorizationErrorMessage({ platform }),
                extraDataTracking: {
                    statusCode: e.response?.status,
                }
            };
        }
        return {
            successful: false,
            returnMessage:
            {
                message: `Error finding contacts`,
                messageType: 'warning',
                details: [
                    {
                        title: 'Details',
                        items: [
                            {
                                id: '1',
                                type: 'text',
                                text: `Please check if your account has permission to VIEW and LIST contacts`
                            }
                        ]
                    }
                ],
                ttl: 5000
            },
            extraDataTracking: {
                statusCode: e.response?.status,
            }
        };
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
        console.log(`platform: ${platform} \n${e.stack}`);
        if (e.response?.status === 429) {
            return {
                successful: false,
                returnMessage: errorMessage.rateLimitErrorMessage({ platform }),
            };
        }
        else if (e.response?.status >= 400 && e.response?.status < 410) {
            return {
                successful: false,
                returnMessage: errorMessage.authorizationErrorMessage({ platform }),
                extraDataTracking: {
                    statusCode: e.response?.status,
                }
            };
        }
        return {
            successful: false,
            returnMessage:
            {
                message: `Error creating contact`,
                messageType: 'warning',
                details: [
                    {
                        title: 'Details',
                        items: [
                            {
                                id: '1',
                                type: 'text',
                                text: `A contact with the phone number ${phoneNumber} could not be created. Make sure you have permission to create contacts in ${platform}.`
                            }
                        ]
                    }
                ],
                ttl: 5000
            }
        };
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
        console.error(`platform: ${platform} \n${e.stack} \n${JSON.stringify(e.response?.data)}`);
        if (e.response?.status === 429) {
            return {
                successful: false,
                returnMessage: errorMessage.rateLimitErrorMessage({ platform })
            };
        }
        else if (e.response?.status >= 400 && e.response?.status < 410) {
            return {
                successful: false,
                returnMessage: errorMessage.authorizationErrorMessage({ platform }),
            };
        }
        return {
            successful: false,
            returnMessage:
            {
                message: `Error finding contacts`,
                messageType: 'warning',
                ttl: 5000
            }
        };
    }
}

exports.findContact = findContact;
exports.createContact = createContact;
exports.findContactWithName = findContactWithName;