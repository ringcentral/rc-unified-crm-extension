const { Sequelize } = require('sequelize');

const sequelize2 = new Sequelize('ringcentraldev', 'root', 'root@1234', {
  host: 'localhost',
  dialect: 'mysql',
  dialectOptions:  {
    ssl: {
      rejectUnauthorized: false
    }
  },
  logging: false
}
);
 

exports.sequelize2 = sequelize2;