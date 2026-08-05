const Sequelize = require('sequelize');
const { sequelize: rawSequelize } = require('./sequelize');
const sequelize = rawSequelize as any;

// Model for User data
const UserModel = sequelize.define('users', {
  // id = {crmName}-{crmUserId}
  id: {
    type: Sequelize.STRING,
    primaryKey: true,
  },
  rcAccountId: {
    type: Sequelize.STRING,
  },
  hostname: {
    type: Sequelize.STRING,
  },
  timezoneName: {
    type: Sequelize.STRING,
  },
  timezoneOffset: {
    type: Sequelize.STRING,
  },
  platform: {
    type: Sequelize.STRING,
  },
  // in apiKey auth, accessToken will be API key
  accessToken: {
    type: Sequelize.STRING(2000),
  },
  refreshToken: {
    type: Sequelize.STRING(2000),
  },
  tokenExpiry: {
    type: Sequelize.DATE
  },
  platformAdditionalInfo: {
    type: Sequelize.JSON
  },
  hashedRcExtensionId: {
    type: Sequelize.STRING,
  },
  userSettings: {
    type: Sequelize.JSON
  }
});

export { UserModel };
