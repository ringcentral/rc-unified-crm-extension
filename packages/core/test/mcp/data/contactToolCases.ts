const invalidContactAuthTokenCases = [
  { label: 'undefined token', jwtToken: undefined },
  { label: 'null token', jwtToken: null },
  { label: 'empty token', jwtToken: '' },
  { label: 'whitespace token', jwtToken: ' \r\n\t ' },
  { label: 'numeric token', jwtToken: 123 },
  { label: 'object token', jwtToken: { token: 'jwt' } },
];

const invalidContactPhoneNumberCases = [
  { label: 'missing phone', phoneNumber: undefined, expected: 'Phone number is required' },
  { label: 'null phone', phoneNumber: null, expected: 'Phone number is required' },
  { label: 'empty phone', phoneNumber: '', expected: 'Phone number is required' },
  { label: 'whitespace phone', phoneNumber: ' \t ', expected: 'Phone number is required' },
  { label: 'numeric phone', phoneNumber: 14155550100, expected: 'Phone number must be a string' },
  { label: 'boolean phone', phoneNumber: false, expected: 'Phone number must be a string' },
  { label: 'object phone', phoneNumber: { value: '+14155550100' }, expected: 'Phone number must be a string' },
  { label: 'array phone', phoneNumber: ['+14155550100'], expected: 'Phone number must be a string' },
];

const invalidContactDecodedJwtCases = [
  { label: 'empty payload', decoded: {}, expected: 'Invalid JWT token: userId not found' },
  { label: 'null user ID', decoded: { id: null, platform: 'testCRM' }, expected: 'Invalid JWT token: userId not found' },
  { label: 'empty user ID', decoded: { id: '', platform: 'testCRM' }, expected: 'Invalid JWT token: userId not found' },
  { label: 'whitespace user ID', decoded: { id: '  ', platform: 'testCRM' }, expected: 'Invalid JWT token: userId not found' },
  { label: 'padded user ID', decoded: { id: ' user-1 ', platform: 'testCRM' }, expected: 'Invalid JWT token: userId not found' },
  { label: 'numeric user ID', decoded: { id: 42, platform: 'testCRM' }, expected: 'Invalid JWT token: userId not found' },
  { label: 'boolean user ID', decoded: { id: true, platform: 'testCRM' }, expected: 'Invalid JWT token: userId not found' },
  { label: 'object user ID', decoded: { id: { value: 'user-1' }, platform: 'testCRM' }, expected: 'Invalid JWT token: userId not found' },
  { label: 'array user ID', decoded: { id: ['user-1'], platform: 'testCRM' }, expected: 'Invalid JWT token: userId not found' },
  { label: 'missing platform', decoded: { id: 'user-1' }, expected: 'Invalid JWT token: platform not found' },
  { label: 'null platform', decoded: { id: 'user-1', platform: null }, expected: 'Invalid JWT token: platform not found' },
  { label: 'empty platform', decoded: { id: 'user-1', platform: '' }, expected: 'Invalid JWT token: platform not found' },
  { label: 'whitespace platform', decoded: { id: 'user-1', platform: '  ' }, expected: 'Invalid JWT token: platform not found' },
  { label: 'numeric platform', decoded: { id: 'user-1', platform: 42 }, expected: 'Invalid JWT token: platform not found' },
  { label: 'padded platform', decoded: { id: 'user-1', platform: ' testCRM ' }, expected: 'Invalid JWT token: platform not found' },
  { label: 'boolean platform', decoded: { id: 'user-1', platform: false }, expected: 'Invalid JWT token: platform not found' },
  { label: 'object platform', decoded: { id: 'user-1', platform: { name: 'testCRM' } }, expected: 'Invalid JWT token: platform not found' },
  { label: 'array platform', decoded: { id: 'user-1', platform: ['testCRM'] }, expected: 'Invalid JWT token: platform not found' },
  { label: 'string payload', decoded: 'payload', expected: 'Invalid JWT token' },
  { label: 'numeric payload', decoded: 42, expected: 'Invalid JWT token' },
  { label: 'boolean payload', decoded: true, expected: 'Invalid JWT token' },
  { label: 'array payload', decoded: [], expected: 'Invalid JWT token' },
];

const normalizedAdapterRejectionCases = [
  { label: 'null rejection', rejection: null, expected: 'Unknown error occurred' },
  { label: 'undefined rejection', rejection: undefined, expected: 'Unknown error occurred' },
  { label: 'plain object rejection', rejection: { message: 'untrusted shape' }, expected: 'Unknown error occurred' },
  { label: 'blank string rejection', rejection: '   ', expected: 'Unknown error occurred' },
  { label: 'descriptive string rejection', rejection: 'CRM adapter is offline', expected: 'CRM adapter is offline' },
];

const invalidAdapterResponseCases = [
  { label: 'undefined', result: undefined },
  { label: 'null', result: null },
  { label: 'string', result: 'success' },
  { label: 'number', result: 1 },
  { label: 'array', result: [] },
];

const successfulContactPayloadCases = [
  { label: 'object contact', contact: { id: 'contact-1', name: 'José 客户', active: false, score: 0 } },
  { label: 'multiple contacts', contact: [{ id: 'contact-1' }, { id: 'contact-2' }] },
  { label: 'empty contact array', contact: [] },
  { label: 'null contact', contact: null },
  { label: 'numeric contact identifier', contact: 0 },
];

const contactSearchFailureCases = [
  {
    label: 'explicit message',
    searchResult: { successful: false, returnMessage: { message: '联系人未找到' } },
    expected: '联系人未找到',
  },
  {
    label: 'empty message',
    searchResult: { successful: false, returnMessage: { message: '' } },
    expected: 'Contact not found',
  },
  {
    label: 'null return message',
    searchResult: { successful: false, returnMessage: null },
    expected: 'Contact not found',
  },
  {
    label: 'missing return message',
    searchResult: { successful: false },
    expected: 'Contact not found',
  },
  {
    label: 'truthy non-boolean success flag',
    searchResult: { successful: 'true', contact: { id: 'must-not-be-success' } },
    expected: 'Contact not found',
  },
  {
    label: 'numeric success flag',
    searchResult: { successful: 1, contact: { id: 'must-not-be-success' } },
    expected: 'Contact not found',
  },
];

module.exports = {
  invalidContactAuthTokenCases,
  invalidContactPhoneNumberCases,
  invalidContactDecodedJwtCases,
  normalizedAdapterRejectionCases,
  invalidAdapterResponseCases,
  successfulContactPayloadCases,
  contactSearchFailureCases,
};

export {};
