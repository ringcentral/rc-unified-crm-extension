// @ts-check


const { sequelize } = /** @type {any} */ (require('@app-connect/core/models/sequelize'));
const logger = /** @type {any} */ (require('@app-connect/core/lib/logger'));
const backfillCallLogAiNotes = require('./backfillCallLogAiNotes');
// require('dotenv').config();
/**
 * @param {{ dbQuery: string, dateFrom: string, dateTo: string, rcAccountId: string }} input
 * @returns {Promise<void>}
 */
async function executeQuery(input) {
    try {
        logger.info(input.dbQuery);
        if (input.dbQuery === 'dry-run') {
            await backfillCallLogAiNotes.app({
                dateFrom: input.dateFrom,
                dateTo: input.dateTo,
                rcAccountId: input.rcAccountId,
            });
        }
        const result = await sequelize.query(input.dbQuery);
        logger.info(JSON.stringify(result, null, 2));
    }
    catch (e) {
        logger.error(e.message);
    }
}



exports.app = executeQuery;

export { };
