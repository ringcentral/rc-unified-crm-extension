require('dotenv').config();
const { checkAndRefreshAccessToken } = require('./lib/oauth');
const {UserModel} = require('./models/userModel');

async function test(){
    const user = await UserModel.findByPk('15976936');
    await checkAndRefreshAccessToken(user);
}

test();