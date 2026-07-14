// @ts-check

const { RingCentral: RawRingCentral } = require('../../lib/ringcentral');
const RingCentral = /** @type {any} */ (RawRingCentral);
const jwt = /** @type {any} */ (require('../../lib/jwt'));
const { CallLogModel: RawCallLogModel } = require('../../models/callLogModel');
const CallLogModel = /** @type {any} */ (RawCallLogModel);
const moment = require('moment');
const ISO_DATE_TIME_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/i;

function isNonBlankString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

function isUsableId(value) {
    return isNonBlankString(value) || (typeof value === 'number' && Number.isFinite(value));
}

function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseOptionalTime(value, fieldName) {
    if (typeof value === 'undefined') {
        return { value: undefined, timestamp: undefined };
    }
    const offsetMatch = isNonBlankString(value) ? value.match(/[+-](\d{2}):(\d{2})$/) : null;
    if (
        !isNonBlankString(value) ||
        !ISO_DATE_TIME_WITH_ZONE.test(value) ||
        (offsetMatch && (Number(offsetMatch[1]) > 23 || Number(offsetMatch[2]) > 59)) ||
        !moment(value, moment.ISO_8601, true).isValid()
    ) {
        throw new Error(`${fieldName} must be a valid ISO 8601 string`);
    }
    return { value, timestamp: moment(value).valueOf() };
}

function normalizeCaughtError(error) {
    if (error instanceof Error) {
        return error.message || 'Unknown error occurred';
    }
    if (typeof error === 'string' && error.trim()) {
        return error;
    }
    return 'Unknown error occurred';
}

const toolDefinition = {
    name: 'rcGetCallLogs',
    description: '⚠️ REQUIRES CRM CONNECTION. | Get call logs from RingCentral. Returns a `records[]` array. Each item in `records` is a complete RingCentral call log object that can be passed DIRECTLY as `incomingData.logInfo` to the `createCallLog` tool — no field renaming or restructuring needed.',
    inputSchema: {
        type: 'object',
        properties: {
            timeFrom: {
                type: 'string',
                description: 'MUST be ISO string. Default is 24 hours ago.'
            },
            timeTo: {
                type: 'string',
                description: 'MUST be ISO string. Default is now.'
            }
        },
        required: []
    },
    annotations: {
        readOnlyHint: true,
        openWorldHint: true,
        destructiveHint: false
    }
}

async function execute(args) {
    try {
        const { jwtToken, rcAccessToken, timeFrom, timeTo } = args || {};
        if (!isNonBlankString(rcAccessToken)) {
            throw new Error('RingCentral access token not found');
        }
        if (!isNonBlankString(jwtToken)) {
            throw new Error('Invalid JWT token');
        }
        const parsedTimeFrom = parseOptionalTime(timeFrom, 'timeFrom');
        const parsedTimeTo = parseOptionalTime(timeTo, 'timeTo');
        if (
            typeof parsedTimeFrom.timestamp !== 'undefined' &&
            typeof parsedTimeTo.timestamp !== 'undefined' &&
            parsedTimeFrom.timestamp > parsedTimeTo.timestamp
        ) {
            throw new Error('timeFrom must not be after timeTo');
        }
        const decodedToken = jwt.decodeJwt(jwtToken);
        if (!decodedToken) {
            throw new Error('Invalid JWT token');
        }
        const { id: userId } = decodedToken;
        if (!isUsableId(userId)) {
            throw new Error('Invalid JWT token: userId not found');
        }
        const resolvedTimeFrom = parsedTimeFrom.value ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const resolvedTimeTo = parsedTimeTo.value ?? new Date().toISOString();
        if (moment(resolvedTimeFrom).valueOf() > moment(resolvedTimeTo).valueOf()) {
            throw new Error('timeFrom must not be after timeTo');
        }
        const rcSDK = new RingCentral({
            server: process.env.RINGCENTRAL_SERVER,
            clientId: process.env.RINGCENTRAL_CLIENT_ID,
            clientSecret: process.env.RINGCENTRAL_CLIENT_SECRET,
            redirectUri: `${process.env.APP_SERVER}/ringcentral/oauth/callback`
        });
        const callLogData = await rcSDK.getCallLogData({
            token: { access_token: rcAccessToken, token_type: 'Bearer' },
            timeFrom: resolvedTimeFrom,
            timeTo: resolvedTimeTo,
        });
        if (
            !isRecord(callLogData) ||
            !Array.isArray(callLogData.records) ||
            !callLogData.records.every(isRecord)
        ) {
            throw new Error('RingCentral returned an invalid call log response');
        }
        return callLogData;
    }
    catch (e) {
        return {
            success: false,
            error: normalizeCaughtError(e)
        }
    }
}

exports.definition = toolDefinition;
exports.execute = execute;

export {};
