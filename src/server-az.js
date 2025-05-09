// main file for local server, specific for Azure deployment
require('dotenv').config()

const { server } = require('./index');
const port = process.env.PORT || 8080; // Use Azure-provided PORT or default

server().listen(port, () => {
  console.log(`-> server running at port: ${port}`);
});