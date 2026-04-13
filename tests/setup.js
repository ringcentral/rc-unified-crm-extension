const { CallLogModel } = require('@app-connect/core/models/callLogModel');
const { MessageLogModel } = require('@app-connect/core/models/messageLogModel');
const { UserModel } = require('@app-connect/core/models/userModel');
const { CacheModel } = require('@app-connect/core/models/cacheModel');
const axios = require('axios');

// Keep HTTP client behavior deterministic in tests by disabling env-level proxies.
process.env.HTTP_PROXY = '';
process.env.HTTPS_PROXY = '';
process.env.http_proxy = '';
process.env.https_proxy = '';
process.env.NO_PROXY = '*';
process.env.no_proxy = '*';
axios.defaults.proxy = false;
axios.defaults.transport = undefined;
axios.defaults.httpsAgent = undefined;
axios.defaults.httpAgent = undefined;

jest.setTimeout(30000);

beforeAll(async () => {
    await CallLogModel.sync();
    await MessageLogModel.sync();
    await UserModel.sync();
    await CacheModel.sync();
});
