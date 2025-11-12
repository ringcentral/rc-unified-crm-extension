// require('dotenv').config();
const { sequelize } = require('@app-connect/core/models/sequelize');
const logger = require('@app-connect/core/lib/logger');

async function executeQuery(input) {
    try {
        logger.info(input.dbQuery);
        const result = await sequelize.query(input.dbQuery);
        logger.info(JSON.stringify(result, null, 2));
    }
    catch (e) {
        logger.error(e.message);
    }
}

exports.app = executeQuery;