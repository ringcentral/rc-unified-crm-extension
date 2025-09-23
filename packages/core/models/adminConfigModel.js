const Sequelize = require('sequelize');
const { sequelize } = require('./sequelize');

// Model for Admin data
exports.AdminConfigModel = sequelize.define('adminConfigs', {
  // hashed rc account ID
  id: {
    type: Sequelize.STRING,
    primaryKey: true,
  },
  userSettings: {
    type: Sequelize.JSON
  },
  customAdapter: {
    type: Sequelize.JSON
  },
  adminAccessToken: {
    type: Sequelize.STRING(512),
  },
  adminRefreshToken: {
    type: Sequelize.STRING(512),
  },
  adminTokenExpiry: {
    type: Sequelize.DATE
  },
    // Array of:
  // {
  //   crmUserId: string,
  //   rcExtensionId: string
  // }
  userMappings: {
    type: Sequelize.JSON
  }
});
