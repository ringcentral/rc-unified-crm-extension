const axios = require('axios');
const moment = require('moment');
const url = require('url');
const { parsePhoneNumber } = require('awesome-phonenumber');
function getAuthType() {
    return 'oauth';
}

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
        const contactSheetUrl = user?.userSettings?.googleSheetContactSearchUrlId?.value;
        let sheetName = "";
        const phoneNumberObj = parsePhoneNumber(phoneNumber.replace(' ', '+'));
        const phoneNumberE164 = phoneNumberObj.number.e164;
        if (!!!contactSheetUrl) {
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
                                    text: `To log calls, please go to Settings > Google Sheets options and add Google Sheet under Contacts Google Sheets URL.`
                                }
                            ]
                        }
                    ],
                    ttl: 5000
                }
            }
        }
        const spreadsheetId = extractSheetId(contactSheetUrl);
        const gid = contactSheetUrl.split('gid=')[1].split(/[#&?]/)[0];
        const sheetResponse = await axios.get(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
            headers: {
                Authorization: authHeader,
            },
        });
        const sheets = sheetResponse.data?.sheets;
        for (const sheet of sheets) {
            if (sheet.properties?.sheetId === parseInt(gid)) {
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
        const results = data.slice(0).filter(row => row[2] === phoneNumberE164);
        for (const row of results) {
            matchedContactInfo.push({
                id: row[0],
                name: row[1],
                phoneNumber: row[2]
            });

        }
        matchedContactInfo.push({
            id: 'createNewContact',
            name: 'Create new Contact',
            additionalInfo: null,
            isNewContact: true
        });
        return {
            matchedContactInfo,
        };
    }
    catch (e) {
        console.log({ e });
    }

}
async function createContact({ user, authHeader, phoneNumber, newContactName, newContactType }) {
    const contactSheetUrl = user?.userSettings?.googleSheetContactSearchUrlId?.value;
    let sheetName = "";
    const phoneNumberObj = parsePhoneNumber(phoneNumber.replace(' ', '+'));
    const phoneNumberE164 = phoneNumberObj.number.e164;
    if (!!!contactSheetUrl) {
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
                                text: `To log calls, please go to Settings > Google Sheets options and add Google Sheet under Contacts Google Sheets URL.`
                            }
                        ]
                    }
                ],
                ttl: 5000
            }
        }
    }
    const spreadsheetId = extractSheetId(contactSheetUrl);
    const gid = contactSheetUrl.split('gid=')[1].split(/[#&?]/)[0];
    const sheetResponse = await axios.get(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
        headers: {
            Authorization: authHeader,
        },
    });
    const sheets = sheetResponse.data?.sheets;
    for (const sheet of sheets) {
        if (sheet.properties?.sheetId === parseInt(gid)) {
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
    let contactId = spreadsheetId + nextLogRow;
    const data = {
        values: [
            [contactId, newContactName, phoneNumberE164]
        ],
    };
    const response = await axios.post(url, data, { headers });
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
        const sheetUrl = user?.userSettings?.googleSheetCallLogUrlId?.value;
        //  const sheetName = user?.userSettings?.googleSheetNameId?.value;
        let sheetName = "";
        if (!!!sheetUrl) {
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
                                    text: `To log calls, please go to Settings > Google Sheets options and add Google Sheet to log calls to.`
                                }
                            ]
                        }
                    ],
                    ttl: 5000
                }
            }
        }
        const spreadsheetId = extractSheetId(sheetUrl);
        const gid = sheetUrl.split('gid=')[1].split(/[#&?]/)[0];
        const sheetResponse = await axios.get(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
            headers: {
                Authorization: authHeader,
            },
        });
        const sheets = sheetResponse.data?.sheets;
        for (const sheet of sheets) {
            if (sheet.properties?.sheetId === parseInt(gid)) {
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
            "SheetId": spreadsheetId,
            "Subject": title,
            "ContactName": contactInfo.name,
            "Note": note,
            "Phone": contactInfo.phoneNumber,
            "CallCreation Time": callStartTime,
            "CallEnd Time": callEndTime,
            "Call Duration (Second)": callLog.duration,
            "SessionId": callLog.sessionId,
            "CallDirection": callLog.direction
        };
        Object.entries(requestData).forEach(([key, value]) => {
            if (columnIndexes[key] !== undefined) {
                rowData[columnIndexes[key]] = value;
            }
        });

        const response = await axios.post(url, { values: [rowData] }, { headers });
        const logId = `${spreadsheetId}/edit?gid=${gid}`;
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
                                text: `An error occurred while logging the call, or no sheet has been selected. Please provide a valid sheet URL under Settings > Google Sheets Options.`
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
    const sheetUrl = user?.userSettings?.googleSheetCallLogUrlId?.value;
    let sheetName = "";
    try {
        if (!!!sheetUrl) {
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
                                    text: `To Edit log calls, please go to Settings > Google Sheets options and add Google Sheet to log calls to.`
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
        const gid = sheetUrl.split('gid=')[1].split(/[#&?]/)[0];
        const sheetResponse = await axios.get(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
            headers: {
                Authorization: authHeader,
            },
        });
        const sheets = sheetResponse.data?.sheets;
        for (const sheet of sheets) {
            if (sheet.properties?.sheetId === parseInt(gid)) {
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
        // // Find the record where Name matches searchKey
        // const header = rows[0];
        // const nameIndex = header.indexOf("ID");
        // const record = rows.find(row => row[nameIndex] === callLogId);
        let rowIndex = -1;
        for (let i = 0; i < rows.length; i++) {
            if (rows[i][0] === existingLogId) { // Assuming column A is index 0
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
            const headerResponse = await axios.get(
                `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName}!1:1`,
                { headers: { Authorization: authHeader } }
            );

            const headers = headerResponse.data.values[0]; // First row as headers
            const columnCIndex = headers.indexOf("Subject");
            const columnDIndex = headers.indexOf("Note");

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
            const response = await axios.post(
                `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
                {
                    valueInputOption: "RAW",
                    data: [
                        {
                            range: `${sheetName}!${subjectColumn}${rowIndex}`,
                            values: [[subject]]
                        },
                        {
                            range: `${sheetName}!${noteColumn}${rowIndex}`,
                            values: [[note]]
                        }
                    ]
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
                                text: `An error occurred while updating the call log, or no sheet has been selected. Please provide a valid sheet URL under Settings > Google Sheets Options.`
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
    const sheetUrl = user?.userSettings?.googleSheetCallLogUrlId?.value;
    //const sheetName = user?.userSettings?.googleSheetNameId?.value;
    let sheetName = "";
    if (!!!sheetUrl) {
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
                                text: `To Edit log calls, please go to Settings > Google Sheets options and add Google Sheet to log calls to.`
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
    const gid = sheetUrl.split('gid=')[1].split(/[#&?]/)[0];
    const sheetResponse = await axios.get(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
        headers: {
            Authorization: authHeader,
        },
    });
    const sheets = sheetResponse.data?.sheets;
    for (const sheet of sheets) {
        if (sheet.properties?.sheetId === parseInt(gid)) {
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
    // // Find the record where Name matches searchKey
    // const header = rows[0];
    // const nameIndex = header.indexOf("ID");
    // const record = rows.find(row => row[nameIndex] === callLogId);
    let rowIndex = -1;
    for (let i = 0; i < rows.length; i++) {
        if (rows[i][0] === callLogId) { // Assuming column A is index 0
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
        const headerResponse = await axios.get(
            `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName}!1:1`,
            { headers: { Authorization: authHeader } }
        );

        const headers = headerResponse.data.values[0]; // First row as headers
        const columnCIndex = headers.indexOf("Subject");
        const columnDIndex = headers.indexOf("Note");

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

exports.getAuthType = getAuthType;
exports.getOauthInfo = getOauthInfo;
exports.getUserInfo = getUserInfo;
exports.unAuthorize = unAuthorize;
exports.findContact = findContact;
exports.createCallLog = createCallLog;
exports.updateCallLog = updateCallLog;
exports.getCallLog = getCallLog;
exports.createContact = createContact;