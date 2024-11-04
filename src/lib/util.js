
const tzlookup = require('tz-lookup');
const { State } = require('country-state-city');
const moment = require('moment-timezone');

function getTimeZone(countryCode, stateCode) {
    const state = State.getStateByCodeAndCountry(stateCode, countryCode);
    if (!state) {
        return 'Unknown timezone';
    }
    const timezone = tzlookup(state.latitude, state.longitude);
    return timezone;
}

function secondsToTime(seconds) {
    let result = '';
    if (seconds > 3600) {
        result += Math.floor(seconds / 3600) + 'h ';
        seconds %= 3600;
    }
    if (seconds > 60) {
        result += Math.floor(seconds / 60) + 'm ';
        seconds %= 60;
    }
    if (seconds > 0) {
        result += seconds + 's';
    }
    return result;
}

exports.getTimeZone = getTimeZone;
exports.secondsToTime = secondsToTime;

