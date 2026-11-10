// @ts-check


const { sequelize } = /** @type {any} */ (require('@app-connect/core/models/sequelize'));
const logger = /** @type {any} */ (require('@app-connect/core/lib/logger'));
// require('dotenv').config();
/**
 * @param {{ dbQuery: string }} input
 * @returns {Promise<unknown>}
 */
async function executeQuery(input) {
    try {
        logger.info(input.dbQuery);
        const result = await sequelize.query(input.dbQuery);
        logger.info(JSON.stringify(result, null, 2));
        return result;
    }
    catch (e) {
        logger.error(e.message);
    }
}



exports.app = executeQuery;

export { };
