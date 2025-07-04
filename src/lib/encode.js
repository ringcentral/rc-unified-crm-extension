const crypto = require('crypto');

function getCipherKey() {
  if (!process.env.APP_SERVER_SECRET_KEY) {
    throw new Error('APP_SERVER_SECRET_KEY is not defined');
  }
  if (process.env.APP_SERVER_SECRET_KEY.length < 32) {
    // pad secret key with spaces if it is less than 32 bytes
    return process.env.APP_SERVER_SECRET_KEY.padEnd(32, ' ');
  }
  if (process.env.APP_SERVER_SECRET_KEY.length > 32) {
    // truncate secret key if it is more than 32 bytes
    return process.env.APP_SERVER_SECRET_KEY.slice(0, 32);
  }
  return process.env.APP_SERVER_SECRET_KEY;
}

function encode(data) {
  const cipher = crypto.createCipheriv('aes-256-cbc', getCipherKey(), Buffer.alloc(16, 0));
  return cipher.update(data, 'utf8', 'hex') + cipher.final('hex');
}

function decoded(encryptedData) {
  const decipher = crypto.createDecipheriv('aes-256-cbc', getCipherKey(), Buffer.alloc(16, 0));
  return decipher.update(encryptedData, 'hex', 'utf8') + decipher.final('utf8');
}


exports.encode = encode;
exports.decoded = decoded;
