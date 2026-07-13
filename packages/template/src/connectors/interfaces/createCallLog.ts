const axios = require('axios');

// callLog: same as in https://developers.ringcentral.com/api-reference/Call-Log/readUserCallRecord
async function createCallLog({ user, contactInfo, authHeader, callLog, note, additionalSubmission, aiNote, transcript, composedLogDetails }) {
    console.log(`adding call log... \n${JSON.stringify(callLog, null, 2)}`);
    console.log(`body... \n${composedLogDetails}`);
    console.log(`with additional info... \n${JSON.stringify(additionalSubmission, null, 2)}`);
    const newCallLog = {
        id: `CRM log id ${Date.now()}`,
        subject: callLog.customSubject,
        note: composedLogDetails,
        contactName: contactInfo.name
    }
    
    // Using mock JSON as CRM response
    const fs = require('fs');
    const path = require('path');
    const mockCallLogsPath = path.join(__dirname, '..', 'mockCallLogs.json');
    const mockCallLogs = require(mockCallLogsPath);
    mockCallLogs.push(newCallLog);
    fs.writeFileSync(mockCallLogsPath, JSON.stringify(mockCallLogs, null, 2));
    //----------------------------------------------------------------------------------
    //--- CHECK: In extension, try create a new call log against an unknown contact ----
    //----------------------------------------------------------------------------------

    //--------------------------------------
    //--- TODO: Add CRM API call here ------
    //--- TODO: Delete above mock JSON -----
    //--------------------------------------
    // const postBody = {
    //     subject: callLog.customSubject ?? `[Call] ${callLog.direction} Call ${callLog.direction === 'Outbound' ? 'to' : 'from'} ${contactInfo.name} [${contactInfo.phone}]`,
    //     body: composedLogDetails,
    //     type: 'PhoneCommunication',
    //     received_at: moment(callLog.startTime).toISOString()
    // }
    // const addLogRes = await axios.post(
    //     `https://api.crm.com/activity`,
    //     postBody,
    //     {
    //         headers: { 'Authorization': authHeader }
    //     });
    return {
        logId: newCallLog.id,
        returnMessage: {
            message: 'Call logged',
            messageType: 'success',
            ttl: 2000
        }
    };
}

module.exports = createCallLog;