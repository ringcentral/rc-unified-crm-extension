const { RingCentral } = require('../../lib/ringcentral');
const jwt = require('../../lib/jwt');
const { CallLogModel } = require('../../models/callLogModel');

const toolDefinition = {
    name: 'rcGetCallLogs',
    description: '⚠️ REQUIRES AUTHENTICATION: User must first authenticate using the "auth" tool to obtain a JWT token before using this tool. | Get call logs from RingCentral',
    inputSchema: {
        type: 'object',
        properties: {
            jwtToken: {
                type: 'string',
                description: 'JWT token containing userId and platform information. If user does not have this, direct them to use the "auth" tool first.'
            }
        },
        required: ['jwtToken']
    }
}

async function execute(args) {
    try {
        const { jwtToken, rcAccessToken } = args;
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
            timeFrom: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
            timeTo: new Date().toISOString(),
        });
        // hack: remove already logged calls
        const existingCalls = [];
        for(const call of callLogData.records){
            const existingCallLog = await CallLogModel.findOne({
                where: {
                    sessionId: call.sessionId
                }
            });
            if(existingCallLog){
                existingCalls.push(existingCallLog.sessionId);
            }
        }
        callLogData.records = callLogData.records.filter(call => !existingCalls.includes(call.sessionId));
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