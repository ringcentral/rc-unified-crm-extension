const { LOG_DETAILS_FORMAT_TYPE } = require('@app-connect/core/lib/constants');
// CHOOSE: plaint text, html, markdown
function getLogFormatType() {
    return LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT;
}

module.exports = getLogFormatType;