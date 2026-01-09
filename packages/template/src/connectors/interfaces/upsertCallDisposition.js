const axios = require('axios');

async function upsertCallDisposition({ user, existingCallLog, authHeader, callDisposition }) {
    //--------------------------------------
    //--- TODO: Add CRM API call here ------
    //--------------------------------------
    const existingLogId = existingCallLog.thirdPartyLogId;
    if (callDisposition?.dispositionItem) {
        // If has disposition item, check existence. If existing, update it, otherwise create it.
    }
    return {
        logId: existingLogId
    }
}

module.exports = upsertCallDisposition;