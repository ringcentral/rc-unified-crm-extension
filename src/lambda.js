
/**
 * lambda file
 */
const serverlessHTTP = require('serverless-http');
const { getServer } = require('./index');

exports.app = serverlessHTTP(getServer());

