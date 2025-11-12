
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
    const bullhorn = require('./connectors/bullhorn');
    if (process.env.ENABLE_BULLHORN_REPORT === 'true') {
        logger.info('Start Sending Bullhorn report');
        await bullhorn.sendMonthlyCsvReportByEmail();
        logger.info('Bullhorn report sent successfully');
    } else {
        logger.info('Bullhorn report is not enabled');
    }
    return { statusCode: 200, body: 'ok' };
};

