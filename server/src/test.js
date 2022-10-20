require('dotenv').config();
const moment = require('moment');

async function test(){
    console.log(moment(new Date()).format('YYYY-MM-DD hh:mm:ss'));
}

test();