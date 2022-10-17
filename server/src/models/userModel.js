const Sequelize = require('sequelize');
const { sequelize } = require('./sequelize');

// Model for User data
exports.UserModel = sequelize.define('users', {
  id: {
    type: Sequelize.STRING,
    primaryKey: true,
  },
  name:{
    type: Sequelize.STRING,
  },
  companyId:{
    type: Sequelize.STRING,
  },
  companyName:{
    type: Sequelize.STRING,
  },
  companyDomain:{
    type: Sequelize.STRING,
  },
  platform:{
    type: Sequelize.STRING,
  },
  accessToken: {
    type: Sequelize.STRING,
  },
  refreshToken: {
    type: Sequelize.STRING,
  },
  tokenExpiry:{
    type: Sequelize.DATE
  },
  rcUserNumber: {
    type: Sequelize.STRING,
  }
});
