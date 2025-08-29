
/**
 * lambda file
 */
const serverlessHTTP = require('serverless-http');
const { getServer } = require('./index');

exports.app = serverlessHTTP(getServer());

// Scheduled Lambda for monthly Bullhorn report
exports.bullhornMonthlyReport = async () => {
    const bullhorn = require('./adapters/bullhorn');
    if (process.env.ENABLE_BULLHORN_REPORT === 'true') {
        await bullhorn.sendMonthlyCsvReportByEmail();
    }
    return { statusCode: 200, body: 'ok' };
};

