const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(process.env.DATABASE_URL,
  {
    dialect: 'postgres',
    protocol: 'postgres',
    dialectOptions:{
      ssl: {
        rejectUnauthorized: false
      }
    },
    logging: false
  }
);
 

exports.sequelize = sequelize;