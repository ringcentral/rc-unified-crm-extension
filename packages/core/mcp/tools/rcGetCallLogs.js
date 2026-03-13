const { RingCentral } = require('../../lib/ringcentral');
const jwt = require('../../lib/jwt');
const { CallLogModel } = require('../../models/callLogModel');

const toolDefinition = {
    name: 'rcGetCallLogs',
    description: '⚠️ REQUIRES CRM CONNECTION. | Get today\'s call logs from RingCentral',
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
        required: ['timeFrom', 'timeTo']
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
        const { id: userId } = jwt.decodeJwt(jwtToken);
        if (!userId) {
            throw new Error('Invalid JWT token: userId not found');
        }
        const rcSDK = new RingCentral({
            server: process.env.RINGCENTRAL_SERVER,
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