const jsLookup = require('../../lib/callLogLookup');
const tsLookup = require('../../lib/callLogLookup.ts');
const { Op } = require('sequelize');
const {
  extensionNumberCases,
  hashedExtensionIdCases,
  sessionWhereCases,
  matchingCallLogCases,
} = require('../data/callLogLookupCases');

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

  describe('getCallLogExtensionNumber input precedence', () => {
    test.each<[any]>(extensionNumberCases as [any][])('normalizes $label', ({ input, expected }) => {
      expect(jsLookup.getCallLogExtensionNumber(input)).toBe(expected);
    });
  });

  describe('getCallLogHashedExtensionId input precedence', () => {
    test.each<[any]>(hashedExtensionIdCases as [any][])('normalizes $label', ({ input, key, expected, rcExtensionId }) => {
      const result = jsLookup.getCallLogHashedExtensionId(input, key);

      if (rcExtensionId) {
        expect(result).toBe(require('../../lib/util').getHashValue(rcExtensionId, key));
      } else {
        expect(result).toBe(expected);
      }
    });

    test('does not derive an RC extension hash when no hash key is configured', () => {
      const originalHashKey = process.env.HASH_KEY;
      delete process.env.HASH_KEY;

      try {
        expect(jsLookup.getCallLogHashedExtensionId({
          rcExtensionId: 'rc-without-key',
        })).toBe('');
      } finally {
        if (originalHashKey === undefined) {
          delete process.env.HASH_KEY;
        } else {
          process.env.HASH_KEY = originalHashKey;
        }
      }
    });
  });

  describe('buildCallLogSessionWhere identity combinations', () => {
    test.each<[any]>(sessionWhereCases as [any][])('builds the base query for $label', ({ input, expected }) => {
      expect(jsLookup.buildCallLogSessionWhere(input)).toEqual(expected);
    });

    test('builds exact and empty-legacy alternatives for a hash-only lookup', () => {
      expect(jsLookup.buildCallLogSessionWhere({
        sessionId: 'session-1',
        hashedExtensionId: 'hash-101',
      })).toEqual({
        sessionId: 'session-1',
        [Op.or]: [
          { hashedExtensionId: 'hash-101' },
          {
            extensionNumber: '',
            [Op.or]: [
              { hashedExtensionId: '' },
              { hashedExtensionId: null },
            ],
          },
        ],
      });
    });

    test('adds extension-specific and empty legacy alternatives for a complete identity', () => {
      expect(jsLookup.buildCallLogSessionWhere({
        sessionIds: ['session-1', 'session-2'],
        extensionNumber: 101,
        hashedExtensionId: 987,
      })).toEqual({
        sessionId: { [Op.in]: ['session-1', 'session-2'] },
        [Op.or]: [
          { hashedExtensionId: '987' },
          {
            extensionNumber: '101',
            [Op.or]: [
              { hashedExtensionId: '' },
              { hashedExtensionId: null },
            ],
          },
          {
            extensionNumber: '',
            [Op.or]: [
              { hashedExtensionId: '' },
              { hashedExtensionId: null },
            ],
          },
        ],
      });
    });
  });

  describe('findMatchingCallLog practical persisted-data combinations', () => {
    const callLogs = [
      { id: 'other-session', sessionId: 'session-2', extensionNumber: '101', hashedExtensionId: 'hash-101' },
      { id: 'exact-hash', sessionId: 'session-1', extensionNumber: '999', hashedExtensionId: 'hash-101' },
      { id: 'legacy-null-hash', sessionId: 'session-1', extensionNumber: '101', hashedExtensionId: null },
      { id: 'legacy-empty-hash', sessionId: 'session-1', extensionNumber: '202', hashedExtensionId: '' },
      { id: 'numeric-values', sessionId: 'session-1', extensionNumber: 303, hashedExtensionId: 404 },
      { id: 'empty-identity', sessionId: 'session-1', extensionNumber: '', hashedExtensionId: '' },
    ];

    test.each<[any]>(matchingCallLogCases as [any][])('selects $label', ({ sessionId, extensionNumber, hashedExtensionId, expectedId }) => {
      const result = jsLookup.findMatchingCallLog(
        callLogs,
        sessionId,
        extensionNumber,
        hashedExtensionId,
      );

      expect(result?.id).toBe(expectedId);
    });

    test('uses an empty-extension legacy record as the final hashed-identity fallback', () => {
      const legacyOnlyLogs = [
        { id: 'empty', sessionId: 'session-1', extensionNumber: '', hashedExtensionId: '' },
        { id: 'first-usable', sessionId: 'session-1', extensionNumber: '501', hashedExtensionId: null },
        { id: 'second-usable', sessionId: 'session-1', extensionNumber: '502', hashedExtensionId: '' },
      ];

      expect(jsLookup.findMatchingCallLog(
        legacyOnlyLogs,
        'session-1',
        'not-present',
        'hash-not-present',
      )?.id).toBe('empty');
    });

    test('returns undefined when a hashed lookup has no exact or empty-extension legacy record', () => {
      const logsWithoutFallback = [
        { sessionId: 'session-1', extensionNumber: '100', hashedExtensionId: '' },
        { sessionId: 'session-1', extensionNumber: '101', hashedExtensionId: 'different-hash' },
      ];

      expect(jsLookup.findMatchingCallLog(
        logsWithoutFallback,
        'session-1',
        'not-present',
        'hash-not-present',
      )).toBeUndefined();
    });
  });
});

export {};
