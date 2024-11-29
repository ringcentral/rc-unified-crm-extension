
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

exports.getTimeZone = getTimeZone;
exports.getHashValue = getHashValue;

