const resourceMetadataCases = [
  {
    label: 'plain HTTPS origin',
    appServer: 'https://app.example.com',
    expectedResource: 'https://app.example.com/.well-known/oauth-protected-resource',
  },
  {
    label: 'origin with port and base path',
    appServer: 'https://app.example.com:8443/app-connect',
    expectedResource: 'https://app.example.com:8443/app-connect/.well-known/oauth-protected-resource',
  },
  {
    label: 'Unicode path',
    appServer: 'https://app.example.com/客户',
    expectedResource: 'https://app.example.com/客户/.well-known/oauth-protected-resource',
  },
  {
    label: 'empty origin',
    appServer: '',
    expectedResource: '/.well-known/oauth-protected-resource',
  },
  {
    label: 'explicit null origin',
    appServer: null,
    expectedResource: 'null/.well-known/oauth-protected-resource',
  },
];

const explicitOAuthErrorFieldCases = [
  { label: 'empty strings', error: '', errorDescription: '' },
  { label: 'spaces', error: ' invalid token ', errorDescription: ' reconnect required ' },
  { label: 'Unicode', error: '授权失败', errorDescription: '请重新连接 🔐' },
  { label: 'commas and equals', error: 'invalid,token=value', errorDescription: 'a=b, c=d' },
  { label: 'tabs', error: 'invalid\ttoken', errorDescription: 'description\twith\ttabs' },
];

const optionalOAuthErrorDetailCases = [
  {
    label: 'empty object',
    errorDetails: {},
    expectedIncluded: true,
  },
  {
    label: 'nested object with falsy values',
    errorDetails: { status: 0, retryable: false, cause: null, message: '' },
    expectedIncluded: true,
  },
  {
    label: 'array details',
    errorDetails: ['first', '第二', 0],
    expectedIncluded: true,
  },
  { label: 'undefined', errorDetails: undefined, expectedIncluded: false },
  { label: 'null', errorDetails: null, expectedIncluded: false },
  { label: 'false', errorDetails: false, expectedIncluded: false },
  { label: 'numeric zero', errorDetails: 0, expectedIncluded: false },
  { label: 'empty string', errorDetails: '', expectedIncluded: false },
];

const structuredOAuthErrorCases = [
  { label: 'empty strings', error: '', message: '' },
  { label: 'whitespace strings', error: '  error  ', message: '\tmessage\n' },
  { label: 'Unicode strings', error: '授权_错误', message: '重新连接 🔐' },
];

module.exports = {
  resourceMetadataCases,
  explicitOAuthErrorFieldCases,
  optionalOAuthErrorDetailCases,
  structuredOAuthErrorCases,
};

export {};
