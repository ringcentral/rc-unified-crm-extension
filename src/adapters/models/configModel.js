const Sequelize = require('sequelize');
const { sequelize2 } = require('./sequelize');

// Model for User data
const ConfigModel1 = sequelize2.define('config', {
  id: {
    type: Sequelize.STRING,
    primaryKey: true,
  },
  license_key_id: {
    type: Sequelize.STRING,
  },
  license_key_type: {
    type: Sequelize.STRING,
  },
  max_allowed_users:{
    type:Sequelize.BIGINT
  }
});
// ConfigModel1.associate = function(models) {
//   ConfigModel1.hasMany(models.UserModel1, { foreignKey: 'license_key_id' });
// };

exports.ConfigModel1 = ConfigModel1
