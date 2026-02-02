function allCap({ data }) {
    if (data?.note) {
        // change all letters to capital
        // eslint-disable-next-line no-param-reassign
        data.note = data.note.toUpperCase();
    }
    return data;
}

exports.allCap = allCap;