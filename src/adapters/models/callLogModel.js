const Sequelize = require('sequelize');
const { sequelize2 } = require('./sequelize');

// Model for User data
exports.CallLogModel1 = sequelize2.define('callLogs', {
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
  }
});
