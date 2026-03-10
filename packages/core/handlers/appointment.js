const { UserModel } = require('../models/userModel');
const oauth = require('../lib/oauth');
const connectorRegistry = require('../connector/registry');
const { Connector } = require('../models/dynamo/connectorSchema');
const { handleApiError, handleDatabaseError } = require('../lib/errorHandler');

async function resolveAuth({ platform, userId }) {
    let user = null;
    try {
        user = await UserModel.findByPk(userId);
    }
    catch (error) {
        return handleDatabaseError(error, 'Error finding user');
    }
    if (!user || !user.accessToken) {
        return {
            successful: false,
            returnMessage: {
                message: 'User not found',
                messageType: 'warning',
                ttl: 5000
            }
        };
    }

    const platformModule = connectorRegistry.getConnector(platform);
    const proxyId = user.platformAdditionalInfo?.proxyId;
    let proxyConfig = null;
    if (proxyId) {
        proxyConfig = await Connector.getProxyConfig(proxyId);
    }

    const authType = await platformModule.getAuthType({ proxyId, proxyConfig });
    let authHeader = '';
    switch (authType) {
        case 'oauth': {
            const oauthApp = oauth.getOAuthApp((await platformModule.getOauthInfo({
                tokenUrl: user?.platformAdditionalInfo?.tokenUrl,
                hostname: user?.hostname,
                proxyId,
                proxyConfig
            })));
            user = await oauth.checkAndRefreshAccessToken(oauthApp, user);
            if (!user) {
                return {
                    successful: false,
                    returnMessage: {
                        message: 'User session expired. Please connect again.',
                        messageType: 'warning',
                        ttl: 5000
                    },
                    isRevokeUserSession: true
                };
            }
            authHeader = `Bearer ${user.accessToken}`;
            break;
        }
        case 'apiKey': {
            const basicAuth = platformModule.getBasicAuth({ apiKey: user.accessToken });
            authHeader = `Basic ${basicAuth}`;
            break;
        }
        default:
            break;
    }

    return {
        successful: true,
        user,
        platformModule,
        authHeader,
        proxyConfig
    };
}

async function listAppointments({ platform, userId, range, mineOnly, forceSync }) {
    try {
        const authResult = await resolveAuth({ platform, userId });
        if (!authResult.successful) return authResult;

        const result = await authResult.platformModule.listAppointments({
            user: authResult.user,
            authHeader: authResult.authHeader,
            range,
            mineOnly,
            forceSync,
            proxyConfig: authResult.proxyConfig
        });
        return { successful: true, ...result };
    }
    catch (e) {
        return handleApiError(e, platform, 'listAppointments', { userId });
    }
}

async function createAppointment({ platform, userId, payload }) {
    try {
        const authResult = await resolveAuth({ platform, userId });
        if (!authResult.successful) return authResult;

        const result = await authResult.platformModule.createAppointment({
            user: authResult.user,
            authHeader: authResult.authHeader,
            payload,
            proxyConfig: authResult.proxyConfig
        });
        return { successful: true, ...result };
    }
    catch (e) {
        return handleApiError(e, platform, 'createAppointment', { userId });
    }
}

async function updateAppointment({ platform, userId, appointmentId, patchBody }) {
    try {
        const authResult = await resolveAuth({ platform, userId });
        if (!authResult.successful) return authResult;

        const result = await authResult.platformModule.updateAppointment({
            user: authResult.user,
            authHeader: authResult.authHeader,
            appointmentId,
            patchBody,
            proxyConfig: authResult.proxyConfig
        });
        return { successful: true, ...result };
    }
    catch (e) {
        return handleApiError(e, platform, 'updateAppointment', { userId, appointmentId });
    }
}

async function refreshAppointment({ platform, userId, appointmentId }) {
    try {
        const authResult = await resolveAuth({ platform, userId });
        if (!authResult.successful) return authResult;

        const result = await authResult.platformModule.refreshAppointment({
            user: authResult.user,
            authHeader: authResult.authHeader,
            appointmentId,
            proxyConfig: authResult.proxyConfig
        });
        return { successful: true, ...result };
    }
    catch (e) {
        return handleApiError(e, platform, 'refreshAppointment', { userId, appointmentId });
    }
}

async function confirmAppointment({ platform, userId, appointmentId }) {
    try {
        const authResult = await resolveAuth({ platform, userId });
        if (!authResult.successful) return authResult;

        const result = await authResult.platformModule.confirmAppointment({
            user: authResult.user,
            authHeader: authResult.authHeader,
            appointmentId,
            proxyConfig: authResult.proxyConfig
        });
        return { successful: true, ...result };
    }
    catch (e) {
        return handleApiError(e, platform, 'confirmAppointment', { userId, appointmentId });
    }
}

async function cancelAppointment({ platform, userId, appointmentId }) {
    try {
        const authResult = await resolveAuth({ platform, userId });
        if (!authResult.successful) return authResult;

        const result = await authResult.platformModule.cancelAppointment({
            user: authResult.user,
            authHeader: authResult.authHeader,
            appointmentId,
            proxyConfig: authResult.proxyConfig
        });
        return { successful: true, ...result };
    }
    catch (e) {
        return handleApiError(e, platform, 'cancelAppointment', { userId, appointmentId });
    }
}

exports.listAppointments = listAppointments;
exports.createAppointment = createAppointment;
exports.updateAppointment = updateAppointment;
exports.refreshAppointment = refreshAppointment;
exports.confirmAppointment = confirmAppointment;
exports.cancelAppointment = cancelAppointment;

