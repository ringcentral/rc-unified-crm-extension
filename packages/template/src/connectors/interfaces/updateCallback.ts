// Optional. Called after a call-back edit that does not mark it called.
// Marking a call-back called uses markCalledCallback.
// thirdPartyId is the id returned by createCallback, or null when that create did not return one.
// phoneNumber is present only when the current request sent it.
//
// Wire it from the connector entry file:
//   exports.updateCallback = require('./interfaces/updateCallback');

async function updateCallback({ authHeader, callback, previous, thirdPartyId }) {
    // await axios.patch(`https://api.crm.com/tasks/${thirdPartyId}`, callback, {
    //     headers: { Authorization: authHeader }
    // });
    if (!authHeader || !callback?.id || !thirdPartyId || !previous) {
        return {};
    }
    return {};
}

module.exports = updateCallback;

export {};
