const { google } = require('googleapis');
const axios = require('axios');
const newFixedSheetName = 'RingCentral App Connect Sheet';
async function createNewSheet({ user, data }) {
    // check if sheet exists, if so, directly return name and url
    console.log(data)
    //  let isSheetExist = data?.name;
    const spreadsheets = await listSpreadsheets(user.accessToken);
    //await createSpreadsheetWithHeaders(user.accessToken);

    let sheetName = '';
    let sheetUrl = ''
    let isExist = false;

    for (const sheet of spreadsheets) {
        if (sheet.name === newFixedSheetName) {
            sheetName = newFixedSheetName;
            sheetUrl = sheet.webViewLink;
            isExist = true;
        }
    }
    // if not, create a new sheet
    if (isExist === false) {

        const sheetCreationResponse = await createSpreadsheetWithHeaders(user.accessToken);
        console.log({ sheetCreationResponse });
        sheetName = sheetCreationResponse.name;
        sheetUrl = sheetCreationResponse.url;
    }
    // assign new sheet value to user settings
    const updatedUserSettings = user.userSettings;
    updatedUserSettings.googleSheetsName = {
        value: sheetName
    };
    updatedUserSettings.googleSheetsUrl = {
        value: sheetUrl
    };
    // eslint-disable-next-line no-param-reassign
    user.userSettings = {};
    // eslint-disable-next-line no-param-reassign
    user.userSettings = updatedUserSettings;
    await user.save();
    return {
        successful: true,
        sheetName,
        sheetUrl
    }
}

async function removeSheet({ user }) {
    const updatedUserSettings = user.userSettings;
    updatedUserSettings.googleSheetsName = {
        value: ''
    };
    updatedUserSettings.googleSheetsUrl = {
        value: ''
    };
}

async function listSpreadsheets(accessToken) {
    try {
        const response = await axios.get(
            "https://www.googleapis.com/drive/v3/files",
            {
                headers: { Authorization: `Bearer  ${accessToken}` },
                params: {
                    q: "mimeType='application/vnd.google-apps.spreadsheet'",
                    fields: "files(id, name,webViewLink)",
                },
            }
        );

        return response.data.files || [];
    } catch (error) {
        console.error("Error listing spreadsheets:", error.response?.data || error);
        return [];
    }
}

async function createSpreadsheetWithHeaders(accessToken) {

    try {
        const response = await axios.post(
            "https://sheets.googleapis.com/v4/spreadsheets",
            {
                properties: { title: newFixedSheetName },
                sheets: [
                    { properties: { title: "Call Log" } },
                    { properties: { title: "Contacts" } },
                ],
            },
            { headers: { Authorization: `Bearer  ${accessToken}` } }
        );


        let range = `Call Log!A1:append`;
        const requestCallLogHeaderData = ["ID", "SheetId", "Subject", "ContactName", "Note", "Phone", "CallCreation Time", "CallEnd Time", "Call Duration (Second)", "SessionId", "CallDirection"];

        const requestContactHeaderData = ["ID", "SheetId", "ContactName", "PhoneNumber"];
        await axios.post(`https://sheets.googleapis.com/v4/spreadsheets/${response.data.spreadsheetId}/values/${range}?valueInputOption=RAW`, { values: [requestCallLogHeaderData] }, {
            headers: { Authorization: `Bearer  ${accessToken}`, "Content-Type": "application/json" }
        });
        range = `Contacts!A1:append`;
        await axios.post(`https://sheets.googleapis.com/v4/spreadsheets/${response.data.spreadsheetId}/values/${range}?valueInputOption=RAW`, { values: [requestContactHeaderData] }, {
            headers: { Authorization: `Bearer  ${accessToken}`, "Content-Type": "application/json" }
        });
        return {
            spreadsheetId: response.data.spreadsheetId,
            name: response.data.properties.title,
            url: response.data.spreadsheetUrl
        };
    } catch (e) {
        console.log({ e });
    }
}

exports.createNewSheet = createNewSheet;
exports.removeSheet = removeSheet;