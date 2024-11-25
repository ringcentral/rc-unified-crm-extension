async function getUserSettings({ user}){
    return user.userSettings;
}

async function updateUserSettings({ user, userSettings}){
    user.userSettings = userSettings;
    await user.save();
}

exports.getUserSettings = getUserSettings;
exports.updateUserSettings = updateUserSettings;