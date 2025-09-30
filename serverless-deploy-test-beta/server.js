// main file for local server
require('dotenv').config()

const { getServer } = require('./index');

const {
  PORT: port,
  APP_HOST: host,
} = process.env;

getServer().listen(port, host, () => {
  console.log(`-> server running at: http://${host}:${port}`);
});
