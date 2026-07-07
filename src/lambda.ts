
// @ts-check

/**
 * lambda file
 */
const serverlessHTTP = /** @type {any} */ (require('serverless-http'));
const { getServer } = /** @type {any} */ (require('./index'));
const logger = /** @type {any} */ (require('../packages/core/lib/logger'));

const httpHandler = serverlessHTTP(getServer());

// HTTP-only handler
exports.app = httpHandler;

// Dedicated scheduled handler
exports.bullhornScheduledReport = async () => {
    const bullhornReport = /** @type {any} */ (require('./connectors/bullhorn/report'));
    if (process.env.ENABLE_BULLHORN_REPORT === 'true') {
        logger.info('Start Sending Bullhorn report');
        //await bullhorn.sendMonthlyCsvReportByEmail();
        await bullhornReport.sendMonthlyCsvReportByEmailWithSalesforceData();
        logger.info('Bullhorn report sent successfully');
    } else {
        logger.info('Bullhorn report is not enabled');
    }
    return { statusCode: 200, body: 'ok' };
};

exports.clearExpiredCache = async () => {
    const { clearExpiredCache } = /** @type {any} */ (require('../packages/core/lib/cacheCleanup'));
    const deletedCount = await clearExpiredCache();
    return {
        statusCode: 200,
        body: JSON.stringify({ deletedCount }),
    };
};

export {};
