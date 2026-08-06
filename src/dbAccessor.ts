// @ts-check


const { sequelize } = /** @type {any} */ (require('@app-connect/core/models/sequelize'));
const logger = /** @type {any} */ (require('@app-connect/core/lib/logger'));
// require('dotenv').config();
/**
 * @param {{ dbQuery: string, dateFrom?: string, dateTo?: string, rcAccountId?: string, ratePerMinute?: number, batchSize?: number, mode?: string, jobId?: string }} input
 * @returns {Promise<unknown>}
 */
async function executeQuery(input) {
    const maintenanceCommands = [
        'backfill-ai-create',
        'backfill-ai-worker',
        'backfill-ai-status',
        'backfill-ai-cancel'
    ];
    try {
        logger.info(input.dbQuery);
        if (maintenanceCommands.includes(input.dbQuery)) {
            const backfillCallLogAiNotes = require('./backfillCallLogAiNotes');
            if (input.dbQuery === 'backfill-ai-create') {
                return await backfillCallLogAiNotes.createJob({
                    mode: input.mode,
                    dateFrom: input.dateFrom,
                    dateTo: input.dateTo,
                    rcAccountId: input.rcAccountId,
                    ratePerMinute: input.ratePerMinute,
                    batchSize: input.batchSize
                });
            }
            if (input.dbQuery === 'backfill-ai-worker') {
                return await backfillCallLogAiNotes.runWorker();
            }
            if (input.dbQuery === 'backfill-ai-status') {
                return await backfillCallLogAiNotes.getJobStatus({ jobId: input.jobId });
            }
            return await backfillCallLogAiNotes.cancelJob({ jobId: input.jobId });
        }
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
        if (maintenanceCommands.includes(input.dbQuery)) {
            throw e;
        }
    }
}



exports.app = executeQuery;

export { };
