// @ts-check


const { sequelize } = /** @type {any} */ (require('@app-connect/core/models/sequelize'));
const logger = /** @type {any} */ (require('@app-connect/core/lib/logger'));
// require('dotenv').config();
/**
 * @param {{ dbQuery: string, dateFrom: string, dateTo: string, rcAccountId: string, ratePerMinute: number }} input
 * @returns {Promise<unknown>}
 */
async function executeQuery(input) {
    try {
        logger.info(input.dbQuery);
        if (input.dbQuery === 'dry-run' || input.dbQuery === 'run') {
            const backfillCallLogAiNotes = require('./backfillCallLogAiNotes');
            return await backfillCallLogAiNotes.app({
                mode: input.dbQuery,
                dateFrom: input.dateFrom,
                dateTo: input.dateTo,
                rcAccountId: input.rcAccountId,
                ratePerMinute: input.ratePerMinute,
            });
        }
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
