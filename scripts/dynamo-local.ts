// @ts-check

const path = require('path');
const fs = require('fs');
const DynamoDbLocal = /** @type {any} */ (require('dynamodb-local'));

const dynamoLocalPort = 8000

const scriptRoot = path.resolve(__dirname, '..');
const projectPath = path.basename(scriptRoot) === '.ts-build' ? path.resolve(scriptRoot, '..') : scriptRoot;
const dbPath = path.resolve(projectPath, '.dynamodb');

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

export {};
