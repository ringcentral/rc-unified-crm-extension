const { sign, verify } = require('jsonwebtoken');
const logger = require('./logger');

function generateJwt(data) {
  return sign(data, process.env.APP_SERVER_SECRET_KEY, { expiresIn: '120y' })
}

function decodeJwt(token) {
  try {
    return verify(token, process.env.APP_SERVER_SECRET_KEY);
  } catch (e) {
    logger.error('Error decoding JWT', { stack: e.stack });
    return null;
  }
}

exports.generateJwt = generateJwt;
exports.decodeJwt = decodeJwt;
