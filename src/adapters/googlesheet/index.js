const axios = require('axios');
const moment = require('moment');
const url = require('url');
function getAuthType() {
    return 'oauth';
}

async function getOauthInfo({ hostname }) {
    console.log({ hostname });
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
    const matchedContactInfo = [];
    const response = await axios.get(
        'https://www.googleapis.com/drive/v3/files',
        {
            headers: {
                'Authorization': `Bearer ${user.accessToken}`,
            },
            params: {
                q: "mimeType='application/vnd.google-apps.spreadsheet'",
                fields: "files(id,name,createdTime)",
                orderBy: "createdTime desc"
            }
        }
    );
    for (const file of response.data.files) {
        matchedContactInfo.push({
            id: file.id,
            name: file.name,
            createdTime: file.createdTime
        });
    }
    console.log({ message: 'Response:', response, Data: response.data, matchedContactInfo });
    matchedContactInfo.push({
        id: 'createNewContact',
        name: 'Create new Sheet',
        additionalInfo: null,
        isNewContact: true
    });
    return {
        matchedContactInfo,
    };
}

async function createCallLog({ user, contactInfo, authHeader, callLog, note, additionalSubmission, aiNote, transcript }) {

    console.log({ user, contactInfo, authHeader, callLog, note, additionalSubmission, aiNote, transcript });
    const spreadsheetId = contactInfo.id;
    const sheetName = 'Sheet1';
    const range = `${sheetName}!A1:append`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=RAW`;

    const headers = {
        'Authorization': `Bearer ${user.accessToken}`,
        'Content-Type': 'application/json',
    };
    const title = callLog.customSubject ?? `${callLog.direction} Call ${callLog.direction === 'Outbound' ? 'to' : 'from'} ${contactInfo.name}`;
    let callStartTime = moment(callLog.startTime).toISOString();
    const callEndTime = (callLog.duration === 'pending') ? moment(callStartTime) : moment(callStartTime).add(callLog.duration, 'seconds');
    const spreadsheetData = await axios.get(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName}`, {
        headers: {
            'Authorization': `Bearer ${user.accessToken}`,
            'Content-Type': 'application/json',
        }
    });
    const nextLogRow = spreadsheetData.data.values.length + 1;
    console.log({ spreadsheetData, nextLogRow });
    const data = {
        values: [
            [spreadsheetId + "space" + nextLogRow, title, contactInfo.phoneNumber, callStartTime, callEndTime, note]
        ],
    };


    try {
        const response = await axios.post(url, data, { headers });
        console.log('Response:', response.data);
        return {
            logId: spreadsheetId + "space" + nextLogRow,
            returnMessage: {
                message: 'Call logged',
                messageType: 'success',
                ttl: 2000
            }
        };
    } catch (error) {
        console.error('Error:', error.response?.data || error.message);
        return {
            returnMessage: {
                messageType: 'danger',
                message: "Error while logging call",
                ttl: 60000
            }
        }
    }
}
async function updateCallLog({ user, existingCallLog, authHeader, recordingLink, subject, note, startTime, duration, result, aiNote, transcript }) {
    //console.log({ user, existingCallLog, authHeader, recordingLink, subject, note, startTime, duration, result, aiNote, transcript });
    const existingLogId = existingCallLog.thirdPartyLogId;
    const splitValues = existingLogId.split("space");
    console.log({ splitValues, a: splitValues[0], b: splitValues[1] });
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${splitValues[0]}/values/Sheet1`;

    const response = await axios.get(url, {
        headers: {
            Authorization: authHeader,
        },
    });

    const rows = response.data.values;
    console.log({ rows });
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
            returnMessage: {
                messageType: 'danger',
                message: 'Call log not updated',
                ttl: 3000
            }
        }
    } else {
        const response = await axios.post(
            `https://sheets.googleapis.com/v4/spreadsheets/${splitValues[0]}/values:batchUpdate`,
            {
                valueInputOption: "RAW",
                data: [
                    {
                        range: `Sheet1!B${rowIndex}`,
                        values: [[subject]]
                    },
                    {
                        range: `Sheet1!F${rowIndex}`,
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
            returnMessage: {
                message: 'Call log updated.',
                messageType: 'success',
                ttl: 2000
            }
        };
    }

}

async function getCallLog({ user, callLogId, authHeader }) {
    console.log({ user, callLogId, authHeader });
    const splitValues = callLogId.split("space");
    console.log({ splitValues, a: splitValues[0], b: splitValues[1] });
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${splitValues[0]}/values/Sheet1`;

    const response = await axios.get(url, {
        headers: {
            Authorization: authHeader,
        },
    });

    const rows = response.data.values;
    console.log({ rows });
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
        const resultResponse = await axios.get(
            `https://sheets.googleapis.com/v4/spreadsheets/${splitValues[0]}/values:batchGet?ranges=Sheet1!B${rowIndex}&ranges=Sheet1!F${rowIndex}`,
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
exports.getAuthType = getAuthType;
exports.getOauthInfo = getOauthInfo;
exports.getUserInfo = getUserInfo;
exports.unAuthorize = unAuthorize;
exports.findContact = findContact;
exports.createCallLog = createCallLog;
exports.updateCallLog = updateCallLog;
exports.getCallLog = getCallLog;