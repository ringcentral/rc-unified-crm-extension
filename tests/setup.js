const { CallLogModel } = require('@app-connect/core/models/callLogModel');
const { MessageLogModel } = require('@app-connect/core/models/messageLogModel');
const { UserModel } = require('@app-connect/core/models/userModel');
const { CacheModel } = require('@app-connect/core/models/cacheModel');
jest.setTimeout(30000);

beforeAll(async () => {
    await CallLogModel.sync();
    await MessageLogModel.sync();
    await UserModel.sync();
    await CacheModel.sync();
});
