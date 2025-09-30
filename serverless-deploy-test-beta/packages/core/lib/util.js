
const tzlookup = require('tz-lookup');
const { State } = require('country-state-city');
const crypto = require('crypto');

function getTimeZone(countryCode, stateCode) {
    const state = State.getStateByCodeAndCountry(stateCode, countryCode);
    if (!state) {
        return 'Unknown timezone';
    }
    const timezone = tzlookup(state.latitude, state.longitude);
    return timezone;
}


function getHashValue(string, secretKey) {
    return crypto.createHash('sha256').update(
        `${string}:${secretKey}`
    ).digest('hex');
}

function secondsToHoursMinutesSeconds(seconds) {
    // If not a number, return the input directly
    if (isNaN(seconds)) {
        return seconds;
    }
    const hours = Math.floor(seconds / 3600);
    const hoursString = hours > 0 ? `${hours} ${hours > 1 ? 'hours' : 'hour'}` : '';
    const minutes = Math.floor((seconds % 3600) / 60);
    const minutesString = minutes > 0 ? `${minutes} ${minutes > 1 ? 'minutes' : 'minute'}` : '';
    const remainingSeconds = seconds % 60;
    const secondsString = remainingSeconds > 0 ? `${remainingSeconds} ${remainingSeconds > 1 ? 'seconds' : 'second'}` : '';
    if (!hoursString && !minutesString && !secondsString) {
        return '0 seconds';
    }
    const resultString = [hoursString, minutesString, secondsString].filter(Boolean).join(', ');
    return resultString;
}

function getMostRecentDate({ allDateValues }) {
    var result = 0;
    for (const date of allDateValues) {
        if(!date)
        {
            continue;
        }
        if (date > result) {
            result = date;
        }
    }
    return result;
}

// media reader link: https://ringcentral.github.io/ringcentral-media-reader/?media=https://media.ringcentral.com/restapi/v1.0/account/{accountId}/extension/{extensionId}/message-store/{messageId}/content/{contentId}
// platform media link: https://media.ringcentral.com/restapi/v1.0/account/{accountId}/extension/{extensionId}/message-store/{messageId}/content/{contentId}
function getMediaReaderLinkByPlatformMediaLink(platformMediaLink){
    if(!platformMediaLink){
        return null;
    }
    const encodedPlatformMediaLink = encodeURIComponent(platformMediaLink);
    return `https://ringcentral.github.io/ringcentral-media-reader/?media=${encodedPlatformMediaLink}`;
}

exports.getTimeZone = getTimeZone;
exports.getHashValue = getHashValue;
exports.secondsToHoursMinutesSeconds = secondsToHoursMinutesSeconds;
exports.getMostRecentDate = getMostRecentDate;
exports.getMediaReaderLinkByPlatformMediaLink = getMediaReaderLinkByPlatformMediaLink;
