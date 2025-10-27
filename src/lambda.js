
/**
 * lambda file
 */
const serverlessHTTP = require('serverless-http');
const { getServer } = require('./index');

const httpHandler = serverlessHTTP(getServer());

// HTTP-only handler
exports.app = httpHandler;

// Dedicated scheduled handler
exports.bullhornScheduledReport = async () => {
    const bullhorn = require('./connectors/bullhorn');
    if (process.env.ENABLE_BULLHORN_REPORT === 'true') {
        console.log('Start Sending Bullhorn report');
        await bullhorn.sendMonthlyCsvReportByEmail();
        console.log('Bullhorn report sent successfully');
    } else {
        console.log('Bullhorn report is not enabled');
    }
    return { statusCode: 200, body: 'ok' };
};

