async function createNewSheet({ user, data }) {
    // check if sheet exists, if so, directly return name and url
    console.log(data)
    let isSheetExist = data?.name;
    let sheetName = '';
    let sheetUrl = '';
    // if not, create a new sheet
    if (isSheetExist) {
        // Reason: This file might not following our format, so need to change it to comply with our format
        // TODO: if not following format, update it to comply with our format
        sheetName = data.name;
        sheetUrl = data.url;
    }
    else {
        const newFixedSheetName = 'RingCentral App Connect Sheet';
        // TODO: create new sheet on Google
        const sheetCreationResponse = {
            name: 'New Sheet Name', // replace with actual sheet name
            url: 'https://example.com/sheet-url' // replace with actual sheet URL
        };
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

exports.createNewSheet = createNewSheet;
exports.removeSheet = removeSheet;