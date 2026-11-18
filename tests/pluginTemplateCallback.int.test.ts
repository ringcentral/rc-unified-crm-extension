const nock = require('nock');
const request = require('supertest');
const { app } = require('../packages/plugin-template/src/app');
const asyncPlugin = require('../packages/plugin-template/src/plugins/asyncPlugin');
const { generatePluginJwtToken } = require('../packages/plugin-template/src/lib/pluginToken');

const hostedOrigin = 'https://unified-crm-extension.labs.ringcentral.com';
const taskId = 'task-id';
const callbackPath = `/plugin/async-callback/${taskId}`;
const callbackUrl = `${hostedOrigin}${callbackPath}`;
const envKeys = ['APP_CONNECT_CALLBACK_BASE_URL', 'NODE_ENV', 'PLUGIN_SERVER_SECRET_KEY'];
const originalEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));

beforeEach(() => {
    delete process.env.APP_CONNECT_CALLBACK_BASE_URL;
    process.env.NODE_ENV = 'production';
    process.env.PLUGIN_SERVER_SECRET_KEY = 'plugin-template-test-key';
});

afterEach(() => {
    jest.restoreAllMocks();
    nock.cleanAll();
    for (const key of envKeys) {
        if (originalEnv[key] === undefined) delete process.env[key];
        else process.env[key] = originalEnv[key];
    }
});

function dispatch(body) {
    const jwt = generatePluginJwtToken({ rcAccountId: 'test-account' });
    return request(app).post('/plugin/async').set('Authorization', `Bearer ${jwt}`).send(body);
}

describe('plugin template async callback admission', () => {
    let run;

    beforeEach(() => {
        run = jest.spyOn(asyncPlugin, 'run').mockResolvedValue({ accepted: true });
    });

    test('accepts hosted callbacks with the existing request and response contract', async () => {
        const payload = { asyncTaskId: taskId, callbackUrl, data: { logInfo: {} }, config: {} };
        const response = await dispatch(payload);
        expect(response.status).toBe(200);
        expect(response.body).toEqual({ accepted: true, asyncTaskId: taskId });
        expect(run).toHaveBeenCalledWith(expect.objectContaining(payload));
    });

    test('accepts a configured deployment path prefix and constructs the canonical callback', async () => {
        process.env.APP_CONNECT_CALLBACK_BASE_URL = 'https://crm.example.test/staging/';
        const expected = `https://crm.example.test/staging${callbackPath}`;
        const response = await dispatch({
            asyncTaskId: taskId,
            callbackUrl: `https://CRM.example.test:443/staging${callbackPath}`,
        });
        expect(response.status).toBe(200);
        expect(run).toHaveBeenCalledWith(expect.objectContaining({ callbackUrl: expected }));
    });

    test.each([
        `https://other.example.test${callbackPath}`,
        `${hostedOrigin}/plugin/async-callback/another-task`,
        `${callbackUrl}?extra=1`,
    ])('rejects mismatched callbacks before scheduling any work', async (destination) => {
        const response = await dispatch({ asyncTaskId: taskId, callbackUrl: destination });
        expect(response.status).toBe(400);
        expect(response.body.accepted).toBe(false);
        expect(run).not.toHaveBeenCalled();
    });

    test('supports explicitly configured loopback HTTP during local development', async () => {
        process.env.NODE_ENV = 'development';
        process.env.APP_CONNECT_CALLBACK_BASE_URL = 'http://localhost:6066';
        const response = await dispatch({ asyncTaskId: taskId, callbackUrl: `http://localhost:6066${callbackPath}` });
        expect(response.status).toBe(200);
        expect(run).toHaveBeenCalledTimes(1);
    });

    test('rejects an HTTP callback base in production', async () => {
        process.env.APP_CONNECT_CALLBACK_BASE_URL = 'http://localhost:6066';
        const response = await dispatch({ asyncTaskId: taskId, callbackUrl: `http://localhost:6066${callbackPath}` });
        expect(response.status).toBe(500);
        expect(run).not.toHaveBeenCalled();
    });
});

test('callback delivery rejects redirects without contacting the redirect destination', async () => {
    const redirect = nock(hostedOrigin).post(callbackPath, body => body.successful === true)
        .reply(307, '', { location: 'https://other.example.test/receive' });
    const failure = nock(hostedOrigin).post(callbackPath, body => body.successful === false).reply(200);
    const outside = nock('https://other.example.test').post('/receive').reply(200);

    const result = await asyncPlugin.run({ asyncTaskId: taskId, callbackUrl, data: {}, config: {} });
    expect(result.accepted).toBe(false);
    redirect.done();
    failure.done();
    expect(outside.isDone()).toBe(false);
});

export {};
