const Sequelize = require('sequelize');
const { sequelize } = require('./sequelize');

// Model for User data
exports.CallLogModel = sequelize.define('callLogs', {
  // callId
  id: {
    type: Sequelize.STRING,
    primaryKey: true,
  },
  sessionId: {
    type: Sequelize.STRING,
    primaryKey: true,
  },
  platform: {
    type: Sequelize.STRING,
  },
  thirdPartyLogId: {
    type: Sequelize.STRING,
  },
  userId: {
    type: Sequelize.STRING,
  },
  contactId: {
    type: Sequelize.STRING,
  }
});
