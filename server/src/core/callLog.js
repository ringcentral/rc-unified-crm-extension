const platformModule = require(`../platformModules/${process.env.PLATFORM}`);

async function addCallLog(userId, incomingData){
    await platformModule.addCallLog(userId, incomingData);
}

exports.addCallLog = addCallLog;