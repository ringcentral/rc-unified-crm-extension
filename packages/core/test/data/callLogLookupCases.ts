const { Op } = require('sequelize');

const extensionNumberCases = [
  {
    label: 'top-level string',
    input: { extensionNumber: '101' },
    expected: '101',
  },
  {
    label: 'top-level numeric extension',
    input: { extensionNumber: 0 },
    expected: '0',
  },
  {
    label: 'formatted extension',
    input: { extensionNumber: '+1 (415) 555-0100 ext. 42' },
    expected: '+1 (415) 555-0100 ext. 42',
  },
  {
    label: 'nested string',
    input: { logInfo: { extensionNumber: '202' } },
    expected: '202',
  },
  {
    label: 'nested numeric extension',
    input: { logInfo: { extensionNumber: 303 } },
    expected: '303',
  },
  {
    label: 'top-level value over nested value',
    input: { extensionNumber: 'top', logInfo: { extensionNumber: 'nested' } },
    expected: 'top',
  },
  {
    label: 'empty top-level value over nested value',
    input: { extensionNumber: '', logInfo: { extensionNumber: 'nested' } },
    expected: '',
  },
  {
    label: 'nested value when top-level value is null',
    input: { extensionNumber: null, logInfo: { extensionNumber: 'nested' } },
    expected: 'nested',
  },
  {
    label: 'missing extension values',
    input: {},
    expected: '',
  },
  {
    label: 'null incoming payload',
    input: null,
    expected: '',
  },
];

const hashedExtensionIdCases = [
  {
    label: 'top-level hash',
    input: { hashedExtensionId: 'hash-top' },
    key: 'variation-test-hash-key',
    expected: 'hash-top',
  },
  {
    label: 'numeric top-level hash',
    input: { hashedExtensionId: 12345 },
    key: 'variation-test-hash-key',
    expected: '12345',
  },
  {
    label: 'nested hash',
    input: { logInfo: { hashedExtensionId: 'hash-nested' } },
    key: 'variation-test-hash-key',
    expected: 'hash-nested',
  },
  {
    label: 'top-level hash over nested hash',
    input: {
      hashedExtensionId: 'hash-top',
      logInfo: { hashedExtensionId: 'hash-nested' },
    },
    key: 'variation-test-hash-key',
    expected: 'hash-top',
  },
  {
    label: 'nested hash when top-level hash is null',
    input: {
      hashedExtensionId: null,
      logInfo: { hashedExtensionId: 'hash-nested' },
    },
    key: 'variation-test-hash-key',
    expected: 'hash-nested',
  },
  {
    label: 'derived top-level RC extension ID',
    input: { rcExtensionId: 'rc-extension-客户-42' },
    key: 'variation-test-hash-key',
    rcExtensionId: 'rc-extension-客户-42',
  },
  {
    label: 'derived nested numeric RC extension ID',
    input: { logInfo: { rcExtensionId: 987654321 } },
    key: 'variation-test-hash-key',
    rcExtensionId: '987654321',
  },
  {
    label: 'empty hash falling through to RC extension ID',
    input: { hashedExtensionId: '', rcExtensionId: 'rc-fallback' },
    key: 'variation-test-hash-key',
    rcExtensionId: 'rc-fallback',
  },
  {
    label: 'missing identity inputs',
    input: {},
    key: 'variation-test-hash-key',
    expected: '',
  },
  {
    label: 'null incoming payload',
    input: null,
    key: 'variation-test-hash-key',
    expected: '',
  },
];

const sessionWhereCases = [
  {
    label: 'single session ID only',
    input: { sessionId: 'session-1' },
    expected: { sessionId: 'session-1' },
  },
  {
    label: 'missing session ID',
    input: {},
    expected: { sessionId: undefined },
  },
  {
    label: 'one session ID in a collection',
    input: { sessionId: 'ignored', sessionIds: ['session-1'] },
    expected: { sessionId: { [Op.in]: ['session-1'] } },
  },
  {
    label: 'multiple session IDs',
    input: { sessionIds: ['session-1', 'session-2', '会话-3'] },
    expected: { sessionId: { [Op.in]: ['session-1', 'session-2', '会话-3'] } },
  },
  {
    label: 'empty session ID collection',
    input: { sessionIds: [] },
    expected: { sessionId: { [Op.in]: [] } },
  },
  {
    label: 'string extension number',
    input: { sessionId: 'session-1', extensionNumber: '00101' },
    expected: { sessionId: 'session-1', extensionNumber: '00101' },
  },
  {
    label: 'numeric zero extension number',
    input: { sessionId: 'session-1', extensionNumber: 0 },
    expected: { sessionId: 'session-1', extensionNumber: '0' },
  },
  {
    label: 'empty extension number',
    input: { sessionId: 'session-1', extensionNumber: '' },
    expected: { sessionId: 'session-1' },
  },
  {
    label: 'null extension number',
    input: { sessionId: 'session-1', extensionNumber: null },
    expected: { sessionId: 'session-1' },
  },
];

const matchingCallLogCases = [
  {
    label: 'exact hash regardless of extension mismatch',
    sessionId: 'session-1',
    extensionNumber: '101',
    hashedExtensionId: 'hash-101',
    expectedId: 'exact-hash',
  },
  {
    label: 'same-session legacy record with matching extension',
    sessionId: 'session-1',
    extensionNumber: '101',
    hashedExtensionId: 'hash-missing',
    expectedId: 'legacy-null-hash',
  },
  {
    label: 'numeric lookup values normalized to strings',
    sessionId: 'session-1',
    extensionNumber: 303,
    hashedExtensionId: 404,
    expectedId: 'numeric-values',
  },
  {
    label: 'extension-only lookup',
    sessionId: 'session-1',
    extensionNumber: '202',
    hashedExtensionId: '',
    expectedId: 'legacy-empty-hash',
  },
  {
    label: 'extension-only lookup with null hash',
    sessionId: 'session-1',
    extensionNumber: '101',
    hashedExtensionId: null,
    expectedId: 'legacy-null-hash',
  },
  {
    label: 'first same-session record when both identity inputs are absent',
    sessionId: 'session-1',
    extensionNumber: undefined,
    hashedExtensionId: undefined,
    expectedId: 'exact-hash',
  },
  {
    label: 'no cross-session match',
    sessionId: 'missing-session',
    extensionNumber: '101',
    hashedExtensionId: 'hash-101',
    expectedId: undefined,
  },
];

module.exports = {
  extensionNumberCases,
  hashedExtensionIdCases,
  sessionWhereCases,
  matchingCallLogCases,
};

export {};
