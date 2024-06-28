// require('dotenv').config();
const { sequelize } = require('./models/sequelize');

async function executeQuery(input) {
    try {
        console.log(input.dbQuery);
        const result = await sequelize.query(input.dbQuery);
        console.log(JSON.stringify(result, null, 2));
    }
    catch (e) {
        console.error(e.message);
    }
}

exports.app = executeQuery;