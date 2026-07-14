const invalidSessionArgumentCases = [
  { label: 'null', args: null },
  { label: 'string', args: 'session' },
  { label: 'number', args: 1 },
  { label: 'boolean', args: false },
  { label: 'array', args: [] },
  { label: 'date object', args: new Date('2026-01-01T00:00:00Z') },
];

const invalidSessionFieldTypeCases = [
  { label: 'numeric openaiSessionId', field: 'openaiSessionId', value: 0 },
  { label: 'boolean openaiSessionId', field: 'openaiSessionId', value: false },
  { label: 'object openaiSessionId', field: 'openaiSessionId', value: {} },
  { label: 'array openaiSessionId', field: 'openaiSessionId', value: ['session-1'] },
  { label: 'numeric rcExtensionId', field: 'rcExtensionId', value: 0 },
  { label: 'boolean rcExtensionId', field: 'rcExtensionId', value: true },
  { label: 'object rcExtensionId', field: 'rcExtensionId', value: { id: '101' } },
  { label: 'array rcExtensionId', field: 'rcExtensionId', value: ['101'] },
  { label: 'numeric jwtToken', field: 'jwtToken', value: 123 },
  { label: 'boolean jwtToken', field: 'jwtToken', value: false },
  { label: 'object jwtToken', field: 'jwtToken', value: { token: 'jwt' } },
  { label: 'array jwtToken', field: 'jwtToken', value: ['jwt'] },
  { label: 'numeric rcAccessToken', field: 'rcAccessToken', value: 123 },
  { label: 'boolean rcAccessToken', field: 'rcAccessToken', value: true },
  { label: 'object rcAccessToken', field: 'rcAccessToken', value: { access_token: 'rc-token' } },
  { label: 'array rcAccessToken', field: 'rcAccessToken', value: ['rc-token'] },
];

const blankOptionalSessionFieldCases = [
  { label: 'empty strings', value: '' },
  { label: 'spaces', value: '   ' },
  { label: 'tabs and newlines', value: '\t\r\n' },
  { label: 'explicit nulls', value: null },
];

const invalidDecodedSessionJwtCases = [
  { label: 'undefined decoded payload', decoded: undefined },
  { label: 'null decoded payload', decoded: null },
  { label: 'string decoded payload', decoded: 'user-1' },
  { label: 'array decoded payload', decoded: [{ id: 'user-1' }] },
  { label: 'empty decoded payload', decoded: {} },
  { label: 'null ID', decoded: { id: null, platform: 'clio' } },
  { label: 'empty ID', decoded: { id: '', platform: 'clio' } },
  { label: 'whitespace ID', decoded: { id: '  ', platform: 'clio' } },
  { label: 'numeric ID', decoded: { id: 101, platform: 'clio' } },
  { label: 'object ID', decoded: { id: { value: 'user-1' }, platform: 'clio' } },
];

const opaqueUserIdCases = [
  { label: 'numeric-looking ID', userId: '000101' },
  { label: 'Unicode ID', userId: '用户-١٢٣' },
  { label: 'punctuation ID', userId: 'crm:user/42@example.test' },
  { label: 'padded opaque ID', userId: '  user-with-padding  ' },
];

const malformedStoredUserCases = [
  { label: 'undefined user', user: undefined },
  { label: 'null user', user: null },
  { label: 'string user', user: 'user' },
  { label: 'array user', user: [{ accessToken: 'token' }] },
  { label: 'empty user', user: {} },
  { label: 'null token', user: { accessToken: null } },
  { label: 'empty token', user: { accessToken: '' } },
  { label: 'whitespace token', user: { accessToken: '  ' } },
  { label: 'numeric token', user: { accessToken: 123 } },
  { label: 'object token', user: { accessToken: { token: 'crm-token' } } },
];

const platformSelectionCases = [
  {
    label: 'decoded platform',
    decoded: { id: 'user-1', platform: 'decoded-platform' },
    user: { accessToken: 'token', platform: 'stored-platform', hostname: 'tenant.example.com' },
    expectedPlatform: 'decoded-platform',
    expectedHostname: 'tenant.example.com',
  },
  {
    label: 'stored platform fallback',
    decoded: { id: 'user-1' },
    user: { accessToken: 'token', platform: 'stored-platform', hostname: 'tenant.example.com' },
    expectedPlatform: 'stored-platform',
    expectedHostname: 'tenant.example.com',
  },
  {
    label: 'invalid decoded platform fallback',
    decoded: { id: 'user-1', platform: { name: 'bad' } },
    user: { accessToken: 'token', platform: 'stored-platform', hostname: '' },
    expectedPlatform: 'stored-platform',
    expectedHostname: null,
  },
  {
    label: 'no usable platform',
    decoded: { id: 'user-1', platform: '  ' },
    user: { accessToken: 'token', platform: false, hostname: 123 },
    expectedPlatform: null,
    expectedHostname: null,
  },
];

const incompleteRcCredentialCases = [
  { label: 'extension ID only', args: { rcExtensionId: '101' }, expectedId: '101' },
  { label: 'RC token only', args: { rcAccessToken: 'rc-token' }, expectedId: null },
];

const invalidExtensionResponseCases = [
  { label: 'undefined response', response: undefined },
  { label: 'null response', response: null },
  { label: 'string response', response: 'Demo Extension' },
  { label: 'array response', response: [{ name: 'Demo Extension' }] },
  { label: 'numeric response', response: 101 },
];

const extensionNameCases = [
  { label: 'missing name', extensionInfo: {}, expectedName: null },
  { label: 'null name', extensionInfo: { name: null }, expectedName: null },
  { label: 'empty name', extensionInfo: { name: '' }, expectedName: null },
  { label: 'whitespace name', extensionInfo: { name: '  ' }, expectedName: null },
  { label: 'numeric name', extensionInfo: { name: 101 }, expectedName: null },
  { label: 'Unicode name', extensionInfo: { name: '李雷 – Zoë' }, expectedName: '李雷 – Zoë' },
];

const userLookupRejectionCases = [
  { label: 'null rejection', rejection: null, expected: 'Unknown error occurred' },
  { label: 'undefined rejection', rejection: undefined, expected: 'Unknown error occurred' },
  { label: 'plain object rejection', rejection: { message: 'untrusted' }, expected: 'Unknown error occurred' },
  { label: 'blank string rejection', rejection: '   ', expected: 'Unknown error occurred' },
  { label: 'descriptive string rejection', rejection: 'database offline', expected: 'database offline' },
];

module.exports = {
  invalidSessionArgumentCases,
  invalidSessionFieldTypeCases,
  blankOptionalSessionFieldCases,
  invalidDecodedSessionJwtCases,
  opaqueUserIdCases,
  malformedStoredUserCases,
  platformSelectionCases,
  incompleteRcCredentialCases,
  invalidExtensionResponseCases,
  extensionNameCases,
  userLookupRejectionCases,
};

export {};
