const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(process.env.DATABASE_URL as any,
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
 

export { sequelize };
