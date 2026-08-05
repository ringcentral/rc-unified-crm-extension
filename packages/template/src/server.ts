// main file for local server
require('dotenv').config()

const { app } = require('./app');

const {
  PORT: port,
  APP_HOST: host,
} = process.env;

app.listen(port, host, () => {
  console.log(`-> server running at: http://${host}:${port}`);
});
