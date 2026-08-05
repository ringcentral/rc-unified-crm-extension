const axios = require('axios');

async function getCallLog({ user, callLogId, authHeader }) {
    const path = require('path');
    const mockCallLogsPath = path.join(__dirname, '..', 'mockCallLogs.json');
    const mockCallLogs = require(mockCallLogsPath);
    const callLog = mockCallLogs.find(callLog => callLog.id === callLogId);
    const subject = callLog.subject;
    const note = callLog.note ? callLog.note.split('- Note: ')[1].split('\n')[0] : '';
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