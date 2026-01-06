const axios = require('axios');

// message : same as in https://developers.ringcentral.com/api-reference/Message-Store/readMessage
async function createMessageLog({ user, contactInfo, authHeader, message, additionalSubmission, recordingLink, faxDocLink }) {
    const messageType = recordingLink ? 'Voicemail' : (faxDocLink ? 'Fax' : 'SMS');
    console.log(`adding message log... \n\n${JSON.stringify(message, null, 2)}`);
    const newMessageLog = {
        id:  `CRM message log id ${Date.now()}`
    }

    // Using mock JSON as CRM response
    const fs = require('fs');
    const path = require('path');
    const mockMessageLogsPath = path.join(__dirname, '..', 'mockMessageLogs.json');
    const mockMessageLogs = require(mockMessageLogsPath);
    mockMessageLogs.push(newMessageLog);
    fs.writeFileSync(mockMessageLogsPath, JSON.stringify(mockMessageLogs, null, 2));
    //-------------------------------------------------------------------------------------------------------------
    //--- CHECK: For single message logging, open db.sqlite and JSON file to check if message logs are saved ------
    //-------------------------------------------------------------------------------------------------------------

    //--------------------------------------
    //--- TODO: Add CRM API call here ------
    //--- TODO: Delete above mock JSON -----
    //--------------------------------------
    // const postBody = {
    //     data: {
    //         subject: `[SMS] ${message.direction} SMS - ${message.from.name ?? ''}(${message.from.phoneNumber}) to ${message.to[0].name ?? ''}(${message.to[0].phoneNumber})`,
    //         body: `${message.direction} SMS - ${message.direction == 'Inbound' ? `from ${message.from.name ?? ''}(${message.from.phoneNumber})` : `to ${message.to[0].name ?? ''}(${message.to[0].phoneNumber})`} \n${!!message.subject ? `[Message] ${message.subject}` : ''} ${!!recordingLink ? `\n[Recording link] ${recordingLink}` : ''}\n\n--- Created via RingCentral App Connect`,
    //         type: 'Message'
    //     }
    // }
    // const addLogRes = await axios.post(
    //     `https://api.crm.com/activity`,
    //     postBody,
    //     {
    //         headers: { 'Authorization': authHeader }
    //     });
    return {
        logId: newMessageLog.id,
        returnMessage: {
            message: 'Message logged',
            messageType: 'success',
            ttl: 1000
        }
    };
}

module.exports = createMessageLog;