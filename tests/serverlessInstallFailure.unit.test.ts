const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { echo, cp } = require('shelljs');

jest.mock('child_process', () => ({ exec: jest.fn() }));
jest.mock('shelljs', () => ({ rm: jest.fn(), cp: jest.fn(), mkdir: jest.fn(), echo: jest.fn() }));

const projectRoot = path.resolve(__dirname, '..');
const originalExitCode = process.exitCode;
const scripts = [
  '../scripts/serverless-build',
  '../scripts/serverless-build-test',
  '../scripts/serverless-build-test-beta',
  '../packages/template/scripts/serverless-build',
];

describe('serverless dependency installation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.exitCode = undefined;
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(fs, 'writeFile').mockImplementation((_file, _data, callback: any) => callback(null));
    for (const directory of ['serverless-deploy-test', 'serverless-deploy-test-beta']) {
      jest.doMock(path.join(projectRoot, directory, 'connectors', 'manifest.json'), () => ({ platforms: {} }), { virtual: true });
    }
  });

  afterEach(() => {
    process.exitCode = originalExitCode;
    jest.restoreAllMocks();
  });

  test.each(scripts)('%s fails the build when npm installation fails', async (script) => {
    exec.mockImplementation((_command, _options, callback) => callback(new Error('registry unavailable'), '', ''));
    jest.isolateModules(() => require(script));
    await new Promise(setImmediate);
    expect(exec).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBe(1);
    expect(echo).not.toHaveBeenCalledWith('build done');
  });

  test.each(scripts)('%s retains successful build completion', async (script) => {
    exec.mockImplementation((_command, _options, callback) => callback(null, 'installed', ''));
    jest.isolateModules(() => require(script));
    await new Promise(setImmediate);
    expect(exec).toHaveBeenCalledTimes(1);
    expect(process.exitCode).not.toBe(1);
    expect(echo).toHaveBeenCalledWith('build done');
  });

  test.each([true, false])('template build supports an application lock existing=%p', async (hasLock) => {
    const existsSync = fs.existsSync.bind(fs);
    jest.spyOn(fs, 'existsSync').mockImplementation((file) => String(file).endsWith('package-lock.json') ? hasLock : existsSync(file));
    exec.mockImplementation((_command, _options, callback) => callback(null, 'installed', ''));
    jest.isolateModules(() => require('../packages/template/scripts/serverless-build'));
    await new Promise(setImmediate);
    const lockCopies = cp.mock.calls.filter(([source]) => String(source).endsWith('package-lock.json'));
    expect(lockCopies).toHaveLength(hasLock ? 1 : 0);
    expect(exec).toHaveBeenCalledTimes(1);
    expect(echo).toHaveBeenCalledWith('build done');
  });
});

export {};
