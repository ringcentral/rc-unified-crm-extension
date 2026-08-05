const widgetIdentityRoundTripCases = [
  {
    label: 'numeric-looking IDs',
    rcExtensionId: '0',
    openaiSessionId: '000012345',
  },
  {
    label: 'Unicode IDs',
    rcExtensionId: '分机-客户-🚀',
    openaiSessionId: '会话-東京',
  },
  {
    label: 'reserved URL characters',
    rcExtensionId: 'extension/a+b?c=d&e=f#fragment',
    openaiSessionId: 'session:tenant@example.com',
  },
  {
    label: 'empty optional session ID',
    rcExtensionId: 'rc-ext-empty-session',
    openaiSessionId: '',
  },
  {
    label: 'long IDs',
    rcExtensionId: `rc-${'x'.repeat(2048)}`,
    openaiSessionId: `session-${'y'.repeat(2048)}`,
  },
];

const invalidExtensionIdentityCases = [
  { label: 'undefined', rcExtensionId: undefined },
  { label: 'null', rcExtensionId: null },
  { label: 'empty string', rcExtensionId: '' },
  { label: 'numeric zero', rcExtensionId: 0 },
  { label: 'false', rcExtensionId: false },
];

const nonStringWidgetTokenCases = [
  [undefined],
  [null],
  [123],
  [false],
  [0],
  [{}],
  [[]],
];

const malformedWidgetTokenCases = [
  '',
  ' ',
  '\r\n\t',
  'one-segment',
  'two.segments',
  'four.segment.jwt.parts',
  'Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature',
];

const widgetPayloadCases = [
  [{ type: 'wrong-type', rcExtensionId: 'rc-ext-1', openaiSessionId: 'openai-session-1' }, null],
  [{ type: 'mcp-widget-session', rcExtensionId: '', openaiSessionId: 'openai-session-1' }, null],
  [{ type: 'mcp-widget-session', rcExtensionId: 123, openaiSessionId: 'openai-session-1' }, null],
  [{ type: 'mcp-widget-session', rcExtensionId: 'rc-ext-1', openaiSessionId: 123 }, {
    rcExtensionId: 'rc-ext-1',
    openaiSessionId: null,
  }],
  [{}, null],
  [{ type: null, rcExtensionId: 'rc-ext-1' }, null],
  [{ type: 123, rcExtensionId: 'rc-ext-1' }, null],
  [{ type: 'mcp-widget-session', rcExtensionId: null, openaiSessionId: 'openai-session-1' }, null],
  [{ type: 'mcp-widget-session', rcExtensionId: {}, openaiSessionId: 'openai-session-1' }, null],
  [{ type: 'mcp-widget-session', rcExtensionId: 'rc-ext-1', openaiSessionId: undefined }, {
    rcExtensionId: 'rc-ext-1',
    openaiSessionId: null,
  }],
  [{ type: 'mcp-widget-session', rcExtensionId: 'rc-ext-1', openaiSessionId: null }, {
    rcExtensionId: 'rc-ext-1',
    openaiSessionId: null,
  }],
  [{ type: 'mcp-widget-session', rcExtensionId: 'rc-ext-1', openaiSessionId: '' }, {
    rcExtensionId: 'rc-ext-1',
    openaiSessionId: '',
  }],
  [{ type: 'mcp-widget-session', rcExtensionId: 'rc-ext-1', openaiSessionId: '会话-🚀' }, {
    rcExtensionId: 'rc-ext-1',
    openaiSessionId: '会话-🚀',
  }],
];

module.exports = {
  widgetIdentityRoundTripCases,
  invalidExtensionIdentityCases,
  nonStringWidgetTokenCases,
  malformedWidgetTokenCases,
  widgetPayloadCases,
};

export {};
