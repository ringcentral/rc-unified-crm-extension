const { CallLogModel } = require('../src/models/callLogModel');
const { MessageLogModel } = require('../src/models/messageLogModel');
const { UserModel } = require('../src/models/userModel');
const { CacheModel } = require('../src/models/cacheModel');
jest.setTimeout(30000);

beforeAll(async () => {
    await CallLogModel.sync();
    await MessageLogModel.sync();
    await UserModel.sync();
    await CacheModel.sync();
});
