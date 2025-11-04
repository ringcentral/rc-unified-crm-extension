// const Op = require('sequelize').Op;
const { CallLogModel } = require('../models/callLogModel');
// const { MessageLogModel } = require('../models/messageLogModel');
const { UserModel } = require('../models/userModel');
const oauth = require('../lib/oauth');
// const userCore = require('../handlers/user');
const errorMessage = require('../lib/generalErrorMessage');
const connectorRegistry = require('../connector/registry');
const { Connector } = require('../models/dynamo/connectorSchema');

async function upsertCallDisposition({ platform, userId, sessionId, dispositions, additionalSubmission, userSettings }) {
    try {
        const log = await CallLogModel.findOne({
            where: {
                sessionId
            }
        });
        if (!log) {
            return {
                successful: false,
                returnMessage: {
                    message: `Cannot find log`,
                    messageType: 'warning',
                    ttl: 3000
                }
            }
        }
        let user = await UserModel.findByPk(userId);
        if (!user) {
            return {
                successful: false,
                returnMessage: {
                    message: `Cannot find user`,
                    messageType: 'warning',
                    ttl: 3000
                }
            }
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
        const { logId, returnMessage, extraDataTracking } = await platformModule.upsertCallDisposition({
            user,
            existingCallLog: log,
            authHeader,
            dispositions,
            proxyConfig
        });
        return { successful: !!logId, logId, returnMessage, extraDataTracking };
    }
    catch (e) {
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
                extraDataTracking: {
                    statusCode: e.response?.status,
                }
            };
        }
        return {
            successful: false,
            returnMessage:
            {
                message: `Error dispositioning call log`,
                messageType: 'warning',
                details: [
                    {
                        title: 'Details',
                        items: [
                            {
                                id: '1',
                                type: 'text',
                                text: `Please check if your account has permission to UPDATE logs.`
                            }
                        ]
                    }
                ],
                ttl: 5000
            }
        };
    }
}

// async function upsertMessageDisposition({ platform, userId, conversationLogId, dispositions, additionalSubmission, userSettings }) {
//     try {
//         const existingSameDateMessageLog = await MessageLogModel.findOne({
//             where: {
//                 conversationLogId
//             }
//         });
//         if (!existingSameDateMessageLog) {
//             return {
//                 successful: false,
//                 returnMessage: {
//                     message: `Cannot find log`,
//                     messageType: 'warning',
//                     ttl: 3000
//                 }
//             }
//         }
//         let user = await UserModel.findByPk(userId);
//         if (!user) {
//             return {
//                 successful: false,
//                 returnMessage: {
//                     message: `Cannot find user`,
//                     messageType: 'warning',
//                     ttl: 3000
//                 }
//             }
//         }
//         const proxyId = user.platformAdditionalInfo?.proxyId;
//         let proxyConfig = null;
//         if (proxyId) {
//             proxyConfig = await Connector.getProxyConfig(proxyId);
//         }
//         const platformModule = connectorRegistry.getConnector(platform);
//         const authType = await platformModule.getAuthType({ proxyId, proxyConfig });
//         let authHeader = '';
//         switch (authType) {
//             case 'oauth':
//                 const oauthApp = oauth.getOAuthApp((await platformModule.getOauthInfo({ tokenUrl: user?.platformAdditionalInfo?.tokenUrl, hostname: user?.hostname, proxyId, proxyConfig })));
//                 user = await oauth.checkAndRefreshAccessToken(oauthApp, user);
//                 authHeader = `Bearer ${user.accessToken}`;
//                 break;
//             case 'apiKey':
//                 const basicAuth = platformModule.getBasicAuth({ apiKey: user.accessToken });
//                 authHeader = `Basic ${basicAuth}`;
//                 break;
//         }
//         const { logId, returnMessage, extraDataTracking } = await platformModule.upsertMessageDisposition({
//             user,
//             existingMessageLog: existingSameDateMessageLog,
//             authHeader,
//             dispositions,
//             proxyConfig
//         });
//         return { successful: !!logId, logId, returnMessage, extraDataTracking };
//     }
//     catch (e) {
//         console.error(`platform: ${platform} \n${e.stack} \n${JSON.stringify(e.response?.data)}`);
//         if (e.response?.status === 429) {
//             return {
//                 successful: false,
//                 returnMessage: errorMessage.rateLimitErrorMessage({ platform })
//             };
//         }
//         else if (e.response?.status >= 400 && e.response?.status < 410) {
//             return {
//                 successful: false,
//                 returnMessage: errorMessage.authorizationErrorMessage({ platform }),
//                 extraDataTracking: {
//                     statusCode: e.response?.status,
//                 }
//             };
//         }
//         return {
//             successful: false,
//             returnMessage:
//             {
//                 message: `Error dispositioning message log`,
//                 messageType: 'warning',
//                 details: [
//                     {
//                         title: 'Details',
//                         items: [
//                             {
//                                 id: '1',
//                                 type: 'text',
//                                 text: `Please check if your account has correct permissions.`
//                             }
//                         ]
//                     }
//                 ],
//                 ttl: 5000
//             }
//         };
//     }
// }


exports.upsertCallDisposition = upsertCallDisposition;
// exports.upsertMessageDisposition = upsertMessageDisposition;