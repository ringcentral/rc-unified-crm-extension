const invalidManifestStructureCases = [
  { label: 'undefined manifest', connectorManifest: undefined, error: 'connectorManifest is required' },
  { label: 'null manifest', connectorManifest: null, error: 'connectorManifest is required' },
  { label: 'false manifest', connectorManifest: false, error: 'connectorManifest is required' },
  { label: 'numeric zero manifest', connectorManifest: 0, error: 'connectorManifest is required' },
  { label: 'empty string manifest', connectorManifest: '', error: 'connectorManifest is required' },
  { label: 'missing platforms', connectorManifest: {}, error: 'connectorManifest.platforms is required' },
  { label: 'undefined platforms', connectorManifest: { platforms: undefined }, error: 'connectorManifest.platforms is required' },
  { label: 'null platforms', connectorManifest: { platforms: null }, error: 'connectorManifest.platforms is required' },
  { label: 'false platforms', connectorManifest: { platforms: false }, error: 'connectorManifest.platforms is required' },
  { label: 'empty object platforms', connectorManifest: { platforms: {} }, error: 'Platform "testCRM" not found in manifest' },
  { label: 'empty array platforms', connectorManifest: { platforms: [] }, error: 'Platform "testCRM" not found in manifest' },
];

const exactConnectorNameCases = [
  'crm-with-dashes',
  'crm.with.dots',
  'CRM Mixed Case',
  '顧客管理-🚀',
  '12345',
];

const missingAuthCases = [
  { label: 'missing auth', auth: undefined },
  { label: 'null auth', auth: null },
  { label: 'false auth', auth: false },
  { label: 'numeric zero auth', auth: 0 },
  { label: 'empty string auth', auth: '' },
];

const missingAuthTypeCases = [
  { label: 'missing type', auth: {} },
  { label: 'undefined type', auth: { type: undefined } },
  { label: 'null type', auth: { type: null } },
  { label: 'empty type', auth: { type: '' } },
  { label: 'false type', auth: { type: false } },
  { label: 'numeric zero type', auth: { type: 0 } },
];

const oauthTypeCasingCases = [
  'oauth',
  'OAuth',
  'OAUTH',
  'oAuTh',
];

const missingOAuthConfigCases = [
  { label: 'missing OAuth object', oauth: undefined },
  { label: 'null OAuth object', oauth: null },
  { label: 'false OAuth object', oauth: false },
  { label: 'empty string OAuth object', oauth: '' },
];

const oauthCredentialCases = [
  {
    label: 'both credential fields absent',
    oauth: {},
    errors: [
      'platform.auth.oauth.authUrl is required',
      'platform.auth.oauth.clientId is required',
    ],
  },
  {
    label: 'empty credential strings',
    oauth: { authUrl: '', clientId: '' },
    errors: [
      'platform.auth.oauth.authUrl is required',
      'platform.auth.oauth.clientId is required',
    ],
  },
  {
    label: 'null credential values',
    oauth: { authUrl: null, clientId: null },
    errors: [
      'platform.auth.oauth.authUrl is required',
      'platform.auth.oauth.clientId is required',
    ],
  },
  {
    label: 'missing auth URL only',
    oauth: { clientId: 'client-id' },
    errors: ['platform.auth.oauth.authUrl is required'],
  },
  {
    label: 'missing client ID only',
    oauth: { authUrl: 'https://crm.example.com/oauth' },
    errors: ['platform.auth.oauth.clientId is required'],
  },
];

const apiKeyTypeCasingCases = [
  'apiKey',
  'apikey',
  'APIKEY',
  'ApiKey',
];

const missingApiKeyConfigCases = [
  { label: 'missing API-key object', apiKey: undefined },
  { label: 'null API-key object', apiKey: null },
  { label: 'false API-key object', apiKey: false },
  { label: 'empty string API-key object', apiKey: '' },
];

const validEnvironmentCases = [
  { label: 'omitted environment', environment: undefined },
  { label: 'null environment', environment: null },
  { label: 'fixed environment', environment: { type: 'fixed', url: 'https://crm.example.com' } },
  { label: 'dynamic environment', environment: { type: 'dynamic', urlIdentifier: 'tenant-客户' } },
  { label: 'custom environment type', environment: { type: 'regional' } },
  { label: 'selectable environment', environment: { type: 'selectable', selections: [{ name: 'US', const: 'us' }] } },
  { label: 'mixed-case selectable environment', environment: { type: 'SeLeCtAbLe', selections: [{ name: 'EU', const: 'eu' }] } },
];

const invalidEnvironmentTypeCases = [
  { label: 'empty environment object', environment: {} },
  { label: 'undefined environment type', environment: { type: undefined } },
  { label: 'null environment type', environment: { type: null } },
  { label: 'empty environment type', environment: { type: '' } },
  { label: 'false environment type', environment: { type: false } },
  { label: 'zero environment type', environment: { type: 0 } },
];

const missingSelectableSelectionCases = [
  { label: 'missing selections', selections: undefined },
  { label: 'null selections', selections: null },
  { label: 'empty selections', selections: [] },
  { label: 'empty string selections', selections: '' },
];

const validCollectionCases = [
  { label: 'empty collections', settings: [], contactTypes: [], override: [] },
  {
    label: 'populated collections',
    settings: [{ id: 'setting-1', value: false }],
    contactTypes: [{ id: 'contact-客户' }],
    override: [{ id: 'override-1' }],
  },
  { label: 'omitted collections', settings: undefined, contactTypes: undefined, override: undefined },
  { label: 'null collections', settings: null, contactTypes: null, override: null },
];

const invalidCollectionCases = [
  { field: 'settings', value: {}, error: 'platform.settings must be an array if specified' },
  { field: 'settings', value: 'setting', error: 'platform.settings must be an array if specified' },
  { field: 'settings', value: 42, error: 'platform.settings must be an array if specified' },
  { field: 'contactTypes', value: {}, error: 'platform.contactTypes must be an array if specified' },
  { field: 'contactTypes', value: 'Contact', error: 'platform.contactTypes must be an array if specified' },
  { field: 'contactTypes', value: true, error: 'platform.contactTypes must be an array if specified' },
  { field: 'override', value: {}, error: 'platform.override must be an array if specified' },
  { field: 'override', value: 'override', error: 'platform.override must be an array if specified' },
  { field: 'override', value: 1, error: 'platform.override must be an array if specified' },
];

const missingPlatformNameCases = [undefined, null, '', false, 0];

module.exports = {
  invalidManifestStructureCases,
  exactConnectorNameCases,
  missingAuthCases,
  missingAuthTypeCases,
  oauthTypeCasingCases,
  missingOAuthConfigCases,
  oauthCredentialCases,
  apiKeyTypeCasingCases,
  missingApiKeyConfigCases,
  validEnvironmentCases,
  invalidEnvironmentTypeCases,
  missingSelectableSelectionCases,
  validCollectionCases,
  invalidCollectionCases,
  missingPlatformNameCases,
};

export {};
