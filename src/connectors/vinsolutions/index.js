/* eslint-disable no-param-reassign */
const axios = require('axios');
const moment = require('moment');
const url = require('url');
const { parsePhoneNumber } = require('awesome-phonenumber');
const jwt = require('@app-connect/core/lib/jwt');
const { UserModel } = require('@app-connect/core/models/userModel');
const { AdminConfigModel } = require('@app-connect/core/models/adminConfigModel');
const { LOG_DETAILS_FORMAT_TYPE } = require('@app-connect/core/lib/constants');
const logger = require('@app-connect/core/lib/logger');
const { handleDatabaseError } = require('@app-connect/core/lib/errorHandler');

const API_BASE_URL = process.env.VINSOLUTIONS_API_BASE_URL || 'https://api.vinsolutions.com';
const TOKEN_URI = process.env.VINSOLUTIONS_TOKEN_URI || 'https://authentication.vinsolutions.com/connect/token';
const DEFAULT_SCOPE = process.env.VINSOLUTIONS_SCOPE || 'PublicAPI';
const GATEWAY_JSON = 'application/json';
const LEAD_MANAGEMENT_V3 = 'application/vnd.coxauto.v3+json';
const CALL_TRACKING_V1 = 'application/vnd.coxauto.v1+json';
const TOKEN_EXPIRY_BUFFER_MINUTES = 5;
/** Core requires user.accessToken to be set; VinSolutions API tokens live in platformAdditionalInfo only. */
const CONNECTED_SENTINEL = 'vinsolutions-connected';

/**
 * OAuth token profiles for VinSolutions.
 * Same token endpoint (TOKEN_URI), different client_id/secret per API family.
 * All access tokens are stored in user.platformAdditionalInfo only.
 *
 * To add another profile later, add one entry here and use ensureAccessToken(user, key).
 */
const TOKEN_PROFILES = {
    leadManagement: {
        clientIdEnv: 'VINSOLUTIONS_LEAD_MANAGEMENT_CLIENT_ID',
        clientSecretEnv: 'VINSOLUTIONS_LEAD_MANAGEMENT_CLIENT_SECRET',
        accessTokenField: 'vinsLeadManagementAccessToken',
        expiryField: 'vinsLeadManagementTokenExpiry'
    },
    callTracking: {
        clientIdEnv: 'VINSOLUTIONS_CALL_TRACKING_CLIENT_ID',
        clientSecretEnv: 'VINSOLUTIONS_CALL_TRACKING_CLIENT_SECRET',
        accessTokenField: 'vinsCallTrackingAccessToken',
        expiryField: 'vinsCallTrackingTokenExpiry'
    }
};

const TOKEN_TYPES = {
    LEAD_MANAGEMENT: 'leadManagement',
    CALL_TRACKING: 'callTracking'
};

function getAuthType() {
    return 'oauth';
}

function getLogFormatType() {
    return LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT;
}

// Required for apiKey manifest login flow; auth is via server-side client_credentials in getUserInfo.
function getBasicAuth() {
    return '';
}

// Server-to-server client_credentials only — no authorization redirect or refresh token.
async function getOauthInfo() {
    const { clientId, clientSecret } = getClientCredentials(TOKEN_TYPES.LEAD_MANAGEMENT);
    return {
        clientId,
        clientSecret,
        accessTokenUri: TOKEN_URI
    };
}

function getClientCredentials(tokenType) {
    const profile = TOKEN_PROFILES[tokenType];
    if (!profile) {
        throw new Error(`Unknown VinSolutions token profile: ${tokenType}`);
    }
    const clientId = process.env[profile.clientIdEnv];
    const clientSecret = process.env[profile.clientSecretEnv];
    if (!clientId || !clientSecret) {
        throw new Error(
            `VinSolutions ${tokenType} OAuth credentials are not configured. `
            + `Set ${profile.clientIdEnv} and ${profile.clientSecretEnv}.`
        );
    }
    return { clientId, clientSecret };
}

function isTokenExpiringSoon(expiry) {
    if (!expiry) {
        return true;
    }
    return moment(expiry).isSameOrBefore(moment().add(TOKEN_EXPIRY_BUFFER_MINUTES, 'minutes'));
}

function getStoredAccessToken(user, tokenType) {
    const profile = TOKEN_PROFILES[tokenType];
    return user.platformAdditionalInfo?.[profile.accessTokenField] || '';
}

function getStoredTokenExpiry(user, tokenType) {
    const profile = TOKEN_PROFILES[tokenType];
    return user.platformAdditionalInfo?.[profile.expiryField] || null;
}

function applyTokenToUser(user, tokenType, tokenData) {
    const profile = TOKEN_PROFILES[tokenType];
    user.platformAdditionalInfo = {
        ...(user.platformAdditionalInfo || {}),
        [profile.accessTokenField]: tokenData.accessToken,
        [profile.expiryField]: tokenData.expires
    };
}

function getProviderName() {
    return process.env.VINSOLUTIONS_PROVIDER_NAME || 'RingCentral';
}

function getLeadManagementApiKey() {
    return process.env.VINSOLUTIONS_LEAD_MANAGEMENT_API_KEY
        
}

function getCallTrackingApiKey() {
    return process.env.VINSOLUTIONS_CALL_TRACKING_API_KEY
        
}

function getStoredApiKeys() {
    return {
        vinsLeadManagementApiKey: process.env.VINSOLUTIONS_LEAD_MANAGEMENT_API_KEY,
        vinsCallTrackingApiKey: process.env.VINSOLUTIONS_CALL_TRACKING_API_KEY
    };
}

/** /gateway/v1/* endpoints use path versioning with standard application/json headers. */
function buildGatewayHeaders({ accessToken, user, withContentType = false }) {
    const headers = {
        Authorization: `Bearer ${accessToken}`,
        api_key: getLeadManagementApiKey(),
        Accept: GATEWAY_JSON
    };
    if (withContentType) {
        headers['Content-Type'] = GATEWAY_JSON;
    }
    return headers;
}

/** /leads and other header-versioned Lead Management endpoints. */
function buildLeadManagementHeaders({ accessToken, user, withContentType = false }) {
    const headers = {
        Authorization: `Bearer ${accessToken}`,
        api_key: getLeadManagementApiKey(),
        Accept: LEAD_MANAGEMENT_V3
    };
    if (withContentType) {
        headers['Content-Type'] = LEAD_MANAGEMENT_V3;
    }
    return headers;
}

/** Call Tracking /calldetails endpoints use application/vnd.coxauto.v1+json. */
function buildCallTrackingHeaders({ accessToken, user, withContentType = true }) {
    const headers = {
        Authorization: `Bearer ${accessToken}`,
        api_key: getCallTrackingApiKey(),
        Accept: CALL_TRACKING_V1
    };
    if (withContentType) {
        headers['Content-Type'] = CALL_TRACKING_V1;
    }
    return headers;
}

async function fetchAllAccessTokens() {
    const entries = await Promise.all(
        Object.keys(TOKEN_PROFILES).map(async (tokenType) => {
            const tokenData = await fetchAccessToken(tokenType);
            return [tokenType, tokenData];
        })
    );
    return Object.fromEntries(entries);
}

function buildPlatformTokenFields(tokenDataByType) {
    const fields = {};
    for (const [tokenType, tokenData] of Object.entries(tokenDataByType)) {
        const profile = TOKEN_PROFILES[tokenType];
        fields[profile.accessTokenField] = tokenData.accessToken;
        fields[profile.expiryField] = tokenData.expires;
    }
    return fields;
}

async function fetchAccessToken(tokenType) {
    const { clientId, clientSecret } = getClientCredentials(tokenType);

    const params = new url.URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: DEFAULT_SCOPE
    });

    const response = await axios.post(TOKEN_URI, params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const expiresIn = Number(response.data.expires_in || 3600);
    return {
        accessToken: response.data.access_token,
        expires: moment().add(expiresIn, 'seconds').toISOString(),
        scope: response.data.scope || DEFAULT_SCOPE
    };
}

async function refreshAccessTokenForUser(user, tokenType) {
    const tokenData = await fetchAccessToken(tokenType);
    applyTokenToUser(user, tokenType, tokenData);
    await user.save();
    return tokenData.accessToken;
}

async function ensureAccessToken(user, tokenType) {
    const storedToken = getStoredAccessToken(user, tokenType);
    const storedExpiry = getStoredTokenExpiry(user, tokenType);
    if (storedToken && !isTokenExpiringSoon(storedExpiry)) {
        return storedToken;
    }
    return refreshAccessTokenForUser(user, tokenType);
}

// VinSolutions uses client_credentials only — there is no refresh_token.
// When either access token nears expiry, request new tokens from the token endpoint.
async function checkAndRefreshAccessToken(_oauthApp, user) {
    if (!user) {
        return user;
    }

    const hasAnyToken = Object.keys(TOKEN_PROFILES).some(
        (tokenType) => getStoredAccessToken(user, tokenType)
    );
    if (!hasAnyToken) {
        return user;
    }

    try {
        let changed = false;
        for (const tokenType of Object.keys(TOKEN_PROFILES)) {
            const hasToken = getStoredAccessToken(user, tokenType);
            if (!hasToken) {
                continue;
            }
            if (isTokenExpiringSoon(getStoredTokenExpiry(user, tokenType))) {
                const tokenData = await fetchAccessToken(tokenType);
                applyTokenToUser(user, tokenType, tokenData);
                changed = true;
            }
        }
        if (changed) {
            await user.save();
        }
        return user;
    }
    catch (error) {
        logger.error('VinSolutions token renewal failed', { stack: error.stack, tokenType: error.tokenType });
        return null;
    }
}

function getDealerContext(user) {
    return {
        dealerId: Number(user.platformAdditionalInfo.dealerId),
        userId: Number(user.platformAdditionalInfo.crmUserId)
    };
}

function formatContactName(contact) {
    const info = contact.ContactInformation || {};
    const parts = [info.FirstName, info.MiddleName, info.LastName].filter(Boolean);
    if (parts.length > 0) {
        return parts.join(' ');
    }
    return info.CompanyName || `Contact ${contact.ContactId}`;
}

function getPrimaryPhone(contact) {
    const phones = contact.ContactInformation?.Phones || [];
    const primary = phones.find((phone) => (phone.PhoneType || '').toLowerCase() === 'cell')
        || phones.find((phone) => (phone.PhoneType || '').toLowerCase() === 'home')
        || phones[0];
    return primary?.Number || '';
}

function buildPhoneSearchValues(phoneNumber, overridingFormat) {
    const normalized = phoneNumber.replace(' ', '+');
    const values = new Set();
    const phoneNumberObj = parsePhoneNumber(normalized);

    if (overridingFormat) {
        const formats = overridingFormat.split(',');
        for (const format of formats) {
            if (!phoneNumberObj.valid) {
                continue;
            }
            let formattedNumber = format.startsWith(' ') ? format.replace(' ', '') : format;
            for (const digit of phoneNumberObj.number.significant) {
                formattedNumber = formattedNumber.replace(/[*#]/, digit);
            }
            values.add(formattedNumber);
        }
    }

    if (phoneNumberObj.valid) {
        values.add(phoneNumberObj.number.significant);
        values.add(phoneNumberObj.number.e164);
        values.add(phoneNumberObj.number.international.replace(/\s/g, ''));
    }
    values.add(normalized.replace(/^\+/, ''));

    return [...values].filter(Boolean);
}

async function fetchActiveLeadsForContact({ user, contactId }) {
    const { dealerId, userId } = getDealerContext(user);
    try {
        const accessToken = await ensureAccessToken(user, TOKEN_TYPES.LEAD_MANAGEMENT);
        const response = await axios.get(`${API_BASE_URL}/leads`, {
            headers: buildLeadManagementHeaders({ accessToken, user }),
            params: {
                dealerId,
                userId,
                contactId,
                leadStatusType: 'ACTIVE'
            }
        });
        const leads = response.data?.results || [];
        return leads.map((lead) => ({
            const: lead.leadId,
            title: `Lead #${lead.leadId}${lead.leadStatus ? ` (${lead.leadStatus})` : ''}`
        }));
    }
    catch (error) {
        logger.error('VinSolutions lead lookup failed', {
            error,
            stack: error.stack,
            errorResponse: error.response?.data,
            contactId
        });
        return [];
    }
}

function formatContact({ contact, phoneNumber, relatedLeads }) {
    const additionalInfo = {};
    if (relatedLeads?.length > 0) {
        additionalInfo.leads = relatedLeads;
    }
    return {
        id: contact.ContactId,
        name: formatContactName(contact),
        phone: phoneNumber || getPrimaryPhone(contact),
        additionalInfo: Object.keys(additionalInfo).length > 0 ? additionalInfo : null,
        type: 'contact'
    };
}

function mapCallResult(callLog) {
    const result = (callLog.result || '').toLowerCase();
    if (result.includes('voicemail') || result.includes('message')) {
        return 'LEFT_MESSAGE';
    }
    if (result.includes('missed') || result.includes('no answer') || result.includes('busy')) {
        return 'NO_ANSWER';
    }
    if (Number(callLog.duration) > 0 || result.includes('connect') || result.includes('answered')) {
        return 'SPOKE';
    }
    return 'NO_ANSWER';
}

function extractCallDetailId(headers) {
    const location = headers?.location || headers?.Location || '';
    const match = location.match(/\/calldetails\/id\/(\d+)/i);
    return match ? match[1] : null;
}

function extractNoteFromComposedLog(body) {
    if (!body) {
        return '';
    }
    const noteRegex = /- (?:Note|Agent notes): ([\s\S]*?)(?=\n- [A-Z][a-zA-Z\s/]*:|\n$|$)/;
    const match = body.match(noteRegex);
    if (match?.[1] !== undefined) {
        return match[1].trim();
    }
    return '';
}

function resolveCallLogNote(fullBody) {
    const extractedNote = extractNoteFromComposedLog(fullBody);
    if (extractedNote) {
        return extractedNote;
    }
    if (!fullBody || fullBody.trimStart().startsWith('-')) {
        return '';
    }
    return fullBody.trim();
}

function isAlreadyLoggedException(error) {
    const errorBody = error.response?.data;
    const errorText = typeof errorBody === 'string'
        ? errorBody
        : JSON.stringify(errorBody || '');
    return error.response?.status === 500 && errorText.includes('AlreadyLoggedException');
}

async function getUserInfo({ additionalInfo }) {
    try {
        const dealerId = Number(additionalInfo.dealerId);
        const crmUserId = Number(additionalInfo.crmUserId);
        if (!dealerId || !crmUserId) {
            return {
                successful: false,
                returnMessage: {
                    messageType: 'warning',
                    message: 'Dealer ID and CRM User ID are required.',
                    ttl: 5000
                }
            };
        }

        const tokenDataByType = await fetchAllAccessTokens();
        const leadManagementTokenData = tokenDataByType[TOKEN_TYPES.LEAD_MANAGEMENT];
        const storedApiKeys = getStoredApiKeys();
        const tempUser = {
            platformAdditionalInfo: {
                ...storedApiKeys,
                dealerId,
                crmUserId
            }
        };
        const headers = buildGatewayHeaders({ accessToken: leadManagementTokenData.accessToken, user: tempUser });

        const [userResponse, dealersResponse] = await Promise.all([
            axios.get(`${API_BASE_URL}/gateway/v1/tenant/user/id/${crmUserId}`, {
                headers,
                params: { dealerId }
            }),
            axios.get(`${API_BASE_URL}/gateway/v1/organization/dealers`, { headers })
        ]);

        const dealerItems = dealersResponse.data?.Items || [];
        const dealer = dealerItems.find((item) => item.DealerId === dealerId);
        const userData = userResponse.data;
        const id = `${crmUserId}-${dealerId}-vinsolutions`;
        const name = userData.FullName || `${userData.FirstName || ''} ${userData.LastName || ''}`.trim();

        return {
            successful: true,
            platformUserInfo: {
                id,
                name,
                timezoneName: 'UTC',
                timezoneOffset: 0,
                overridingApiKey: CONNECTED_SENTINEL,
                platformAdditionalInfo: {
                    dealerId,
                    crmUserId,
                    dealerName: dealer?.Name || '',
                    ...storedApiKeys,
                    ...buildPlatformTokenFields(tokenDataByType),
                    email: userData.EmailAddress || ''
                }
            },
            returnMessage: {
                messageType: 'success',
                message: dealer?.Name ? `Connected to VinSolutions (${dealer.Name}).` : 'Connected to VinSolutions.',
                ttl: 2000
            }
        };
    }
    catch (error) {
        logger.error('VinSolutions getUserInfo failed', { stack: error.stack });
        return {
            successful: false,
            returnMessage: {
                messageType: 'warning',
                message: 'Could not connect to VinSolutions. Verify dealer enablement, dealer ID, CRM user ID, and API credentials.',
                details: [
                    {
                        title: 'Details',
                        items: [
                            {
                                id: '1',
                                type: 'text',
                                text: 'Ensure the dealership has enabled your partner integration under Settings > Dealer Settings > Partner Enablement, and that the dealer ID and CRM user ID are correct.'
                            }
                        ]
                    }
                ],
                ttl: 8000
            }
        };
    }
}

async function postSaveUserInfo({ userInfo }) {
    const user = await UserModel.findByPk(userInfo.id);
    if (!user) {
        return userInfo;
    }
    user.platformAdditionalInfo = {
        ...(user.platformAdditionalInfo || {}),
        ...(userInfo.platformAdditionalInfo || {})
    };
    try {
        await user.save();
    }
    catch (error) {
        handleDatabaseError(error, 'Error saving VinSolutions platformAdditionalInfo');
    }
    return userInfo;
}

async function unAuthorize({ user }) {
    user.accessToken = '';
    user.refreshToken = '';
    user.tokenExpiry = null;
    user.platformAdditionalInfo = {
        ...(user.platformAdditionalInfo || {}),
        ...Object.values(TOKEN_PROFILES).reduce((cleared, profile) => ({
            ...cleared,
            [profile.accessTokenField]: '',
            [profile.expiryField]: null
        }), {})
    };
    try {
        await user.save();
    }
    catch (error) {
        return handleDatabaseError(error, 'Error saving user');
    }
    return {
        returnMessage: {
            messageType: 'success',
            message: 'Logged out of VinSolutions',
            ttl: 1000
        }
    };
}

async function findContact({ user, phoneNumber, overridingFormat, isExtension }) {
    if (isExtension === 'true') {
        return { successful: false, matchedContactInfo: [] };
    }

    try {
        const accessToken = await ensureAccessToken(user, TOKEN_TYPES.LEAD_MANAGEMENT);
        const { dealerId, userId } = getDealerContext(user);
        const headers = buildGatewayHeaders({ accessToken, user });
        const phoneValues = buildPhoneSearchValues(phoneNumber, overridingFormat || '');
        const contactsById = new Map();

        for (const phone of phoneValues) {
            const response = await axios.get(`${API_BASE_URL}/gateway/v1/contact`, {
                headers,
                params: {
                    dealerId,
                    userId,
                    phone,
                    pageSize: 100
                }
            });
            for (const contact of response.data || []) {
                contactsById.set(contact.ContactId, contact);
            }
        }

        const matchedContactInfo = [];
        for (const contact of contactsById.values()) {
            const relatedLeads = await fetchActiveLeadsForContact({
                user,
                contactId: contact.ContactId
            });
            matchedContactInfo.push(formatContact({
                contact,
                phoneNumber: getPrimaryPhone(contact),
                relatedLeads
            }));
        }

        matchedContactInfo.push({
            id: 'createNewContact',
            name: 'Create new contact...',
            isNewContact: true
        });

        return { successful: true, matchedContactInfo };
    }
    catch (error) {
        logger.error('VinSolutions findContact failed', { stack: error.stack });
        return {
            successful: false,
            returnMessage: {
                messageType: 'warning',
                message: 'Contact lookup failed in VinSolutions.',
                ttl: 5000
            }
        };
    }
}

async function findContactWithName({ user, name }) {
    try {
        const accessToken = await ensureAccessToken(user, TOKEN_TYPES.LEAD_MANAGEMENT);
        const { dealerId, userId } = getDealerContext(user);
        const headers = buildGatewayHeaders({ accessToken, user });
        const trimmedName = name.trim();
        const [firstName, ...lastNameParts] = trimmedName.split(/\s+/);
        const lastName = lastNameParts.join(' ');
        const params = {
            dealerId,
            userId,
            pageSize: 100,
            firstName
        };

        if (lastName) {
            params.lastName = lastName;
        }

        const response = await axios.get(`${API_BASE_URL}/gateway/v1/contact`, {
            headers,
            params
        });
        const matchedContactInfo = [];
        for (const contact of response.data || []) {
            const relatedLeads = await fetchActiveLeadsForContact({
                user,
                contactId: contact.ContactId
            });
            matchedContactInfo.push(formatContact({
                contact,
                phoneNumber: getPrimaryPhone(contact),
                relatedLeads
            }));
        }

        return { successful: true, matchedContactInfo };
    }
    catch (error) {
        logger.error('VinSolutions findContactWithName failed', { stack: error.stack });
        return {
            successful: false,
            returnMessage: {
                messageType: 'warning',
                message: 'Name search failed in VinSolutions.',
                ttl: 5000
            }
        };
    }
}

async function createContact({ user, phoneNumber, newContactName }) {
    const accessToken = await ensureAccessToken(user, TOKEN_TYPES.LEAD_MANAGEMENT);
    const { dealerId, userId } = getDealerContext(user);
    const headers = buildGatewayHeaders({
        accessToken,
        user,
        withContentType: true
    });
    const [firstName, ...lastNameParts] = newContactName.trim().split(/\s+/);
    const lastName = lastNameParts.join(' ') || 'Customer';
    const phoneNumberObj = parsePhoneNumber(phoneNumber.replace(' ', '+'));
    const phoneValue = phoneNumberObj.valid ? phoneNumberObj.number.significant : phoneNumber;

    const postBody = {
        DealerId: dealerId,
        UserId: userId,
        ContactInformation: {
            FirstName: firstName,
            LastName: lastName,
            Phones: [
                {
                    PhoneType: 'Cell',
                    Number: phoneValue
                }
            ]
        },
        LeadInformation: {}
    };

    const response = await axios.post(`${API_BASE_URL}/gateway/v1/contact`, postBody, { headers });
    const contactId = response.data?.ContactId || response.data?.ContactInformation?.ContactId;

    return {
        contactInfo: {
            id: contactId,
            name: newContactName
        },
        returnMessage: {
            message: 'Contact created in VinSolutions.',
            messageType: 'success',
            ttl: 2000
        }
    };
}

async function getUserList({ user }) {
    try {
        const accessToken = await ensureAccessToken(user, TOKEN_TYPES.LEAD_MANAGEMENT);
        const { dealerId } = getDealerContext(user);
        const headers = buildGatewayHeaders({ accessToken, user });
        const response = await axios.get(`${API_BASE_URL}/gateway/v1/tenant/user`, {
            headers,
            params: { dealerId }
        });

        return (response.data || [])
            .filter((entry) => entry.EmailAddress)
            .map((entry) => ({
                id: entry.UserId,
                name: entry.FullName || `${entry.FirstName || ''} ${entry.LastName || ''}`.trim(),
                email: entry.EmailAddress
            }));
    }
    catch (error) {
        logger.error('VinSolutions getUserList failed', { stack: error.stack });
        return [];
    }
}

async function resolveAssignedCrmUserId({ user, additionalSubmission, hashedAccountId }) {
    if (!additionalSubmission?.isAssignedToUser) {
        return user.platformAdditionalInfo.crmUserId;
    }

    if (additionalSubmission.adminAssignedUserToken) {
        try {
            const unAuthData = jwt.decodeJwt(additionalSubmission.adminAssignedUserToken);
            const assigneeUser = await UserModel.findByPk(unAuthData.id);
            if (assigneeUser?.platformAdditionalInfo?.crmUserId) {
                return assigneeUser.platformAdditionalInfo.crmUserId;
            }
        }
        catch (error) {
            logger.error('VinSolutions admin assigned user decode failed', { stack: error.stack });
        }
    }

    const adminConfig = await AdminConfigModel.findByPk(hashedAccountId);
    const mappedUserId = adminConfig?.userMappings?.find((mapping) => (
        typeof mapping.rcExtensionId === 'string'
            ? mapping.rcExtensionId === additionalSubmission.adminAssignedUserRcId
            : mapping.rcExtensionId.includes(additionalSubmission.adminAssignedUserRcId)
    ))?.crmUserId;

    return mappedUserId || user.platformAdditionalInfo.crmUserId;
}

async function createCallLog({
    user,
    contactInfo,
    callLog,
    additionalSubmission,
    transcript,
    composedLogDetails,
    hashedAccountId
}) {
    try {
        const accessToken = await ensureAccessToken(user, TOKEN_TYPES.CALL_TRACKING);
        const { dealerId } = getDealerContext(user);
        const crmUserId = await resolveAssignedCrmUserId({ user, additionalSubmission, hashedAccountId });
        const headers = buildCallTrackingHeaders({ accessToken, user });

        const direction = callLog.direction === 'Outbound' ? 'OUTBOUND' : 'INBOUND';
        const fromNumber = callLog.from?.phoneNumber
            || callLog.from?.extensionId
            || callLog.to?.phoneNumber
            || '';
        const toNumber = callLog.to?.phoneNumber || '';
        const startTime = moment(callLog.startTime).utc();
        const durationSeconds = callLog.duration === 'pending' ? 0 : Number(callLog.duration || 0);
        const endTime = startTime.clone().add(durationSeconds, 'seconds');
        const leadId = additionalSubmission?.leads ? Number(additionalSubmission.leads) : null;

        const postBody = {
            providerName: getProviderName(),
            accountId: String(dealerId),
            marketingSource: 'RingCentral',
            providerUserId: String(crmUserId),
            communicationType: 'PHONE',
            callDirection: direction,
            fromNumber,
            toNumber,
            callRingStartUTC: startTime.toISOString(),
            callTalkStartUTC: startTime.toISOString(),
            callEndUTC: endTime.toISOString(),
            callDurationSeconds: durationSeconds,
            callResult: mapCallResult(callLog),
            recordingHref: callLog.recording?.link || callLog.recordingLink || '',
            transcriptFull:  composedLogDetails || '',
            providerReferenceId: String(callLog.sessionId || callLog.id || ''),
            vinProperties: {
                dealerId,
                userId: Number(crmUserId),
                contactId: Number(contactInfo.id),
                ...(leadId ? { leadId } : {})
            }
        };

        console.log('postBody is', postBody);

        const response = await axios.post(`${API_BASE_URL}/calldetails`, postBody, { headers });
        const logId = extractCallDetailId(response.headers);

        return {
            logId,
            returnMessage: {
                message: 'Call logged to VinSolutions.',
                messageType: 'success',
                ttl: 2000
            }
        };
    }
    catch (error) {
        if (isAlreadyLoggedException(error)) {
            const logId = extractCallDetailId(error.response?.headers);
            return {
                logId,
                returnMessage: {
                    message: 'Call was already logged in VinSolutions.',
                    messageType: 'success',
                    ttl: 2000
                }
            };
        }
        logger.error('VinSolutions createCallLog failed', { error });
        return {
            logId: null,
            returnMessage: {
                message: 'Failed to log call in VinSolutions. Verify provider name registration and dealer enablement.',
                messageType: 'error',
                ttl: 5000
            }
        };
    }
}

async function getCallLog({ user, callLogId, contactId }) {
    const { dealerId, userId } = getDealerContext(user);
    const callTrackingToken = await ensureAccessToken(user, TOKEN_TYPES.CALL_TRACKING);
    const getLogRes = await axios.get(`${API_BASE_URL}/calldetails/id/${callLogId}`, {
        headers: buildCallTrackingHeaders({ accessToken: callTrackingToken, user, withContentType: false }),
        params: {
            accountId: String(dealerId),
            providerName: getProviderName()
        }
    });

    console.log('getLogRes call details', getLogRes.data);

    const callDetail = getLogRes.data || {};
    const fullBody = callDetail.transcriptFull || callDetail.transcriptShort || '';
    const note = resolveCallLogNote(fullBody);
    let contactName = '';
    const resolvedContactId = callDetail.vinProperties?.contactId || contactId;

    if (resolvedContactId) {
        const leadManagementToken = await ensureAccessToken(user, TOKEN_TYPES.LEAD_MANAGEMENT);
        const contactRes = await axios.get(`${API_BASE_URL}/gateway/v1/contact`, {
            headers: buildGatewayHeaders({ accessToken: leadManagementToken, user }),
            params: {
                dealerId,
                userId,
                contactId: resolvedContactId,
                pageSize: 1
            }
        });
        const contact = (contactRes.data || [])[0];
        if (contact) {
            contactName = formatContactName(contact);
        }
    }

    const direction = callDetail.callDirection;
    const subject = direction === 'OUTBOUND'
        ? 'Outbound call'
        : direction === 'INBOUND'
            ? 'Inbound call'
            : 'Phone call';
    const dispositions = {};
    if (callDetail.vinProperties?.leadId) {
        dispositions.leads = callDetail.vinProperties.leadId;
    }

    return {
        callLogInfo: {
            subject,
            note,
            fullBody,
            fullLogResponse: callDetail,
            contactName,
            dispositions
        }
    };
}

async function updateCallLog({
    user,
    existingCallLog,
    duration,
    additionalSubmission,
    composedLogDetails,
    hashedAccountId
}) {
    try {
        const callDetailId = existingCallLog.thirdPartyLogId;
        if (!callDetailId) {
            return {
                returnMessage: {
                    message: 'Call log ID not found.',
                    messageType: 'warning',
                    ttl: 3000
                }
            };
        }

        const accessToken = await ensureAccessToken(user, TOKEN_TYPES.CALL_TRACKING);
        const { dealerId } = getDealerContext(user);
        const crmUserId = await resolveAssignedCrmUserId({ user, additionalSubmission, hashedAccountId });
        const headers = buildCallTrackingHeaders({
            accessToken,
            user
        });

        const patchBody = {
            providerName: getProviderName(),
            vinProperties: {
                dealerId
            }
        };
        if (composedLogDetails) {
            patchBody.transcriptFull = composedLogDetails;
        }
        if (duration) {
            patchBody.callDurationSeconds = Number(duration);
        }
        if (additionalSubmission?.leads) {
            patchBody.vinProperties.userId = Number(crmUserId);
            patchBody.vinProperties.leadId = Number(additionalSubmission.leads);
        }

        if (!composedLogDetails && !duration && !additionalSubmission?.leads) {
            return {
                updatedNote: composedLogDetails,
                returnMessage: {
                    message: 'Nothing to update.',
                    messageType: 'success',
                    ttl: 1000
                }
            };
        }

        await axios.patch(`${API_BASE_URL}/calldetails/id/${callDetailId}`, patchBody, { headers });

        return {
            updatedNote: composedLogDetails,
            returnMessage: {
                message: 'Call log updated in VinSolutions.',
                messageType: 'success',
                ttl: 2000
            }
        };
    }
    catch (error) {
        logger.error('VinSolutions updateCallLog failed', { error });
        return {
            returnMessage: {
                message: 'Failed to update call log in VinSolutions.',
                messageType: 'error',
                ttl: 5000
            }
        };
    }
}

exports.getAuthType = getAuthType;
exports.getLogFormatType = getLogFormatType;
exports.getBasicAuth = getBasicAuth;
exports.getOauthInfo = getOauthInfo;
exports.checkAndRefreshAccessToken = checkAndRefreshAccessToken;
exports.getUserInfo = getUserInfo;
exports.postSaveUserInfo = postSaveUserInfo;
exports.unAuthorize = unAuthorize;
exports.findContact = findContact;
exports.findContactWithName = findContactWithName;
exports.createContact = createContact;
exports.createCallLog = createCallLog;
exports.getCallLog = getCallLog;
exports.updateCallLog = updateCallLog;
exports.getUserList = getUserList;
