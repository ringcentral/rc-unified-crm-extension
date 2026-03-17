const { CallLogModel } = require('@app-connect/core/models/callLogModel');
const { MessageLogModel } = require('@app-connect/core/models/messageLogModel');
const { UserModel } = require('@app-connect/core/models/userModel');
const { CacheModel } = require('@app-connect/core/models/cacheModel');
const nock = require('nock');
jest.setTimeout(30000);

beforeAll(async () => {
    // Integration tests rely on `nock` interceptors. If a proxy env var is set (common in
    // corporate environments), axios will route requests through the proxy host and nock
    // won't match the intended CRM hostname mocks. Clear proxy vars and block real network.
    delete process.env.HTTP_PROXY;
    delete process.env.HTTPS_PROXY;
    delete process.env.http_proxy;
    delete process.env.https_proxy;
    process.env.NO_PROXY = '*';
    process.env.no_proxy = '*';

    nock.disableNetConnect();
    // Allow localhost for any in-process servers/supertest usage.
    nock.enableNetConnect(/(127\.0\.0\.1|localhost|::1)/);

    await CallLogModel.sync();
    await MessageLogModel.sync();
    await UserModel.sync();
    await CacheModel.sync();
});

afterAll(() => {
    nock.enableNetConnect();
});
