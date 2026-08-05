// @ts-check
/** @typedef {import('../types').AppointmentAuthParams} AppointmentAuthParams */
/** @typedef {import('../types').AppointmentAuthFailure} AppointmentAuthFailure */
/** @typedef {import('../types').AppointmentAuthResult} AppointmentAuthResult */
/** @typedef {import('../types').AppointmentConnector} AppointmentConnector */
/** @typedef {import('../types').AppointmentListHandlerResult} AppointmentListHandlerResult */
/** @typedef {import('../types').AppointmentCreateHandlerResult} AppointmentCreateHandlerResult */
/** @typedef {import('../types').AppointmentRecordHandlerResult} AppointmentRecordHandlerResult */
/** @typedef {import('../types').AppointmentActionHandlerResult} AppointmentActionHandlerResult */
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
 * Adds the handler success envelope while preserving an explicit connector
 * failure. Connector success may omit `successful` or set it to literal true;
 * every other supplied value is an invalid connector response.
 *
 * @template {{ successful?: true } | { successful: false }} TResult
 * @param {TResult} result
 * @returns {TResult extends { successful: false }
 *   ? TResult
 *   : Omit<TResult, 'successful'> & { successful: true }}
 */
function withAppointmentResultEnvelope(result) {
    if (result === null || typeof result !== 'object' || Array.isArray(result)) {
        throw new TypeError('Appointment connector returned a non-object result.');
    }
    if (
        'successful' in result
        && result.successful !== true
        && result.successful !== false
    ) {
        throw new TypeError('Appointment connector returned an invalid successful value.');
    }
    return /** @type {TResult extends { successful: false } ? TResult : Omit<TResult, 'successful'> & { successful: true }} */ (
        { successful: true, ...result }
    );
}

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

    const platformModule = /** @type {AppointmentConnector} */ (
        connectorRegistry.getConnector(platform)
    );
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
 * @returns {Promise<AppointmentListHandlerResult>}
 */
async function listAppointments({ platform, userId, range }) {
    try {
        const authResult = await resolveAuth({ platform, userId });
        if (!authResult.successful) return authResult;

        const result = await authResult.platformModule.listAppointments({
            user: authResult.user,
            authHeader: authResult.authHeader,
            range,
            proxyConfig: authResult.proxyConfig
        });
        return withAppointmentResultEnvelope(result);
    }
    catch (e) {
        return handleApiError(e, platform, 'listAppointments', { userId });
    }
}

/**
 * @param {AppointmentPayloadParams} params
 * @returns {Promise<AppointmentCreateHandlerResult>}
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
        return withAppointmentResultEnvelope(result);
    }
    catch (e) {
        return handleApiError(e, platform, 'createAppointment', { userId });
    }
}

/**
 * @param {AppointmentPatchParams} params
 * @returns {Promise<AppointmentRecordHandlerResult>}
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
        return withAppointmentResultEnvelope(result);
    }
    catch (e) {
        return handleApiError(e, platform, 'updateAppointment', { userId, appointmentId });
    }
}

/**
 * @param {AppointmentRecordParams} params
 * @returns {Promise<AppointmentRecordHandlerResult>}
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
        return withAppointmentResultEnvelope(result);
    }
    catch (e) {
        return handleApiError(e, platform, 'refreshAppointment', { userId, appointmentId });
    }
}

/**
 * @param {AppointmentRecordParams} params
 * @returns {Promise<AppointmentActionHandlerResult>}
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
        return withAppointmentResultEnvelope(result);
    }
    catch (e) {
        return handleApiError(e, platform, 'confirmAppointment', { userId, appointmentId });
    }
}

/**
 * @param {AppointmentRecordParams} params
 * @returns {Promise<AppointmentActionHandlerResult>}
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
        return withAppointmentResultEnvelope(result);
    }
    catch (e) {
        return handleApiError(e, platform, 'cancelAppointment', { userId, appointmentId });
    }
}

export {
    listAppointments,
    createAppointment,
    updateAppointment,
    refreshAppointment,
    confirmAppointment,
    cancelAppointment
};
