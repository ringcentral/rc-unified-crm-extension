
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
    const resultString = [hoursString, minutesString, secondsString].filter(Boolean).join(', ');
    return resultString;
}

exports.getTimeZone = getTimeZone;
exports.getHashValue = getHashValue;
exports.secondsToHoursMinutesSeconds = secondsToHoursMinutesSeconds;

