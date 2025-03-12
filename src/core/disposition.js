const Op = require('sequelize').Op;
const { CallLogModel } = require('../models/callLogModel');
const { MessageLogModel } = require('../models/messageLogModel');
const { UserModel } = require('../models/userModel');
const oauth = require('../lib/oauth');
const userCore = require('../core/user');

// default cases:
// 1. inboundCall
// 2. outboundCall
// 3. message
// 4. voicemail
async function createCallDisposition({ platform, user, logInfo, dispositionInfo, userSettings }) {
    try {
        const log = await CallLogModel.findOne({
            where: {
                sessionId: logInfo.sessionId
            }
        });
        if (log) {
            return {
                successful: false,
                returnMessage: {
                    message: `Cannot find log`,
                    messageType: 'warning',
                    ttl: 3000
                }
            }
        }
        const platformModule = require(`../adapters/${platform}`);
        // Defaulting logic
        const platformManifest = require('../adapters/manifest.json').platforms[platform];
        const caseType = logInfo.direction === 'Inbound' ? 'inboundCall' : 'outboundCall';
        const defaultableFields = platformManifest.page.callLog.additionFields.filter(f => !!f?.defaultSettingValues[caseType]);
        for (const f of defaultableFields) {
            dispositionInfo[f.const].defaultValue = userSettings[f.const]?.value ?? "";
        }
    }
    catch (e) {
        /* empty */
    }
}

exports.createCallDisposition = createCallDisposition;