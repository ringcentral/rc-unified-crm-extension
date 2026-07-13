
/**
 * lambda file
 */
const serverlessHTTP = require('serverless-http');
const { app } = require('./app');

exports.app = serverlessHTTP(app);
