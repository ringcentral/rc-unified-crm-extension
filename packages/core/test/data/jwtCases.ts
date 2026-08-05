const roundTripPayloadCases = [
  {
    label: 'empty identifiers',
    payload: { id: '', platform: '' },
  },
  {
    label: 'leading and trailing whitespace',
    payload: { id: '  user 42\t', platform: ' test CRM ' },
  },
  {
    label: 'Unicode identifiers',
    payload: { id: '用户-🚀', platform: 'Crème CRM 東京' },
  },
  {
    label: 'URL and punctuation values',
    payload: { id: 'user/a+b?c=d&e=f#fragment', platform: 'crm:custom@v2' },
  },
  {
    label: 'zero false and null values',
    payload: {
      id: 'user-zero-values',
      metadata: { count: 0, enabled: false, optional: null },
    },
  },
  {
    label: 'nested arrays and objects',
    payload: {
      id: 'nested-user',
      roles: ['admin', '', '审核员'],
      settings: {
        channels: [{ type: 'voice', enabled: true }, { type: 'sms', enabled: false }],
      },
    },
  },
  {
    label: 'long identifiers',
    payload: { id: `user-${'x'.repeat(4096)}`, platform: 'long-data-crm' },
  },
];

const invalidTokenInputs = [
  { label: 'empty string', token: '' },
  { label: 'whitespace-only string', token: '   \r\n\t' },
  { label: 'single segment', token: 'header' },
  { label: 'two segments', token: 'header.payload' },
  { label: 'four segments', token: 'a.b.c.d' },
  { label: 'Bearer-prefixed token', token: 'Bearer a.b.c' },
  { label: 'null', token: null },
  { label: 'undefined', token: undefined },
  { label: 'numeric value', token: 12345 },
  { label: 'object value', token: { token: 'a.b.c' } },
  { label: 'array value', token: ['a', 'b', 'c'] },
];

module.exports = {
  roundTripPayloadCases,
  invalidTokenInputs,
};

export {};
