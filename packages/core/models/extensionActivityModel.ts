const Sequelize = require('sequelize');
const { sequelize: rawSequelize } = require('./sequelize');
const sequelize = rawSequelize as any;

// Records that a RingCentral extension has activated the App Connect browser
// extension (completed a RingCentral login) under a RingCentral account.
// Rows are written as a side effect of GET /userInfoHash and aggregated by
// GET /admin/extensionAdoptionStats. This table is additive: no existing table
// is modified, so `initDB()`'s `.sync()` creates it on startup.
//
// The Sequelize default timestamps carry the meaning here: `createdAt` is the
// first recorded login and `updatedAt` the most recent one, because the login
// refresh is the only write this table ever receives.
const ExtensionActivityModel = sequelize.define('extensionActivities', {
  // Same hash rule as UserModel.hashedRcExtensionId so the two tables can be joined
  hashedRcExtensionId: {
    type: Sequelize.STRING,
    primaryKey: true,
  },
  // Plain RingCentral account id, same as UserModel.rcAccountId
  rcAccountId: {
    type: Sequelize.STRING,
    primaryKey: true,
  },
});

export { ExtensionActivityModel };
