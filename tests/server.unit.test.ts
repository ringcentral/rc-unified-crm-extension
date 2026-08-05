describe('local server entrypoint', () => {
  const originalPort = process.env.PORT;
  const originalHost = process.env.APP_HOST;

  afterEach(() => {
    jest.resetModules();
    jest.dontMock('../src/index');
    jest.dontMock('@app-connect/core/lib/logger');
    if (originalPort === undefined) {
      delete process.env.PORT;
    } else {
      process.env.PORT = originalPort;
    }
    if (originalHost === undefined) {
      delete process.env.APP_HOST;
    } else {
      process.env.APP_HOST = originalHost;
    }
  });

  test('starts the local server with configured host and port', () => {
    process.env.PORT = '6066';
    process.env.APP_HOST = '127.0.0.1';
    const listen = jest.fn((port, host, callback) => callback());

    jest.doMock('../src/index', () => ({
      getServer: jest.fn(() => ({ listen }))
    }));
    jest.doMock('@app-connect/core/lib/logger', () => ({
      info: jest.fn()
    }));

    require('../src/server');

    const logger = require('@app-connect/core/lib/logger');
    expect(listen).toHaveBeenCalledWith('6066', '127.0.0.1', expect.any(Function));
    expect(logger.info).toHaveBeenCalledWith('-> server running at: http://127.0.0.1:6066');
  });
});

export {};
