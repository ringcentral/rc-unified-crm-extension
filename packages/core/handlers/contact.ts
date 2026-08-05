// @ts-check

/** @typedef {import('../types').AccountContactDataRecord} AccountContactDataRecord */
/** @typedef {import('../types').ContactConnectorImplementation} ContactConnectorImplementation */
/** @typedef {import('../types').ContactHandlerResult} ContactHandlerResult */
/** @typedef {import('../types').ContactHandlerUser} ContactHandlerUser */
/** @typedef {import('../types').CreateContactParams} CreateContactParams */
/** @typedef {import('../types').FindContactParams} FindContactParams */
/** @typedef {import('../types').FindContactWithNameParams} FindContactWithNameParams */
/** @typedef {import('../types').OAuthInfo} OAuthInfo */
/** @typedef {import('../types').ProviderError} ProviderError */
/** @typedef {import('../types').ProxyConfig} ProxyConfig */

const oauth = /** @type {{ getOAuthApp(info: OAuthInfo): any, checkAndRefreshAccessToken(oauthApp: any, user: ContactHandlerUser): Promise<ContactHandlerUser | null> }} */ (require('../lib/oauth'));
const { UserModel: RawUserModel } = require('../models/userModel');
const UserModel = /** @type {{ findOne(options: Record<string, unknown>): Promise<ContactHandlerUser | null> }} */ (RawUserModel);
const connectorRegistry = /** @type {{ getConnector(platform: string): ContactConnectorImplementation }} */ (/** @type {unknown} */ (require('../connector/registry')));
const { Connector: RawConnector } = require('../models/dynamo/connectorSchema');
const Connector = /** @type {{ getProxyConfig(proxyId: string): Promise<ProxyConfig | null> }} */ (/** @type {unknown} */ (RawConnector));
const { handleApiError: rawHandleApiError } = require('../lib/errorHandler');
const handleApiError = /** @type {(error: unknown, platform: string, operation: string, context?: Record<string, unknown>) => ContactHandlerResult} */ (rawHandleApiError);
const { AccountDataModel: RawAccountDataModel } = require('../models/accountDataModel');
const AccountDataModel = /** @type {{ findOne(options: Record<string, unknown>): Promise<AccountContactDataRecord | null>, create(values: Record<string, unknown>): Promise<AccountContactDataRecord> }} */ (RawAccountDataModel);

/**
 * @param {FindContactParams} params
 * @returns {Promise<ContactHandlerResult>}
 */
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
                return { successful: true, returnMessage: null, contact: existingMatchedContactInfo.data, extraDataTracking: { isCached: true } };
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
                if (!user) {
                    return {
                        successful: false,
                        returnMessage: {
                            message: `User session expired. Please connect again.`,
                            messageType: 'warning',
                            ttl: 5000
                        },
                        isRevokeUserSession: true
                    }
                }
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

        const matchedNonNewContacts = matchedContactInfo?.filter(c => !c.isNewContact) ?? [];
        if (matchedContactInfo != null && matchedNonNewContacts.length > 0) {
            tracer?.trace('handler.findContact:contactsFound', { count: matchedContactInfo.length });
            // save in org data
            // Danger: it does NOT support one RC account mapping to multiple CRM platforms, because contacts will be shared
            if (user.rcAccountId) {
                if (existingMatchedContactInfo) {
                    await existingMatchedContactInfo.update({
                        data: matchedContactInfo
                    });
                }
                else {
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
            if (isForceRefreshAccountData && existingMatchedContactInfo) {
                await existingMatchedContactInfo.destroy();
                tracer?.trace('handler.findContact:staleCacheRemoved', { phoneNumber });
            }
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
        const error = /** @type {ProviderError} */ (e);
        tracer?.traceError('handler.findContact:error', error, { platform, statusCode: error.response?.status });
        return handleApiError(error, platform, 'findContact', { userId, overridingFormat, isExtension });

    }
}

/**
 * @param {CreateContactParams} params
 * @returns {Promise<ContactHandlerResult>}
 */
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
                if (!user) {
                    return {
                        successful: false,
                        returnMessage: {
                            message: `User session expired. Please connect again.`,
                            messageType: 'warning',
                            ttl: 5000
                        },
                        isRevokeUserSession: true
                    }
                }
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

/**
 * @param {FindContactWithNameParams} params
 * @returns {Promise<ContactHandlerResult>}
 */
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
                if (!user) {
                    return {
                        successful: false,
                        returnMessage: {
                            message: `User session expired. Please connect again.`,
                            messageType: 'warning',
                            ttl: 5000
                        },
                        isRevokeUserSession: true
                    }
                }
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

export {};
