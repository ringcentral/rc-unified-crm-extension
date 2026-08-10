// @ts-check

const oauth = /** @type {any} */ (require('../lib/oauth'));
const { UserModel } = /** @type {any} */ (require('../models/userModel'));
const connectorRegistry = /** @type {any} */ (require('../connector/registry'));
const { Connector } = /** @type {any} */ (require('../models/dynamo/connectorSchema'));
const { getAccountData, getAccountDataKeys } = require('../lib/accountData');

async function getAccountDataByKeys({ platform, userId, keys, forceRefresh = false, tracer }: {
    platform: string;
    userId: string;
    keys: string[];
    forceRefresh?: boolean;
    tracer?: any;
}): Promise<any> {
    tracer?.trace('handler.getAccountDataByKeys:entered', { platform, userId, keys, forceRefresh });
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
                message: `User not found`,
                messageType: 'warning',
                ttl: 5000
            }
        };
    }
    const registeredKeys = getAccountDataKeys(platform);
    const unknownKeys = keys.filter(k => !registeredKeys.includes(k));
    if (unknownKeys.length > 0) {
        return {
            successful: false,
            isBadRequest: true,
            returnMessage: {
                message: `Unknown account data key(s): ${unknownKeys.join(', ')}`,
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
                };
            }
            authHeader = `Bearer ${user.accessToken}`;
            break;
        case 'apiKey':
            const basicAuth = platformModule.getBasicAuth({ apiKey: user.accessToken });
            authHeader = `Basic ${basicAuth}`;
            break;
    }
    const data: Record<string, any> = {};
    for (const key of keys) {
        data[key] = await getAccountData({ platform, user, authHeader, dataKey: key, forceRefresh });
    }
    tracer?.trace('handler.getAccountDataByKeys:done', { keys });
    return {
        successful: true,
        data
    };
}

exports.getAccountDataByKeys = getAccountDataByKeys;

export {};
