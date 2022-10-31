require('dotenv').config();
const moment = require('moment');

async function test() {
    const secs = 81;
    const hours = parseInt(secs / 3600);
    const minutes = parseInt((secs - 3600 * hours) / 60);
    const seconds = parseInt(secs - 3600 * hours - 60 * minutes);
    console.log(hours, '  ', minutes, '  ', seconds);
}

test();