// Optional. Called after a call-back is marked called.
// callback.status is "called". previous is the call-back before the change.
// thirdPartyId is the id returned by createCallback, or null when that create did not return one.
// Mark-as-called does not include a phone number.
//
// Wire it from the connector entry file:
//   exports.markCalledCallback = require('./interfaces/markCalledCallback');

async function markCalledCallback({ authHeader, callback, previous, thirdPartyId }) {
    // await axios.patch(`https://api.crm.com/tasks/${thirdPartyId}`, { status: callback?.status }, {
    //     headers: { Authorization: authHeader }
    // });
    if (!authHeader || !callback?.id || !thirdPartyId || !previous) {
        return {};
    }
    return {};
}

module.exports = markCalledCallback;

export {};
