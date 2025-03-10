const oauth = require('../lib/oauth');
const { UserModel } = require('../models/userModel');

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
        const platformModule = require(`../adapters/${platform}`);
        const authType = platformModule.getAuthType();
        let authHeader = '';
        switch (authType) {
            case 'oauth':
                const oauthApp = oauth.getOAuthApp((await platformModule.getOauthInfo({ tokenUrl: user?.platformAdditionalInfo?.tokenUrl, hostname: user?.hostname })));
                user = await oauth.checkAndRefreshAccessToken(oauthApp, user);
                authHeader = `Bearer ${user.accessToken}`;
                break;
            case 'apiKey':
                const basicAuth = platformModule.getBasicAuth({ apiKey: user.accessToken });
                authHeader = `Basic ${basicAuth}`;
                break;
        }
        const { matchedContactInfo, returnMessage, extraDataTracking } = await platformModule.findContact({ user, authHeader, phoneNumber, overridingFormat, isExtension });
        if (matchedContactInfo != null && matchedContactInfo?.filter(c => !c.isNewContact)?.length > 0) {
            return { successful: true, returnMessage, contact: matchedContactInfo, extraDataTracking };
        }
        else {
            if (!!returnMessage) {
                return {
                    successful: true,
                    returnMessage,
                    extraDataTracking,
                    contact: matchedContactInfo,
                }
            }
            return {
                successful: true,
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
        console.error(`platform: ${platform} \n${e.stack} \n${JSON.stringify(e.response?.data)}`);
        if (e.response?.status === 429) {
            return {
                successful: false,
                returnMessage: {
                    message: `Rate limit exceeded`,
                    messageType: 'warning',
                    details: [
                        {
                            title: 'Details',
                            items: [
                                {
                                    id: '1',
                                    type: 'text',
                                    text: `You have exceeded the maximum number of requests allowed by ${platform}. Please try again in the next minute. If the problem persists please contact support.`
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
        else if (e.response?.status >= 400 && e.response?.status < 410) {
            return {
                successful: false,
                returnMessage: {
                    message: `Authorization error`,
                    messageType: 'warning',
                    details: [
                        {
                            title: 'Details',
                            items: [
                                {
                                    id: '1',
                                    type: 'text',
                                    text: `It seems like there's something wrong with your authorization of ${platform}. Please Logout and then Connect your ${platform} account within this extension.`
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

async function createContact({ platform, userId, phoneNumber, newContactName, newContactType }) {
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
        const platformModule = require(`../adapters/${platform}`);
        const authType = platformModule.getAuthType();
        let authHeader = '';
        switch (authType) {
            case 'oauth':
                const oauthApp = oauth.getOAuthApp((await platformModule.getOauthInfo({ tokenUrl: user?.platformAdditionalInfo?.tokenUrl, hostname: user?.hostname })));
                user = await oauth.checkAndRefreshAccessToken(oauthApp, user);
                authHeader = `Bearer ${user.accessToken}`;
                break;
            case 'apiKey':
                const basicAuth = platformModule.getBasicAuth({ apiKey: user.accessToken });
                authHeader = `Basic ${basicAuth}`;
                break;
        }
        const { contactInfo, returnMessage, extraDataTracking } = await platformModule.createContact({ user, authHeader, phoneNumber, newContactName, newContactType });
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
                returnMessage:
                {
                    message: `Rate limit exceeded`,
                    messageType: 'warning',
                    details: [
                        {
                            title: 'Details',
                            items: [
                                {
                                    id: '1',
                                    type: 'text',
                                    text: `You have exceeded the maximum number of requests allowed by ${platform}. Please try again in the next minute. If the problem persists please contact support.`
                                }
                            ]
                        }
                    ],
                    ttl: 5000
                }
            };
        }
        else if (e.response?.status >= 400 && e.response?.status < 410) {
            return {
                successful: false,
                returnMessage: {
                    message: `Authorization error`,
                    messageType: 'warning',
                    details: [
                        {
                            title: 'Details',
                            items: [
                                {
                                    id: '1',
                                    type: 'text',
                                    text: `It seems like there's something wrong with your authorization of ${platform}. Please Logout and then Connect your ${platform} account within this extension.`
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

exports.findContact = findContact;
exports.createContact = createContact;