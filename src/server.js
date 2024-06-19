// main file for local server
require('dotenv').config()

const { server } = require('./index');

const {
  PORT: port,
  APP_HOST: host,
} = process.env;

server.listen(port, host, () => {
  console.log(`-> server running at: http://${host}:${port}`);
});
