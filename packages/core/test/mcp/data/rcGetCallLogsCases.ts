const {
  rcCallLogSimpleCases,
  rcCallLogDetailedCases,
} = require('../../data/callLoggingCases');

const rcCallLogSimpleRecords = rcCallLogSimpleCases.map(({ record }) => record);
const rcCallLogDetailedRecords = rcCallLogDetailedCases.map(({ record }) => record);

const missingRcTokenCases = [
  { label: 'undefined args', args: undefined },
  { label: 'empty args', args: {} },
  { label: 'missing token', args: { jwtToken: 'jwt-token' } },
  { label: 'null token', args: { jwtToken: 'jwt-token', rcAccessToken: null } },
  { label: 'empty token', args: { jwtToken: 'jwt-token', rcAccessToken: '' } },
  { label: 'whitespace token', args: { jwtToken: 'jwt-token', rcAccessToken: ' \r\n\t ' } },
  { label: 'numeric token', args: { jwtToken: 'jwt-token', rcAccessToken: 123 } },
  { label: 'boolean token', args: { jwtToken: 'jwt-token', rcAccessToken: false } },
  { label: 'object token', args: { jwtToken: 'jwt-token', rcAccessToken: { access_token: 'rc-token' } } },
  { label: 'array token', args: { jwtToken: 'jwt-token', rcAccessToken: ['rc-token'] } },
];

const invalidCrmJwtTokenCases = [
  { label: 'missing JWT', jwtToken: undefined },
  { label: 'null JWT', jwtToken: null },
  { label: 'empty JWT', jwtToken: '' },
  { label: 'whitespace JWT', jwtToken: '  \t ' },
  { label: 'numeric JWT', jwtToken: 123 },
  { label: 'boolean JWT', jwtToken: true },
  { label: 'object JWT', jwtToken: { token: 'jwt-token' } },
  { label: 'array JWT', jwtToken: ['jwt-token'] },
];

const invalidTimeFromCases = [
  { label: 'null', value: null },
  { label: 'empty string', value: '' },
  { label: 'whitespace string', value: '   ' },
  { label: 'date without time', value: '2026-04-01' },
  { label: 'time without zone', value: '2026-04-01T00:00:00' },
  { label: 'invalid month', value: '2026-13-01T00:00:00Z' },
  { label: 'invalid calendar day', value: '2026-02-30T00:00:00Z' },
  { label: 'invalid offset', value: '2026-04-01T00:00:00+25:00' },
  { label: 'free text', value: 'yesterday' },
  { label: 'numeric timestamp', value: 0 },
  { label: 'boolean timestamp', value: false },
  { label: 'array timestamp', value: ['2026-04-01T00:00:00Z'] },
  { label: 'object timestamp', value: { iso: '2026-04-01T00:00:00Z' } },
];

const invalidTimeToCases = [
  { label: 'null', value: null },
  { label: 'empty string', value: '' },
  { label: 'whitespace string', value: '\r\n' },
  { label: 'date without time', value: '2026-04-02' },
  { label: 'time without zone', value: '2026-04-02T00:00:00' },
  { label: 'invalid hour', value: '2026-04-02T24:01:00Z' },
  { label: 'invalid calendar day', value: '2025-02-29T00:00:00Z' },
  { label: 'free text', value: 'now' },
  { label: 'numeric timestamp', value: 1700000000000 },
  { label: 'boolean timestamp', value: true },
  { label: 'array timestamp', value: ['2026-04-02T00:00:00Z'] },
  { label: 'object timestamp', value: new Date('2026-04-02T00:00:00Z') },
];

const validTimeRangeCases = [
  {
    label: 'UTC millisecond range',
    timeFrom: '2026-04-01T00:00:00.000Z',
    timeTo: '2026-04-02T00:00:00.000Z',
  },
  {
    label: 'positive-offset range',
    timeFrom: '2026-04-01T08:00:00+08:00',
    timeTo: '2026-04-02T08:00:00+08:00',
  },
  {
    label: 'negative-offset range',
    timeFrom: '2026-03-31T19:00:00-05:00',
    timeTo: '2026-04-01T19:00:00-05:00',
  },
  {
    label: 'leap-day range',
    timeFrom: '2024-02-29T00:00:00Z',
    timeTo: '2024-02-29T23:59:59.999999Z',
  },
  {
    label: 'epoch boundary',
    timeFrom: '1970-01-01T00:00Z',
    timeTo: '1970-01-01T00:00:00Z',
  },
  {
    label: 'equal endpoints',
    timeFrom: '2026-04-01T00:00:00Z',
    timeTo: '2026-04-01T00:00:00Z',
  },
];

const invalidCallLogDecodedJwtCases = [
  { label: 'empty payload', decoded: {} },
  { label: 'missing ID', decoded: { platform: 'clio' } },
  { label: 'null ID', decoded: { id: null } },
  { label: 'empty ID', decoded: { id: '' } },
  { label: 'whitespace ID', decoded: { id: '   ' } },
  { label: 'NaN ID', decoded: { id: Number.NaN } },
  { label: 'infinite ID', decoded: { id: Number.POSITIVE_INFINITY } },
  { label: 'boolean ID', decoded: { id: false } },
  { label: 'object ID', decoded: { id: { value: 'user-1' } } },
  { label: 'array ID', decoded: { id: ['user-1'] } },
];

const validCallLogUserIdCases = [
  { label: 'zero numeric ID', userId: 0 },
  { label: 'positive numeric ID', userId: 9007199254740991 },
  { label: 'Unicode string ID', userId: '用户-١٢٣' },
  { label: 'punctuation string ID', userId: 'user:tenant/42@example.test' },
];

const invalidCallLogResponseCases = [
  { label: 'undefined', response: undefined },
  { label: 'null', response: null },
  { label: 'string', response: 'records' },
  { label: 'number', response: 1 },
  { label: 'array', response: [] },
  { label: 'missing records', response: {} },
  { label: 'null records', response: { records: null } },
  { label: 'object records', response: { records: { id: 'call-1' } } },
  { label: 'primitive record entry', response: { records: ['call-1'] } },
  { label: 'null record entry', response: { records: [null] } },
  { label: 'array record entry', response: { records: [[{ id: 'call-1' }]] } },
];

const validCallLogResponseCases = [
  { label: 'empty collection', records: [] },
  { label: 'single numeric-ID record', records: [{ id: 0, direction: 'Inbound' }] },
  {
    label: 'RingCentral Simple call-log records',
    records: rcCallLogSimpleRecords,
  },
  {
    label: 'RingCentral Detailed call-log records',
    records: rcCallLogDetailedRecords,
  },
  {
    label: 'many unsorted international records',
    records: [
      { id: 'call-z', startTime: '2026-04-02T00:00:00Z', from: { phoneNumber: '+81 (0)3-1234-5678', name: '山田 太郎' } },
      { id: 'call-a', startTime: '2026-04-01T00:00:00Z', to: { phoneNumber: '+44 20 7946 0958', name: 'Zoë Ångström' } },
      { id: 'call-m', startTime: null, from: { extensionNumber: '٠٠١' } },
    ],
  },
];

const callLogRejectionCases = [
  { label: 'null rejection', rejection: null, expected: 'Unknown error occurred' },
  { label: 'undefined rejection', rejection: undefined, expected: 'Unknown error occurred' },
  { label: 'plain object rejection', rejection: { message: 'untrusted' }, expected: 'Unknown error occurred' },
  { label: 'blank string rejection', rejection: '   ', expected: 'Unknown error occurred' },
  { label: 'descriptive string rejection', rejection: 'RC transport offline', expected: 'RC transport offline' },
];

module.exports = {
  missingRcTokenCases,
  invalidCrmJwtTokenCases,
  invalidTimeFromCases,
  invalidTimeToCases,
  validTimeRangeCases,
  invalidCallLogDecodedJwtCases,
  validCallLogUserIdCases,
  invalidCallLogResponseCases,
  validCallLogResponseCases,
  callLogRejectionCases,
};

export {};
