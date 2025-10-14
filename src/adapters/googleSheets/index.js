const axios = require('axios');
const moment = require('moment');
const url = require('url');
const { parsePhoneNumber } = require('awesome-phonenumber');
function getAuthType() {
    return 'oauth';
}
const predefinedContactSheetName = "Contacts";
const predefinedCallLogSheetName = "Call Logs";
const predefinedMessageLogSheetName = "Message Logs";

async function getOauthInfo({ hostname }) {
    return {
        clientId: process.env.GOOGLESHEET_CLIENT_ID,
        clientSecret: process.env.GOOGLESHEET_CLIENT_SECRET,
        accessTokenUri: process.env.GOOGLESHEET_TOKEN_URI,
        redirectUri: process.env.GOOGLESHEET_REDIRECT_URI
    }
}

async function getUserInfo({ authHeader, additionalInfo, query }) {
    const { rcAccountId } = query;
    const response = await axios.get(`https://www.googleapis.com/oauth2/v3/userinfo`, {
        headers: {
            Authorization: authHeader
        }
    });
    const data = response.data;
    return {
        successful: true,
        platformUserInfo: {
            id: `${data.sub.toString()}-googleSheets`,
            name: data.name,
            email: data.email,
            platformAdditionalInfo: {
                email: data.email,
                name: data.name
            }
        }
    }
}

async function unAuthorize({ user }) {
    try {
        const response = await axios.post('https://oauth2.googleapis.com/revoke', `token=${user.accessToken}`,
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': `Bearer  ${user.accessToken}`,
                },
            }
        );
        await user.destroy();
        return {
            successful: true,
            returnMessage: {
                messageType: 'success',
                message: 'Logged out of GoogleSheet',
                ttl: 3000
            }
        }
    } catch (e) {
        return {
            returnMessage: {
                messageType: 'warning',
                message: 'Error logging out of GoogleSheet',
                ttl: 3000
            }
        }
    }
}

async function findContact({ user, authHeader, phoneNumber, overridingFormat, isExtension }) {
    if (isExtension === 'true') {
        return {
            successful: false,
            matchedContactInfo: []
        }
    }
    try {
        const contactSheetUrl = user?.userSettings?.googleSheetsUrl?.value;
        let sheetName = "";
        const phoneNumberObj = parsePhoneNumber(phoneNumber.replace(' ', '+'));
        const phoneNumberE164 = phoneNumberObj.number.e164;
        if (!contactSheetUrl) {
            return {
                successful: false,
                returnMessage: {
                    messageType: 'warning',
                    message: 'No sheet selected to search for contacts',
                    details: [
                        {
                            title: 'Details',
                            items: [
                                {
                                    id: '1',
                                    type: 'text',
                                    text: `To log calls, please go to Settings > Google Sheets Config, and either create a new sheet or attach an existing one.`
                                }
                            ]
                        }
                    ],
                    ttl: 5000
                }
            }
        }
        const spreadsheetId = extractSheetId(contactSheetUrl);
        //  const gid = contactSheetUrl.split('gid=')[1].split(/[#&?]/)[0];
        const sheetResponse = await axios.get(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
            headers: {
                Authorization: authHeader,
            },
        });
        const sheets = sheetResponse.data?.sheets;
        for (const sheet of sheets) {
            if (sheet.properties?.title === predefinedContactSheetName) {
                sheetName = sheet.properties.title;
                break;
            }
        }
        if (sheetName === "") {
            return {
                successful: false,
                returnMessage: {
                    messageType: 'danger',
                    message: "Invalid SheetName",
                    ttl: 30000
                }
            }
        }
        const matchedContactInfo = [];
        const spreadsheetData = await axios.get(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName}`, {
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json',
            }
        });
        const data = spreadsheetData.data.values;
        const headers = data[0];
        const idColumnIndex = headers.indexOf("ID");
        const nameColumnIndex = headers.indexOf("Contact name");
        const phoneColumnIndex = headers.indexOf("Phone");
        if (idColumnIndex === -1 || nameColumnIndex === -1 || phoneColumnIndex === -1) {
            return {
                successful: false,
                returnMessage: {
                    messageType: 'danger',
                    message: "Invalid Headers, First Row of Sheet should be ID,SheetId, ContactName, PhoneNumber",
                    ttl: 30000
                }
            }
        }

        const results = data.slice(0).filter(row => row[phoneColumnIndex] === phoneNumberE164);
        for (const row of results) {
            matchedContactInfo.push({
                id: row[idColumnIndex],
                name: row[nameColumnIndex],
                phoneNumber: row[phoneColumnIndex]
            });

        }
        matchedContactInfo.push({
            id: 'createNewContact',
            name: 'Create new Contact',
            additionalInfo: null,
            isNewContact: true
        });
        return {
            successful: true,
            matchedContactInfo,
        };
    }
    catch (e) {
        return {
            successful: false,
            returnMessage: {
                messageType: 'danger',
                message: "Error Finding Contact",
                ttl: 30000
            }
        }
    }

}
async function createContact({ user, authHeader, phoneNumber, newContactName, newContactType }) {
    const contactSheetUrl = user?.userSettings?.googleSheetsUrl?.value;
    let sheetName = "";
    const phoneNumberObj = parsePhoneNumber(phoneNumber.replace(' ', '+'));
    const phoneNumberE164 = phoneNumberObj.number.e164;
    if (!contactSheetUrl) {
        return {
            successful: false,
            returnMessage: {
                messageType: 'warning',
                message: 'No sheet selected to create contacts',
                details: [
                    {
                        title: 'Details',
                        items: [
                            {
                                id: '1',
                                type: 'text',
                                text: `To log calls, please go to Settings > Google Sheets Config, and either create a new sheet or attach an existing one.`
                            }
                        ]
                    }
                ],
                ttl: 5000
            }
        }
    }
    const spreadsheetId = extractSheetId(contactSheetUrl);
    // const gid = contactSheetUrl.split('gid=')[1].split(/[#&?]/)[0];
    const sheetResponse = await axios.get(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
        headers: {
            Authorization: authHeader,
        },
    });
    const sheets = sheetResponse.data?.sheets;
    for (const sheet of sheets) {
        if (sheet.properties?.title === predefinedContactSheetName) {
            sheetName = sheet.properties.title;
            break;
        }
    }
    if (sheetName === "") {
        return {
            successful: false,
            returnMessage: {
                messageType: 'danger',
                message: "Invalid SheetName",
                ttl: 30000
            }
        }
    }
    const range = `${sheetName}!A1:append`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=RAW`;

    const headers = {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
    };

    const spreadsheetData = await axios.get(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName}`, {
        headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
        }
    });
    const nextLogRow = spreadsheetData.data?.values?.length === undefined ? 1 : spreadsheetData.data?.values?.length + 1;
    let contactId = nextLogRow;
    const columnIndexes = await getColumnIndexes(spreadsheetId, sheetName, authHeader);
    const rowData = new Array(Object.keys(columnIndexes).length).fill("");
    // const data = {
    //     values: [
    //         [contactId, newContactName, phoneNumberE164]
    //     ],
    // };
    const requestData = {
        "ID": nextLogRow,
        "Sheet Id": spreadsheetId,
        "Contact name": newContactName,
        "Phone": phoneNumberE164
    };
    Object.entries(requestData).forEach(([key, value]) => {
        if (columnIndexes[key] !== undefined) {
            rowData[columnIndexes[key]] = value;
        }
    });
    const response = await axios.post(url, { values: [rowData] }, { headers });
    return {
        contactInfo: {
            id: contactId,
            name: newContactName
        },
        returnMessage: {
            message: 'Contact created',
            messageType: 'success',
            ttl: 5000
        }
    }
}
async function createCallLog({ user, contactInfo, authHeader, callLog, note, additionalSubmission, aiNote, transcript }) {
    try {
        const sheetUrl = user?.userSettings?.googleSheetsUrl?.value;
        //  const sheetName = user?.userSettings?.googleSheetNameId?.value;
        let sheetName = "";
        if (!sheetUrl) {
            return {
                successful: false,
                returnMessage: {
                    messageType: 'warning',
                    message: 'No sheet selected',
                    details: [
                        {
                            title: 'Details',
                            items: [
                                {
                                    id: '1',
                                    type: 'text',
                                    text: `To log calls, please go to Settings > Google Sheets Config, and either create a new sheet or attach an existing one.`
                                }
                            ]
                        }
                    ],
                    ttl: 5000
                }
            }
        }
        const spreadsheetId = extractSheetId(sheetUrl);
        // const gid = sheetUrl.split('gid=')[1].split(/[#&?]/)[0];
        const sheetResponse = await axios.get(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
            headers: {
                Authorization: authHeader,
            },
        });
        const sheets = sheetResponse.data?.sheets;
        for (const sheet of sheets) {
            if (sheet.properties?.title === predefinedCallLogSheetName) {
                sheetName = sheet.properties.title;
                break;
            }
        }
        if (sheetName === "") {
            return {
                successful: false,
                returnMessage: {
                    messageType: 'danger',
                    message: "Invalid SheetName",
                    ttl: 30000
                }
            }
        }
        // const sheetName = 'Sheet1';
        const range = `${sheetName}!A1:append`;
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=RAW`;
        const headers = {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
        };
        const title = callLog.customSubject ?? `${callLog.direction} Call ${callLog.direction === 'Outbound' ? 'to' : 'from'} ${contactInfo.name}`;
        let callStartTime = moment(callLog.startTime).toISOString();
        const callEndTime = (callLog.duration === 'pending') ? moment(callStartTime) : moment(callStartTime).add(callLog.duration, 'seconds');
        const spreadsheetData = await axios.get(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName}`, {
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json',
            }
        });
        const nextLogRow = spreadsheetData.data?.values?.length === undefined ? 1 : spreadsheetData.data?.values?.length + 1;
        // const data = {
        //     values: [
        //         [nextLogRow, spreadsheetId, title, note, contactInfo.name, contactInfo.phoneNumber, callStartTime, callEndTime, callLog.duration, callLog.sessionId, callLog.direction]
        //     ],
        // };
        const columnIndexes = await getColumnIndexes(spreadsheetId, sheetName, authHeader);
        const rowData = new Array(Object.keys(columnIndexes).length).fill("");
        const requestData = {
            "ID": nextLogRow,
            "Sheet Id": spreadsheetId,
            "Subject": title,
            "Contact name": contactInfo.name,
            "Notes": note,
            "Phone": contactInfo.phoneNumber,
            "Start time": callStartTime,
            "End time": callEndTime,
            "Duration": callLog.duration,
            "Session Id": callLog.sessionId,
            "Direction": callLog.direction,
            "Call Result": callLog.result,
            "Call Recording": callLog?.recording?.link !== undefined ? callLog.recording.link : "",
        };
        Object.entries(requestData).forEach(([key, value]) => {
            if (columnIndexes[key] !== undefined) {
                rowData[columnIndexes[key]] = value;
            }
        });

        const response = await axios.post(url, { values: [rowData] }, { headers });
        // const logId = `${spreadsheetId}/edit?gid=${gid}`;
        return {
            logId: nextLogRow,
            successful: true,
            returnMessage: {
                message: 'Call logged',
                messageType: 'success',
                ttl: 2000
            }
        };
    } catch (error) {
        return {
            successful: false,
            returnMessage: {
                messageType: 'danger',
                message: 'Error logging call',
                details: [
                    {
                        title: 'Details',
                        items: [
                            {
                                id: '1',
                                type: 'text',
                                text: `An error occurred while logging the call, or no sheet has been selected. To log calls, please go to Settings > Google Sheets Config, and either create a new sheet or attach an existing one.`
                            }
                        ]
                    }
                ],
                ttl: 60000
            }
        }
    }
}
async function updateCallLog({ user, existingCallLog, authHeader, recordingLink, subject, note, startTime, duration, result, aiNote, transcript }) {
    const sheetUrl = user?.userSettings?.googleSheetsUrl?.value;
    let sheetName = "";
    try {
        if (!sheetUrl) {
            return {
                successful: false,
                returnMessage: {
                    messageType: 'warning',
                    message: 'No sheet selected',
                    details: [
                        {
                            title: 'Details',
                            items: [
                                {
                                    id: '1',
                                    type: 'text',
                                    text: `To log calls, please go to Settings > Google Sheets Config, and either create a new sheet or attach an existing one.`
                                }
                            ]
                        }
                    ],
                    ttl: 5000
                }
            }
        }
        // const splitValues = callLogId.split("space");
        const spreadsheetId = extractSheetId(sheetUrl);
        // const gid = sheetUrl.split('gid=')[1].split(/[#&?]/)[0];
        const sheetResponse = await axios.get(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
            headers: {
                Authorization: authHeader,
            },
        });
        const sheets = sheetResponse.data?.sheets;
        for (const sheet of sheets) {
            if (sheet.properties?.title === predefinedCallLogSheetName) {
                sheetName = sheet.properties.title;
                break;
            }
        }
        if (sheetName === "") {
            return {
                successful: false,
                returnMessage: {
                    messageType: 'danger',
                    message: "Invalid SheetName",
                    ttl: 30000
                }
            }
        }

        const existingLogId = existingCallLog.thirdPartyLogId;
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName}`;
        const response = await axios.get(url, {
            headers: {
                Authorization: authHeader,
            },
        });
        const rows = response.data.values;
        const headers = response.data.values[0]; // First row as headers
        const idColumnIndex = headers.indexOf("ID");
        let rowIndex = -1;
        for (let i = 0; i < rows.length; i++) {
            if (rows[i][idColumnIndex] === existingLogId) { // Assuming column A is index 0
                rowIndex = i + 1; // Convert to 1-based index (Sheets starts from 1)
                break;
            }
        }
        if (rowIndex === -1) {
            return {
                successful: false,
                returnMessage: {
                    messageType: 'danger',
                    message: 'Call log not updated',
                    ttl: 3000
                }
            }
        } else {
            const columnCIndex = headers.indexOf("Subject");
            const columnDIndex = headers.indexOf("Notes");
            const columnDurationIndex = headers.indexOf("Duration");
            const columnResultIndex = headers.indexOf("Call Result");
            const columnRecordingIndex = headers.indexOf("Call Recording");

            if (columnCIndex === -1 || columnDIndex === -1) {
                return {
                    returnMessage: {
                        messageType: 'warning',
                        message: 'Error logging out of GoogleSheet',
                        ttl: 3000
                    }
                }
            }
            const subjectColumn = String.fromCharCode(65 + columnCIndex);
            const noteColumn = String.fromCharCode(65 + columnDIndex);
            const durationColumn = String.fromCharCode(65 + columnDurationIndex);
            const resultColumn = String.fromCharCode(65 + columnResultIndex);
            const recordingColumn = String.fromCharCode(65 + columnRecordingIndex);
            const updateRequestData = [
                {
                    range: `${sheetName}!${subjectColumn}${rowIndex}`,
                    values: [[subject]]
                },
                {
                    range: `${sheetName}!${noteColumn}${rowIndex}`,
                    values: [[note]]
                },
                {
                    range: `${sheetName}!${durationColumn}${rowIndex}`,
                    values: [[duration]]
                },
                {
                    range: `${sheetName}!${resultColumn}${rowIndex}`,
                    values: [[result]]
                }
            ];
            if (recordingLink !== undefined) {
                updateRequestData.push({
                    range: `${sheetName}!${recordingColumn}${rowIndex}`,
                    values: [[recordingLink]]
                });
            }
            const response = await axios.post(
                `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
                {
                    valueInputOption: "RAW",
                    data: updateRequestData
                },
                {
                    headers: {
                        "Authorization": authHeader,
                        "Content-Type": "application/json"
                    }
                }
            );
            return {
                updatedNote: note,
                successful: true,
                returnMessage: {
                    message: 'Call log updated.',
                    messageType: 'success',
                    ttl: 2000
                }
            };
        }
    } catch (error) {
        return {
            successful: false,
            returnMessage: {
                messageType: 'danger',
                message: 'Error Updating call',
                details: [
                    {
                        title: 'Details',
                        items: [
                            {
                                id: '1',
                                type: 'text',
                                text: `An error occurred while updating the call log, or no sheet has been selected. To log calls, please go to Settings > Google Sheets Config, and either create a new sheet or attach an existing one.`
                            }
                        ]
                    }
                ],
                ttl: 60000
            }
        }
    }
}

async function getCallLog({ user, callLogId, authHeader }) {
    const sheetUrl = user?.userSettings?.googleSheetsUrl?.value;
    //const sheetName = user?.userSettings?.googleSheetNameId?.value;
    let sheetName = "";
    if (!sheetUrl) {
        return {
            successful: false,
            returnMessage: {
                messageType: 'warning',
                message: 'No sheet selected',
                details: [
                    {
                        title: 'Details',
                        items: [
                            {
                                id: '1',
                                type: 'text',
                                text: `To log calls, please go to Settings > Google Sheets Config, and either create a new sheet or attach an existing one.`
                            }
                        ]
                    }
                ],
                ttl: 60000
            }
        }
    }
    // const splitValues = callLogId.split("space");
    const spreadsheetId = extractSheetId(sheetUrl);
    //  const gid = sheetUrl.split('gid=')[1].split(/[#&?]/)[0];
    const sheetResponse = await axios.get(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
        headers: {
            Authorization: authHeader,
        },
    });
    const sheets = sheetResponse.data?.sheets;
    for (const sheet of sheets) {
        if (sheet.properties?.title === predefinedCallLogSheetName) {
            sheetName = sheet.properties.title;
            break;
        }
    }
    if (sheetName === "") {
        return {
            successful: false,
            returnMessage: {
                messageType: 'danger',
                message: "Invalid SheetName",
                ttl: 30000
            }
        }
    }
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName}`;

    const response = await axios.get(url, {
        headers: {
            Authorization: authHeader,
        },
    });

    const rows = response.data.values;
    const headers = response.data.values[0]; // First row as headers
    const idColumnIndex = headers.indexOf("ID");
    let rowIndex = -1;
    for (let i = 0; i < rows.length; i++) {
        if (rows[i][idColumnIndex] === callLogId) { // Assuming column A is index 0
            rowIndex = i + 1; // Convert to 1-based index (Sheets starts from 1)
            break;
        }
    }
    if (rowIndex === -1) {
        return {
            returnMessage: {
                messageType: 'danger',
                message: 'Call log not found',
                ttl: 3000
            }
        }
    } else {
        // const headerResponse = await axios.get(
        //     `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName}!1:1`,
        //     { headers: { Authorization: authHeader } }
        // );
        const columnCIndex = headers.indexOf("Subject");
        const columnDIndex = headers.indexOf("Notes");

        if (columnCIndex === -1 || columnDIndex === -1) {
            return {
                returnMessage: {
                    messageType: 'warning',
                    message: 'Error logging out of GoogleSheet',
                    ttl: 3000
                }
            }
        }
        const subjectColumn = String.fromCharCode(65 + columnCIndex);
        const noteColumn = String.fromCharCode(65 + columnDIndex);
        const resultResponse = await axios.get(
            `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?ranges=${sheetName}!${subjectColumn}${rowIndex}&ranges=${sheetName}!${noteColumn}${rowIndex}`,
            {
                headers: { Authorization: authHeader }
            }
        );
        const result = resultResponse.data.valueRanges;
        const subject = result[0]?.values?.[0]?.[0] ?? "";
        const note = result[1]?.values?.[0]?.[0] ?? "";
        return {
            callLogInfo: {
                subject,
                note,
                additionalSubmission: {}
            },
            returnMessage: {
            }
        }
    }

}

async function createMessageLog({ user, contactInfo, authHeader, message, additionalSubmission, recordingLink, faxDocLink }) {
    try {
        const sheetUrl = user?.userSettings?.googleSheetsUrl?.value;
        let sheetName = "";
        if (!sheetUrl) {
            return {
                successful: false,
                returnMessage: {
                    messageType: 'warning',
                    message: 'No sheet selected',
                    details: [
                        {
                            title: 'Details',
                            items: [
                                {
                                    id: '1',
                                    type: 'text',
                                    text: `To log calls, please go to Settings > Google Sheets Config, and either create a new sheet or attach an existing one.`
                                }
                            ]
                        }
                    ],
                    ttl: 60000
                }
            }
        }
        const spreadsheetId = extractSheetId(sheetUrl);
        const sheetResponse = await axios.get(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
            headers: {
                Authorization: authHeader,
            },
        });
        const sheets = sheetResponse.data?.sheets;
        for (const sheet of sheets) {
            if (sheet.properties?.title === predefinedMessageLogSheetName) {
                sheetName = sheet.properties.title;
                break;
            }
        }
        if (sheetName === "") {
            //Handle Cases CallLog Sheet and Contact sheets are already created but message log sheet is not created
            try {
                // First, create the new sheet
                await axios.post(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
                    requests: [{
                        addSheet: {
                            properties: {
                                title: predefinedMessageLogSheetName
                            }
                        }
                    }]
                }, {
                    headers: { Authorization: authHeader, "Content-Type": "application/json" }
                });

                // Then add the headers to the new sheet
                const requestMessageHeaderData = ["ID", "Sheet Id", "Subject", "Contact name", "Message", "Phone", "Message Type", "Message Time", "Direction"];
                const sheetRange = `'${predefinedMessageLogSheetName}'!A1:append`;
                await axios.post(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetRange}?valueInputOption=RAW`, {
                    values: [requestMessageHeaderData]
                }, {
                    headers: { Authorization: authHeader, "Content-Type": "application/json" }
                });
                sheetName = predefinedMessageLogSheetName;
            } catch (e) {
                console.log({ message: "Error creating Message Log Sheet", e });
                return {
                    successful: false,
                    returnMessage: {
                        messageType: 'danger',
                        message: "Error creating Message Log Sheet",
                        ttl: 30000
                    }
                }
            }
        }
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName}`;
        const spreadsheetData = await axios.get(url, {
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json',
            }
        });
        const nextLogRow = spreadsheetData.data?.values?.length === undefined ? 1 : spreadsheetData.data?.values?.length + 1;
        const columnIndexes = await getColumnIndexes(spreadsheetId, sheetName, authHeader);
        const rowData = new Array(Object.keys(columnIndexes).length).fill("");
        const userName = user?.dataValues?.platformAdditionalInfo?.name ?? 'GoogleSheetCRM';
        const messageType = recordingLink ? 'Voicemail' : (faxDocLink ? 'Fax' : 'SMS');
        let logBody = '';
        let title = '';
        switch (messageType) {
            case 'SMS':
                title = `SMS conversation with ${contactInfo.name} - ${moment(message.creationTime).format('YY/MM/DD')}`;
                logBody =
                    '\nConversation summary\n' +
                    `${moment(message.creationTime).format('dddd, MMMM DD, YYYY')}\n` +
                    'Participants\n' +
                    `    ${userName}\n` +
                    `    ${contactInfo.name}\n` +
                    '\nConversation(1 messages)\n' +
                    'BEGIN\n' +
                    '------------\n' +
                    `${message.direction === 'Inbound' ? `${contactInfo.name} (${contactInfo?.phoneNumber})` : userName} ${moment(message.creationTime).format('hh:mm A')}\n` +
                    `${message.subject}\n\n` +
                    '------------\n' +
                    'END\n\n' +
                    '--- Created via RingCentral App Connect';
                break;
            case 'Voicemail':
                const decodedRecordingLink = decodeURIComponent(recordingLink);
                title = `Voicemail left by ${contactInfo.name} - ${moment(message.creationTime).format('YY/MM/DD')}`;
                logBody = `Voicemail recording link: ${decodedRecordingLink} \n\n--- Created via RingCentral App Connect`;
                break;
            case 'Fax':
                title = `Fax document sent from ${contactInfo.name} - ${moment(message.creationTime).format('YY/MM/DD')}`;
                logBody = `Fax document link: ${faxDocLink} \n\n--- Created via RingCentral App Connect`;
                break;
        }

        const requestData = {
            "ID": nextLogRow,
            "Sheet Id": spreadsheetId,
            "Subject": title,
            "Contact name": contactInfo.name,
            "Phone": contactInfo.phoneNumber,
            "Message": logBody,
            "Message Type": messageType,
            "Message Time": moment(message.creationTime).format('YYYY-MM-DD HH:mm:ss'),
            "Direction": message.direction,
        };
        Object.entries(requestData).forEach(([key, value]) => {
            if (columnIndexes[key] !== undefined) {
                rowData[columnIndexes[key]] = value;
            }
        });
        const range = `${sheetName}!A1:append`;
        const createMessageUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=RAW`;
        const response = await axios.post(createMessageUrl, { values: [rowData] }, {
            headers: { 'Authorization': authHeader }
        });
        return {
            logId: nextLogRow,
            successful: true,
            returnMessage: {
                message: 'Message logged',
                messageType: 'success',
                ttl: 1000
            }
        };
    } catch (error) {
        return {
            successful: false,
            returnMessage: {
                messageType: 'danger',
                message: 'Error logging message',
                details: [
                    {
                        title: 'Details',
                        items: [
                            {
                                id: '1',
                                type: 'text',
                                text: `Error logging message`
                            }
                        ]
                    }
                ],
                ttl: 60000
            }
        }
    }
}

async function updateMessageLog({ user, contactInfo, existingMessageLog, message, authHeader, contactNumber }) {
    try {
        const sheetUrl = user?.userSettings?.googleSheetsUrl?.value;
        let sheetName = "";
        if (!sheetUrl) {
            return {
                successful: false,
                returnMessage: {
                    messageType: 'warning',
                    message: 'No sheet selected',
                    details: [
                        {
                            title: 'Details',
                            items: [
                                {
                                    id: '1',
                                    type: 'text',
                                    text: `To log calls, please go to Settings > Google Sheets Config, and either create a new sheet or attach an existing one.`
                                }
                            ]
                        }
                    ],
                    ttl: 5000
                }
            }
        }
        // const splitValues = callLogId.split("space");
        const spreadsheetId = extractSheetId(sheetUrl);
        // const gid = sheetUrl.split('gid=')[1].split(/[#&?]/)[0];
        const sheetResponse = await axios.get(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
            headers: {
                Authorization: authHeader,
            },
        });
        const sheets = sheetResponse.data?.sheets;
        for (const sheet of sheets) {
            if (sheet.properties?.title === predefinedMessageLogSheetName) {
                sheetName = sheet.properties.title;
                break;
            }
        }
        if (sheetName === "") {
            return {
                successful: false,
                returnMessage: {
                    messageType: 'danger',
                    message: "Invalid SheetName",
                    ttl: 30000
                }
            }
        }

        const existingLogId = existingMessageLog.thirdPartyLogId.split('.')[0];
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName}`;
        const response = await axios.get(url, {
            headers: {
                Authorization: authHeader,
            },
        });
        const rows = response.data.values;
        const headers = response.data.values[0]; // First row as headers
        const idColumnIndex = headers.indexOf("ID");
        let rowIndex = -1;
        for (let i = 0; i < rows.length; i++) {
            if (rows[i][idColumnIndex] === existingLogId) { // Assuming column A is index 0
                rowIndex = i;
                break;
            }
        }
        if (rowIndex === -1) {
            return {
                successful: false,
                returnMessage: {
                    messageType: 'danger',
                    message: 'Error while adding message',
                    ttl: 3000
                }
            }
        } else {
            const messageColumnIndex = headers.indexOf("Message");
            if (messageColumnIndex === -1) {
                return {
                    returnMessage: {
                        messageType: 'warning',
                        message: 'Error logging out of GoogleSheet',
                        ttl: 3000
                    }
                }
            }
            const userName = user?.dataValues?.platformAdditionalInfo?.name ?? 'GoogleSheetCRM';
            const messageColumn = String.fromCharCode(65 + messageColumnIndex);
            let logBody = rows[rowIndex][messageColumnIndex];
            let patchBody = {};
            const originalNote = logBody.split('BEGIN\n------------\n')[1];
            const endMarker = '------------\nEND';
            const newMessageLog =
                `${message.direction === 'Inbound' ? `${contactInfo.name} (${contactInfo?.phoneNumber})` : userName} ${moment(message.creationTime).format('hh:mm A')}\n` +
                `${message.subject}\n\n`;
            // Add new message at the end (before the END marker)
            logBody = logBody.replace(endMarker, `${newMessageLog}${endMarker}`);

            const regex = RegExp('Conversation.(.*) messages.');
            const matchResult = regex.exec(logBody);
            logBody = logBody.replace(matchResult[0], `Conversation(${parseInt(matchResult[1]) + 1} messages)`);
            const updateRequestData = [
                {
                    range: `${sheetName}!${messageColumn}${rowIndex + 1}`,// rowIndex is 0-based, so we add 1 for Sheets
                    values: [[logBody]]
                }
            ];
            const response = await axios.post(
                `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
                {
                    valueInputOption: "RAW",
                    data: updateRequestData
                },
                {
                    headers: {
                        "Authorization": authHeader,
                        "Content-Type": "application/json"
                    }
                }
            );
            return {
                successful: true,
                returnMessage: {
                    message: 'Message log updated.',
                    messageType: 'success',
                    ttl: 2000
                }
            };

        }
    } catch (error) {
        console.log({ message: "Error updating message log" });
        return {
            successful: false,
            returnMessage: {
                messageType: 'danger',
                message: 'Error updating message',
                ttl: 60000
            }
        }
    }
}

function extractSheetId(url) {
    const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : "Invalid URL";
}
async function getColumnIndexes(spreadsheetId, sheetName, authHeader) {
    const res = await axios.get(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName}!1:1`,
        { headers: { Authorization: authHeader } }
    );

    const headers = res.data.values[0]; // First row is headers
    return headers.reduce((map, name, index) => {
        map[name] = index; // Map column name to its index
        return map;
    }, {});
}
async function upsertCallDisposition({ user, existingCallLog, authHeader, dispositions }) {
    const existingGoogleSheetLogId = existingCallLog.thirdPartyLogId;
    return {
        logId: existingGoogleSheetLogId
    }
}

exports.getAuthType = getAuthType;
exports.getOauthInfo = getOauthInfo;
exports.getUserInfo = getUserInfo;
exports.unAuthorize = unAuthorize;
exports.findContact = findContact;
exports.createCallLog = createCallLog;
exports.updateCallLog = updateCallLog;
exports.getCallLog = getCallLog;
exports.createContact = createContact;
exports.upsertCallDisposition = upsertCallDisposition;
exports.createMessageLog = createMessageLog;
exports.updateMessageLog = updateMessageLog;