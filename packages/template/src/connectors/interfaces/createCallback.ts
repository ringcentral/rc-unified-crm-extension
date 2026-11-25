// Optional. App Connect keeps the call-back list and calls this before the local row is saved.
// Connectors that do not export it only get the App Connect entry.
// Export this from the connector only when scheduling a call-back should also create a CRM record.
//
// Wire it from the connector entry file:
//   exports.createCallback = require('./interfaces/createCallback');
//
// callback.id is the App Connect id. Return thirdPartyId so later update and delete calls can find the CRM record.
// phoneNumber is present only when the current request sent it.
// authHeader is the CRM authorization header prepared by App Connect.

async function createCallback({ authHeader, callback }) {
    // const response = await axios.post('https://api.crm.com/tasks', callback, {
    //     headers: { Authorization: authHeader }
    // });
    if (!authHeader || !callback?.id) {
        return {};
    }
    return {
        thirdPartyId: 'crm-callback-id'
    };
}

module.exports = createCallback;

export {};
