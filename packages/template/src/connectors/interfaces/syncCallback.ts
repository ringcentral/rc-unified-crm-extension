// Optional call-back sync.
// App Connect keeps the call-back list. Export this function from the connector
// only when the CRM should also receive call-back events.
//
// Wire it from the connector entry file:
//   exports.syncCallback = require('./interfaces/syncCallback');
//
// event is created, updated, called, or deleted.
// callback.id is the stable App Connect id. Keep the CRM mapping in the CRM.
// phoneNumber is present only when the current request sent it. Delete and called omit it.
// authHeader is the CRM authorization header prepared by App Connect.

async function syncCallback({ event }) {
    if (event === 'created' || event === 'updated' || event === 'called' || event === 'deleted') {
        return {};
    }
    return {};
}

module.exports = syncCallback;

export {};
