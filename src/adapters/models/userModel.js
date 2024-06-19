const Sequelize = require('sequelize');
const { sequelize2 } = require('./sequelize');
const {ConfigModel1 } = require('./configModel')

// Model for User data
const UserModel1 = sequelize2.define('users', {
  id: {
    type: Sequelize.STRING,
    primaryKey: true,
  },
  firstname: {
    type: Sequelize.STRING,
  },
  lastname: {
    type: Sequelize.STRING,
  },
  firstname: {
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
  email: {
    type: Sequelize.STRING,
  },
  license_key_id:{
    type:Sequelize.STRING,
    allowNull:true
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
  }
});

// UserModel1.associate = function(models) {
//   UserModel1.belongsTo(models.ConfigModel1, { foreignKey: 'license_key_id' });
// };
// UserModel1.belongsTo(ConfigModel1, { foreignKey: 'license_key_id' }); // Adjust association


exports.UserModel1 = UserModel1;