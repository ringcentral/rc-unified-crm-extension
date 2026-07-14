const roundTripPayloadCases = [
  { label: 'empty string', payload: '' },
  { label: 'single space', payload: ' ' },
  { label: 'leading and trailing whitespace', payload: '  padded value\t ' },
  { label: 'multiple lines', payload: 'line one\r\nline two\nline three' },
  { label: 'JSON document', payload: JSON.stringify({ enabled: false, count: 0, value: null }) },
  { label: 'URL with reserved characters', payload: 'https://example.com/a path?q=a+b&next=%2Fhome#section' },
  { label: 'accented and CJK text', payload: 'José 客户 東京' },
  { label: 'emoji and surrogate pairs', payload: '📞🌍🚀 👩‍💻' },
  { label: 'combining characters', payload: 'Cafe\u0301 vs Café' },
  { label: 'embedded null byte', payload: 'before\0after' },
  { label: 'punctuation and quotes', payload: '`~!@#$%^&*()_+-=[]{}|;:\'\",.<>/?\\' },
  { label: 'multi-block long value', payload: 'payload-客户-🚀'.repeat(4097) },
];

const secretNormalizationCases = [
  { label: 'one character', secret: 'x', normalized: 'x'.padEnd(32, ' ') },
  { label: '31 characters', secret: 'x'.repeat(31), normalized: `${'x'.repeat(31)} ` },
  { label: 'exactly 32 characters', secret: 'x'.repeat(32), normalized: 'x'.repeat(32) },
  { label: '33 characters', secret: `${'x'.repeat(32)}y`, normalized: 'x'.repeat(32) },
  { label: 'long secret with different suffix', secret: `${'x'.repeat(32)}-ignored-suffix`, normalized: 'x'.repeat(32) },
  { label: 'spaces and punctuation', secret: ' key with spaces & punctuation! ', normalized: ' key with spaces & punctuation! '.padEnd(32, ' ') },
];

const invalidCiphertextCases = [
  { label: 'empty ciphertext', encrypted: '' },
  { label: 'non-hex characters', encrypted: 'not-valid-ciphertext' },
  { label: 'odd-length hex', encrypted: 'abc' },
  { label: 'short block', encrypted: '00'.repeat(15) },
  { label: 'non-string null', encrypted: null },
  { label: 'non-string object', encrypted: { ciphertext: 'abcd' } },
];

module.exports = {
  roundTripPayloadCases,
  secretNormalizationCases,
  invalidCiphertextCases,
};

export {};
