require('dotenv').config();
const { UserModel } = require('../src/models/userModel');
const { CallLogModel } = require('../src/models/callLogModel');
const { MessageLogModel } = require('../src/models/messageLogModel');

async function initDB() {
  await UserModel.sync();
  await CallLogModel.sync();
  await MessageLogModel.sync();
}

initDB();
