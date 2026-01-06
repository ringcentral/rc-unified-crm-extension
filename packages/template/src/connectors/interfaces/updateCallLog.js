const axios = require('axios');

// - note: note submitted by user
// - subject: subject submitted by user
// - startTime: more accurate startTime will be patched to this update function shortly after the call ends
// - duration: more accurate duration will be patched to this update function shortly after the call ends
// - result: final result will be patched to this update function shortly after the call ends
// - recordingLink: recordingLink updated from RingCentral. It's separated from createCallLog because recordings are not generated right after a call. It needs to be updated into existing call log
async function updateCallLog({ user, existingCallLog, authHeader, recordingLink, subject, note, startTime, duration, result, aiNote, transcript, composedLogDetails, existingCallLogDetails }) {
    const fs = require('fs');
    const path = require('path');
    const mockCallLogsPath = path.join(__dirname, '..', 'mockCallLogs.json');
    const mockCallLogs = require(mockCallLogsPath);
    const callLog = mockCallLogs.find(callLog => callLog.id === existingCallLog.thirdPartyLogId);
    callLog.subject = subject;
    callLog.note = composedLogDetails;
    fs.writeFileSync(mockCallLogsPath, JSON.stringify(mockCallLogs, null, 2));
    //-----------------------------------------------------------------------------------------
    //--- CHECK: In extension, for a logged call, click edit to see if info can be updated ----
    //-----------------------------------------------------------------------------------------
    
    //--------------------------------------
    //--- TODO: Add CRM API call here ------
    //--- TODO: Delete above mock JSON -----
    //--------------------------------------
    // const existingLogId = existingCallLog.thirdPartyLogId;
    // const getLogRes = await axios.get(
    //     `https://api.crm.com/activity/${existingLogId}`,
    //     {
    //         headers: { 'Authorization': authHeader }
    //     });
    // const originalNote = getLogRes.data.body;
    // let patchBody = {};

    // patchBody = {
    //     data: {
    //         subject: subject,
    //         body: note
    //     }
    // }
    // const patchLogRes = await axios.patch(
    //     `https://api.crm.com/activity/${existingLogId}`,
    //     patchBody,
    //     {
    //         headers: { 'Authorization': authHeader }
    //     });
    return {
        updatedNote: note,
        returnMessage: {
            message: 'Call log updated.',
            messageType: 'success',
            ttl: 2000
        }
    };
}

module.exports = updateCallLog;