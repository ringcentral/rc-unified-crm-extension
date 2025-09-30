const Sequelize = require('sequelize');
const { sequelize } = require('./sequelize');

// Model for User data
exports.UserModel = sequelize.define('users', {
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
  userSettings: {
    type: Sequelize.JSON
  }
});
