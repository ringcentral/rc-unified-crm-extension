export {};
jest.mock('../../lib/analytics', () => ({ track: jest.fn() }));
const { track } = require('../../lib/analytics');
const { getHashValue } = require('../../lib/util');
const { startPluginExecution, finishPluginExecution, pluginErrorCode } = require('../../lib/pluginAnalytics');

describe('plugin analytics', () => {
  const oldKey = process.env.HASH_KEY;
  beforeEach(() => { jest.clearAllMocks(); process.env.HASH_KEY = 'test-plugin-key'; });
  afterAll(() => { if (oldKey === undefined) delete process.env.HASH_KEY; else process.env.HASH_KEY = oldKey; });

  test('attributes execution to the owner and only includes allowlisted manifest metadata', () => {
    const context = startPluginExecution({
      plugin: { id: 'plugin-1', data: { version: '1.2', jwtToken: 'secret', config: { apiKey: 'secret' }, isAsync: true } },
      user: { rcAccountId: '900', hashedRcExtensionId: getHashValue('101', process.env.HASH_KEY) },
      platform: 'clio', logType: 'call', operation: 'createCallLog',
      analyticsIdentity: { extensionId: 'admin-hash', rcExtensionIdRaw: '202' }, executionId: 'task-1',
    });
    finishPluginExecution(context, 'failure', 'dispatch', 'authorization_failed', context.startedAt + 25);
    expect(track).toHaveBeenLastCalledWith(expect.objectContaining({
      extensionId: getHashValue('101', process.env.HASH_KEY), rcAccountIdRaw: '900',
      extras: expect.objectContaining({ pluginId: 'plugin-1', pluginVersion: '1.2', outcome: 'failure', durationMs: 25,
        $insert_id: 'task-1:Plugin Execution Finished', failureStage: 'dispatch' }),
    }));
    expect(context.identity.rcExtensionIdRaw).toBeUndefined();
    expect(JSON.stringify(track.mock.calls)).not.toContain('secret');
  });

  test('accepts verified raw extension and isolates analytics failures', () => {
    track.mockImplementationOnce(() => { throw new Error('transport failure'); });
    const context = startPluginExecution({ plugin: { id: 'p', data: {} }, user: { rcAccountId: '900', hashedRcExtensionId: getHashValue('101', process.env.HASH_KEY) },
      logType: 'sms', operation: 'createMessageLog', analyticsIdentity: { rcExtensionIdRaw: '101' } });
    expect(context.identity.rcExtensionIdRaw).toBe('101');
    expect(() => finishPluginExecution(context, 'success')).not.toThrow();
  });

  test.each([[401, 'authorization_failed'], [403, 'authorization_failed'], [429, 'rate_limited'], [503, 'provider_unavailable']])('normalizes HTTP %s', (status, code) => {
    expect(pluginErrorCode({ response: { status }, message: 'sensitive provider response' })).toBe(code);
  });
  test('does not attribute an SSCL execution to an admin when the owner identity is unavailable', () => {
    const context = startPluginExecution({ plugin: { id: 'p', data: {} }, user: { rcAccountId: '900' },
      analyticsIdentity: { extensionId: 'admin-hash', userAgent: 'SSCL', rcExtensionIdRaw: '202' } });
    expect(context.identity.extensionId).toBeUndefined();
    expect(context.identity.rcExtensionIdRaw).toBeUndefined();
  });
  test('normalizes timeouts', () => expect(pluginErrorCode({ code: 'ETIMEDOUT' })).toBe('timeout'));
});
