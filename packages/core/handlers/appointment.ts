// @ts-check
/** @typedef {import('../types').AppointmentAuthParams} AppointmentAuthParams */
/** @typedef {import('../types').AppointmentAuthFailure} AppointmentAuthFailure */
/** @typedef {import('../types').AppointmentAuthResult} AppointmentAuthResult */
/** @typedef {import('../types').AppointmentHandlerResult} AppointmentHandlerResult */
/** @typedef {import('../types').AppointmentPayloadParams} AppointmentPayloadParams */
/** @typedef {import('../types').AppointmentPatchParams} AppointmentPatchParams */
/** @typedef {import('../types').AppointmentRecordParams} AppointmentRecordParams */
/** @typedef {import('../types').ListAppointmentsParams} ListAppointmentsParams */

const { UserModel: UserModelImport } = require('../models/userModel');
const UserModel = /** @type {any} */ (UserModelImport);
const oauth = /** @type {any} */ (require('../lib/oauth'));
const connectorRegistry = /** @type {any} */ (require('../connector/registry'));
const { Connector: ConnectorImport } = require('../models/dynamo/connectorSchema');
const Connector = /** @type {any} */ (ConnectorImport);
const { handleApiError, handleDatabaseError } = require('../lib/errorHandler');

/**
 * @param {AppointmentAuthParams} params
 * @returns {Promise<AppointmentAuthResult>}
 */
async function resolveAuth({ platform, userId }) {
    let user = null;
    try {
        user = await UserModel.findByPk(userId);
    }
    catch (error) {
        return /** @type {AppointmentAuthFailure} */ (handleDatabaseError(error, 'Error finding user'));
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

/**
 * @param {ListAppointmentsParams} params
 * @returns {Promise<AppointmentHandlerResult>}
 */
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

/**
 * @param {AppointmentPayloadParams} params
 * @returns {Promise<AppointmentHandlerResult>}
 */
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

/**
 * @param {AppointmentPatchParams} params
 * @returns {Promise<AppointmentHandlerResult>}
 */
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

/**
 * @param {AppointmentRecordParams} params
 * @returns {Promise<AppointmentHandlerResult>}
 */
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

/**
 * @param {AppointmentRecordParams} params
 * @returns {Promise<AppointmentHandlerResult>}
 */
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

/**
 * @param {AppointmentRecordParams} params
 * @returns {Promise<AppointmentHandlerResult>}
 */
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


export {};
