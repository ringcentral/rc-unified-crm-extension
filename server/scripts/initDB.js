require('dotenv').config();
const { UserModel } = require('../src/models/userModel');

async function initDB() {
  await UserModel.sync();
}

initDB();
