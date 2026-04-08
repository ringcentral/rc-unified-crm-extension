require('dotenv').config();

const { app } = require('./app');

const {
  PORT: port = 6066,
  APP_HOST: host = '127.0.0.1'
} = process.env;

app.listen(port, host, () => {
  console.log(`-> plugin template server running at: http://${host}:${port}`);
});
