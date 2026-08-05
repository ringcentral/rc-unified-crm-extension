const Sequelize = require('sequelize');
const { sequelize: rawSequelize } = require('./sequelize');
const sequelize = rawSequelize as any;

// Model for User data
const CallLogModel = sequelize.define('callLogs', {
  // callId
  id: {
    type: Sequelize.STRING,
    primaryKey: true,
  },
  sessionId: {
    type: Sequelize.STRING,
    primaryKey: true,
  },
  extensionNumber: {
    type: Sequelize.STRING,
    primaryKey: true,
    allowNull: false,
    defaultValue: '',
  },
  hashedExtensionId: {
    type: Sequelize.STRING,
    primaryKey: true,
    allowNull: false,
    defaultValue: '',
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

export { CallLogModel };
