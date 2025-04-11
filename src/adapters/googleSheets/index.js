const axios = require('axios');
const moment = require('moment');
const url = require('url');
const { parsePhoneNumber } = require('awesome-phonenumber');
function getAuthType() {
    return 'oauth';
}
const predefinedContactSheetName = "Contacts";
const predefinedCallLogSheetName = "Call Logs";

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
            id: data.sub,
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

async function findContact({ user, authHeader, phoneNumber, overridingFormat }) {
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
        const subject = result[0].values[0][0];
        const note = result[1].values[0][0];
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