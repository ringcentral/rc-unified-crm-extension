const jsLookup = require('../../lib/callLogLookup');
const tsLookup = require('../../lib/callLogLookup.ts');

describe('callLogLookup', () => {
  test('keeps TypeScript implementation aligned with compatibility JS entrypoint', () => {
    const incomingData = {
      logInfo: {
        extensionNumber: 101,
        rcExtensionId: 'rc-extension-1',
      },
    };
    const callLogs = [
      { sessionId: 'session-1', extensionNumber: '101', hashedExtensionId: '' },
      { sessionId: 'session-1', extensionNumber: '102', hashedExtensionId: 'hashed-102' },
    ];

    expect(tsLookup.getCallLogExtensionNumber(incomingData))
      .toBe(jsLookup.getCallLogExtensionNumber(incomingData));
    expect(tsLookup.getCallLogHashedExtensionId(incomingData, 'hash-key'))
      .toBe(jsLookup.getCallLogHashedExtensionId(incomingData, 'hash-key'));
    expect(tsLookup.buildCallLogSessionWhere({
      sessionIds: ['session-1', 'session-2'],
      extensionNumber: '101',
      hashedExtensionId: 'hashed-101',
    })).toEqual(jsLookup.buildCallLogSessionWhere({
      sessionIds: ['session-1', 'session-2'],
      extensionNumber: '101',
      hashedExtensionId: 'hashed-101',
    }));
    expect(tsLookup.findMatchingCallLog(callLogs, 'session-1', '101', 'hashed-missing'))
      .toEqual(jsLookup.findMatchingCallLog(callLogs, 'session-1', '101', 'hashed-missing'));
  });

  test('prefers provided hashed extension id before deriving from rc extension id', () => {
    expect(jsLookup.getCallLogHashedExtensionId({
      hashedExtensionId: 'already-hashed',
      rcExtensionId: 'rc-extension-1',
    }, 'hash-key')).toBe('already-hashed');
  });

  test('falls back from hashed identity to legacy extension-number match', () => {
    const callLogs = [
      { sessionId: 'session-1', extensionNumber: '101', hashedExtensionId: '' },
      { sessionId: 'session-1', extensionNumber: '102', hashedExtensionId: 'hashed-102' },
      { sessionId: 'session-2', extensionNumber: '101', hashedExtensionId: 'hashed-101' },
    ];

    expect(jsLookup.findMatchingCallLog(callLogs, 'session-1', '101', 'hashed-missing'))
      .toEqual({ sessionId: 'session-1', extensionNumber: '101', hashedExtensionId: '' });
  });
});
