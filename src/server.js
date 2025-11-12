// main file for local server
require('dotenv').config()

const { getServer } = require('./index');
const logger = require('@app-connect/core/lib/logger');
const {
  PORT: port,
  APP_HOST: host,
} = process.env;

getServer().listen(port, host, () => {
  logger.info(`-> server running at: http://${host}:${port}`);
});
