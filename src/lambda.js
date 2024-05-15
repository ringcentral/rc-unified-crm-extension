
/**
 * lambda file
 */
const serverlessHTTP = require('serverless-http');
const { server } = require('./index');

exports.app = serverlessHTTP(server);

