const { CallLogModel } = require('../src/models/callLogModel');
const { MessageLogModel } = require('../src/models/messageLogModel');
const { UserModel } = require('../src/models/userModel');
jest.setTimeout(30000);

beforeAll(async () => {
    await CallLogModel.sync();
    await MessageLogModel.sync();
    await UserModel.sync();
});
