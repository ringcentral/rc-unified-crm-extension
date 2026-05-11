
/**
 * lambda file
 */
const serverlessHTTP = require('serverless-http');
const { getServer } = require('./index');
const logger = require('@app-connect/core/lib/logger');

const httpHandler = serverlessHTTP(getServer());

// HTTP-only handler
exports.app = httpHandler;

// Dedicated scheduled handler
exports.bullhornScheduledReport = async () => {
    const bullhornReport = require('./connectors/bullhorn/report');  
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
    const { clearExpiredCache } = require('@app-connect/core/lib/cacheCleanup');
    const deletedCount = await clearExpiredCache();
    return {
        statusCode: 200,
        body: JSON.stringify({ deletedCount }),
    };
};
