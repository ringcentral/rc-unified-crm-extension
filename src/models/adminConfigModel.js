const Sequelize = require('sequelize');
const { sequelize } = require('./sequelize');

// Model for User data
exports.AdminConfigModel = sequelize.define('adminConfigs', {
  // hashed rc account ID
  id: {
    type: Sequelize.STRING,
    primaryKey: true,
  },
  userSettings:{
    type: Sequelize.JSON
  },
  customAdapter:{
    type: Sequelize.JSON
  }
});
