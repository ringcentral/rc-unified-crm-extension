
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

exports.getTimeZone = getTimeZone;

