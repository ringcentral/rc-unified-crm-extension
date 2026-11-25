// Optional. Called after App Connect deletes a call-back.
// callback is the entry that was removed. thirdPartyId is the CRM id stored from createCallback.
// A delete has no request body, so callback has no phone number.
//
// Wire it from the connector entry file:
//   exports.deleteCallback = require('./interfaces/deleteCallback');

async function deleteCallback({ authHeader, callback, thirdPartyId }) {
    // await axios.delete(`https://api.crm.com/tasks/${thirdPartyId || callback?.id}`, {
    //     headers: { Authorization: authHeader }
    // });
    if (!authHeader || !(thirdPartyId || callback?.id)) {
        return {};
    }
    return {};
}

module.exports = deleteCallback;

export {};
