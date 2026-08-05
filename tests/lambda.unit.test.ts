const originalEnableBullhornReport = process.env.ENABLE_BULLHORN_REPORT;

describe('lambda handlers', () => {
  const loadLambda = () => {
    jest.resetModules();
    jest.doMock('serverless-http', () => jest.fn(() => 'http-handler'));
    jest.doMock('../src/index', () => ({
      getServer: jest.fn(() => 'express-app')
    }));
    jest.doMock('@app-connect/core/lib/logger', () => ({
      info: jest.fn()
    }));
    jest.doMock('../src/connectors/bullhorn/report', () => ({
      sendMonthlyCsvReportByEmailWithSalesforceData: jest.fn().mockResolvedValue(undefined)
    }));
    jest.doMock('@app-connect/core/lib/cacheCleanup', () => ({
      clearExpiredCache: jest.fn().mockResolvedValue(7)
    }));

    return require('../src/lambda');
  };

  afterEach(() => {
    jest.dontMock('serverless-http');
    jest.dontMock('../src/index');
    jest.dontMock('@app-connect/core/lib/logger');
    jest.dontMock('../src/connectors/bullhorn/report');
    jest.dontMock('@app-connect/core/lib/cacheCleanup');
    if (originalEnableBullhornReport === undefined) {
      delete process.env.ENABLE_BULLHORN_REPORT;
    } else {
      process.env.ENABLE_BULLHORN_REPORT = originalEnableBullhornReport;
    }
  });

  test('exports the serverless HTTP handler from the Express app', () => {
    const lambda = loadLambda();
    const serverlessHTTP = require('serverless-http');
    const { getServer } = require('../src/index');

    expect(getServer).toHaveBeenCalled();
    expect(serverlessHTTP).toHaveBeenCalledWith('express-app');
    expect(lambda.app).toBe('http-handler');
  });

  test('runs Bullhorn scheduled report only when enabled', async () => {
    process.env.ENABLE_BULLHORN_REPORT = 'true';
    const lambda = loadLambda();
    const bullhornReport = require('../src/connectors/bullhorn/report');

    await expect(lambda.bullhornScheduledReport()).resolves.toEqual({
      statusCode: 200,
      body: 'ok'
    });
    expect(bullhornReport.sendMonthlyCsvReportByEmailWithSalesforceData).toHaveBeenCalledTimes(1);
  });

  test('skips Bullhorn scheduled report when disabled', async () => {
    process.env.ENABLE_BULLHORN_REPORT = 'false';
    const lambda = loadLambda();
    const bullhornReport = require('../src/connectors/bullhorn/report');

    await expect(lambda.bullhornScheduledReport()).resolves.toEqual({
      statusCode: 200,
      body: 'ok'
    });
    expect(bullhornReport.sendMonthlyCsvReportByEmailWithSalesforceData).not.toHaveBeenCalled();
  });

  test('clears expired cache and returns deleted count', async () => {
    const lambda = loadLambda();

    await expect(lambda.clearExpiredCache()).resolves.toEqual({
      statusCode: 200,
      body: JSON.stringify({ deletedCount: 7 })
    });
  });
});

export {};
