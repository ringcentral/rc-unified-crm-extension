// @ts-check

// main file for local server
require('dotenv').config()

const { getServer } = /** @type {any} */ (require('./index'));
const logger = /** @type {any} */ (require('@app-connect/core/lib/logger'));
const {
  PORT: port,
  APP_HOST: host,
} = process.env;

getServer().listen(port, host, () => {
  logger.info(`-> server running at: http://${host}:${port}`);
});

export {};
