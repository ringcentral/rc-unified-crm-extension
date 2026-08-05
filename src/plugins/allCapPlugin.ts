// @ts-check

/**
 * @param {{ user: any, data: any }} params
 * @returns {any}
 */
function allCap({ user, data }) {
    const ignoredLetters = user.userSettings['plugin_ringcentral_labs-app_caps-yKI8e20W'].value.config.ignoredLetters.value;
    let note = '';
    for (const letter of data.note) {
        if (ignoredLetters.includes(letter)) {
            note += letter;
        } else {
            note += letter.toUpperCase();
        }
    }
    data.note = note;
    return data;
}

exports.allCap = allCap;

export {};
