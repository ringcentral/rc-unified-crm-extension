const { CallLogModel } = require('../models/callLogModel');
const { UserModel } = require('../models/userModel');
const oauth = require('../lib/oauth');
const connectorRegistry = require('../connector/registry');
const { Connector } = require('../models/dynamo/connectorSchema');
const { handleApiError } = require('../lib/errorHandler');

async function upsertCallDisposition({ platform, userId, sessionId, dispositions }) {
    try {
        const existingCallLog = await CallLogModel.findOne({
            where: {
                sessionId
            }
        });
        if (!existingCallLog) {
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
            existingCallLog,
            authHeader,
            dispositions,
            proxyConfig
        });
        return { successful: !!logId, logId, returnMessage, extraDataTracking };
    }
    catch (e) {
        return handleApiError(e, platform, 'upsertCallDisposition', { userId, sessionId, dispositions });
    }
}

exports.upsertCallDisposition = upsertCallDisposition;