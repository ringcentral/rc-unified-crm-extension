const axios = require('axios');

async function getCallLog({ user, callLogId, authHeader }) {
    const path = require('path');
    const mockCallLogsPath = path.join(__dirname, '..', 'mockCallLogs.json');
    const mockCallLogs = require(mockCallLogsPath);
    const callLog = mockCallLogs.find(callLog => callLog.id === callLogId);
    const subject = callLog.subject;
    // The "- Note: " line is only present when the user entered agent notes
    const noteMatch = (callLog.note || '').match(/- Note: (.*)/);
    const note = noteMatch ? noteMatch[1] : '';
    //-------------------------------------------------------------------------------------
    //--- CHECK: In extension, for a logged call, click edit to see if info is fetched ----
    //-------------------------------------------------------------------------------------

    //--------------------------------------
    //--- TODO: Add CRM API call here ------
    //--- TODO: Delete above mock JSON -----
    //--------------------------------------
    // const getLogRes = await axios.get(
    //     `https://api.crm.com/activity/${callLogId}`,
    //     {
    //         headers: { 'Authorization': authHeader }
    //     });
    return {
        callLogInfo: {
            subject,
            note,
            fullBody: callLog.note,
            dispositions: {
                testDispositionId: 'test disposition value'
            }
        },
        returnMessage: {
            message: 'Call log fetched.',
            messageType: 'success',
            ttl: 3000
        }
    }
}

module.exports = getCallLog;