const { RingCentral } = require('../../lib/ringcentral');
const jwt = require('../../lib/jwt');
const { CallLogModel } = require('../../models/callLogModel');

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
        const { jwtToken, rcAccessToken, timeFrom, timeTo } = args;
        if (!rcAccessToken) {
            throw new Error('RingCentral access token not found');
        }
        const decodedToken = jwt.decodeJwt(jwtToken);
        if (!decodedToken) {
            throw new Error('Invalid JWT token');
        }
        const { id: userId } = decodedToken;
        if (!userId) {
            throw new Error('Invalid JWT token: userId not found');
        }
        const rcSDK = new RingCentral({
            server: 'https://platform.ringcentral.com',
            clientId: process.env.RINGCENTRAL_CLIENT_ID,
            clientSecret: process.env.RINGCENTRAL_CLIENT_SECRET,
            redirectUri: `${process.env.APP_SERVER}/ringcentral/oauth/callback`
        });
        const callLogData = await rcSDK.getCallLogData({
            token: { access_token: rcAccessToken, token_type: 'Bearer' },
            timeFrom: timeFrom ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
            timeTo: timeTo ?? new Date().toISOString(),
        });
        return callLogData;
    }
    catch (e) {
        return {
            success: false,
            error: e.message
        }
    }
}

exports.definition = toolDefinition;
exports.execute = execute;
