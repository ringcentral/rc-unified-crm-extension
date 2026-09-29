// @ts-check

const url = require('url');
const axios = /** @type {any} */ (require('axios'));
const { CacheModel } = /** @type {any} */ (require('@app-connect/core/models/cacheModel'));

const API_BASE_URL = 'https://api.vinsolutions.com';
const TOKEN_URI = 'https://authentication.vinsolutions.com/connect/token';
const TOKEN_SCOPE = 'PublicAPI';
const TOKEN_EXPIRY_BUFFER_MS = 60 * 1000;
// The remove endpoint rejects vendor media types: VinSolutions requires plain application/json on POST.
const REMOVE_CONTENT_TYPE = 'application/json';

// Lead Management and Call Tracking are separate VinSolutions products with their own
// client credentials and API keys; a dealer enables each one independently.
const SERVICES = {
    leadManagement: {
        clientIdEnv: 'VINSOLUTIONS_LEAD_MANAGEMENT_CLIENT_ID',
        clientSecretEnv: 'VINSOLUTIONS_LEAD_MANAGEMENT_CLIENT_SECRET',
        apiKeyEnv: 'VINSOLUTIONS_LEAD_MANAGEMENT_API_KEY',
    },
    callTracking: {
        clientIdEnv: 'VINSOLUTIONS_CALL_TRACKING_CLIENT_ID',
        clientSecretEnv: 'VINSOLUTIONS_CALL_TRACKING_CLIENT_SECRET',
        apiKeyEnv: 'VINSOLUTIONS_CALL_TRACKING_API_KEY',
    },
};

const serviceNames = Object.keys(SERVICES);

class VinSolutionsConfigError extends Error {}

/**
 * @param {string} service
 */
function getServiceConfig(service) {
    const config = SERVICES[service];
    const clientId = process.env[config.clientIdEnv];
    const clientSecret = process.env[config.clientSecretEnv];
    const apiKey = process.env[config.apiKeyEnv];
    if (!clientId || !clientSecret || !apiKey) {
        throw new VinSolutionsConfigError(`VinSolutions ${service} credentials are not configured`);
    }
    return { clientId, clientSecret, apiKey };
}

/**
 * @param {string} service
 */
function getTokenCacheId(service) {
    return `support-vinsolutions-${service}-token`;
}

/**
 * Client-credentials tokens are app-level (not per dealer or user), so one cached token per
 * service serves every Support console request. There is no refresh token; expired or rejected
 * tokens are simply minted again.
 *
 * @param {string} service
 * @param {{ forceNew?: boolean }} [options]
 */
async function getAccessToken(service, { forceNew = false } = {}) {
    const cacheId = getTokenCacheId(service);
    if (!forceNew) {
        const cached = await CacheModel.findByPk(cacheId);
        if (cached?.data?.accessToken && new Date(cached.expiry).getTime() - TOKEN_EXPIRY_BUFFER_MS > Date.now()) {
            return cached.data.accessToken;
        }
    }

    const { clientId, clientSecret } = getServiceConfig(service);
    const params = new url.URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: TOKEN_SCOPE,
    });
    const response = await axios.post(TOKEN_URI, params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    const accessToken = response.data?.access_token;
    if (!accessToken) {
        throw new Error(`VinSolutions ${service} token response did not include an access token`);
    }
    const expiry = new Date(Date.now() + Number(response.data.expires_in || 3600) * 1000);
    await CacheModel.upsert({
        id: cacheId,
        status: 'active',
        userId: 'support',
        cacheKey: `vinsolutions-${service}-token`,
        data: { accessToken },
        expiry,
    });
    return accessToken;
}

/**
 * Sends a request with the service token, minting a new token once if VinSolutions rejects it.
 *
 * @param {string} service
 * @param {(headers: Record<string, string>) => Promise<any>} send
 */
async function withServiceAuth(service, send) {
    const { apiKey } = getServiceConfig(service);
    const buildHeaders = (accessToken) => ({ Authorization: `Bearer ${accessToken}`, api_key: apiKey });
    try {
        return await send(buildHeaders(await getAccessToken(service)));
    }
    catch (e) {
        if (e?.response?.status !== 401) throw e;
        return send(buildHeaders(await getAccessToken(service, { forceNew: true })));
    }
}

/**
 * Human-readable failure without request config, which would include credentials.
 *
 * @param {any} error
 */
function describeError(error) {
    if (error instanceof VinSolutionsConfigError) return error.message;
    const status = error?.response?.status;
    const data = error?.response?.data;
    const detail = typeof data === 'string'
        ? data
        : data?.Message || data?.message || data?.error_description || data?.error;
    if (status) return `VinSolutions returned ${status}${detail ? `: ${String(detail).slice(0, 300)}` : ''}`;
    return error?.message || 'VinSolutions request failed';
}

/**
 * @param {string} service
 */
async function fetchDealers(service) {
    const response = await withServiceAuth(service, (headers) => axios.get(
        `${API_BASE_URL}/gateway/v1/organization/dealers`,
        { headers: { ...headers, Accept: 'application/json' } }
    ));
    return Array.isArray(response.data?.Items) ? response.data.Items : [];
}

/**
 * Lists every dealer that enabled RingCentral in at least one VinSolutions product.
 * A service that cannot be reached is reported in `serviceErrors`; its column is unknown
 * rather than inactive.
 */
async function listIntegrations() {
    const results: any[] = await Promise.all(serviceNames.map(async (service) => {
        try {
            return { service, dealers: await fetchDealers(service) };
        }
        catch (e) {
            return { service, error: describeError(e) };
        }
    }));

    const integrations = new Map();
    const serviceErrors = {};
    for (const result of results) {
        if (result.error) {
            serviceErrors[result.service] = result.error;
            continue;
        }
        for (const dealer of result.dealers) {
            if (dealer?.DealerId === undefined || dealer?.DealerId === null) continue;
            const id = String(dealer.DealerId);
            const integration = integrations.get(id) || {
                id,
                name: dealer.Name || '',
                details: { city: dealer.City || '', state: dealer.State || '' },
                services: Object.fromEntries(serviceNames.map((name) => [name, 'inactive'])),
            };
            integration.services[result.service] = 'active';
            integrations.set(id, integration);
        }
    }
    for (const integration of integrations.values()) {
        for (const service of Object.keys(serviceErrors)) {
            integration.services[service] = 'unknown';
        }
    }

    return {
        services: serviceNames,
        integrations: [...integrations.values()].sort((a, b) => Number(a.id) - Number(b.id)),
        serviceErrors,
    };
}

/**
 * Removes RingCentral from the dealer in the given VinSolutions products. A 404 means the dealer
 * had already removed it (or was removed outside the console) and counts as done.
 *
 * @param {string} dealerId
 * @param {string[]} services
 */
async function removeIntegration(dealerId, services) {
    const entries = await Promise.all(services.map(async (service) => {
        try {
            await withServiceAuth(service, (headers) => axios.post(
                `${API_BASE_URL}/gateway/v1/organization/dealers/id/${encodeURIComponent(dealerId)}/remove`,
                {},
                { headers: { ...headers, Accept: REMOVE_CONTENT_TYPE, 'Content-Type': REMOVE_CONTENT_TYPE } }
            ));
            return [service, { status: 'removed' }];
        }
        catch (e) {
            if (e?.response?.status === 404) return [service, { status: 'alreadyRemoved' }];
            return [service, { status: 'failed', message: describeError(e) }];
        }
    }));
    return Object.fromEntries(entries);
}

/**
 * VinSolutions dealer IDs are positive integers.
 *
 * @param {string} id
 */
function isValidIntegrationId(id) {
    return /^[1-9]\d{0,17}$/.test(String(id));
}

exports.platform = 'vinsolutions';
exports.services = serviceNames;
exports.listIntegrations = listIntegrations;
exports.removeIntegration = removeIntegration;
exports.isValidIntegrationId = isValidIntegrationId;

export {};
