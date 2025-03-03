const path = require('path');
const fs = require('fs');
const DynamoDbLocal = require('dynamodb-local');

const dynamoLocalPort = 8000

const dbPath = path.resolve(__dirname, '../.dynamodb');

if (!fs.existsSync(dbPath)){
  fs.mkdirSync(dbPath);
}

async function init() {
  console.log('Starting dynamodb server, please wait, do not quit');
  await DynamoDbLocal.launch(
    dynamoLocalPort, dbPath, ['-sharedDb'], false, false
  );
  console.log('local dynamodb started at port:', dynamoLocalPort);
}

init();
