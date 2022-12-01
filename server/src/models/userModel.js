const Sequelize = require('sequelize');
const { sequelize } = require('./sequelize');

// Model for User data
exports.UserModel = sequelize.define('users', {
  id: {
    type: Sequelize.STRING,
    primaryKey: true,
  },
  name: {
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
    type: Sequelize.STRING(500),
  },
  refreshToken: {
    type: Sequelize.STRING,
  },
  tokenExpiry: {
    type: Sequelize.DATE
  },
  rcUserNumber: {
    type: Sequelize.STRING,
  },
  platformAdditionalInfo: {
    type: Sequelize.JSON
  }
});
