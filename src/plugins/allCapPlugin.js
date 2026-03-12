function allCap({ user, data }) {
    const ignoredLatters = user.userSettings['plugin_rc_labs-all_caps-EUS5gvEh'].value.config.ignoreLetters.value;
    let note = '';
    for (const letter of data.note) {
        if (ignoredLatters.includes(letter)) {
            note += letter;
        } else {
            note += letter.toUpperCase();
        }
    }
    data.note = note;
    return data;
}

exports.allCap = allCap;