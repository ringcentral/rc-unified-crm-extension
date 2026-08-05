const pluginManifest = {
  endpointUrl: 'https://plugins.example.com/service',
  userRegisterEndpointUrl: 'https://plugins.example.com/service/register',
};

const pluginManifestAccessCases = [
  {
    label: 'public access uses only the public manifest endpoint',
    pluginId: 'public-service',
    pluginAccess: 'public',
    ownerRcAccountId: 'owner-account',
    fetchResults: [{ data: { platforms: { 'plugin.service': pluginManifest } } }],
    expectedUrls: [
      'https://appconnect.labs.ringcentral.com/public-api/connectors/public-service/manifest?type=plugin',
    ],
  },
  {
    label: 'private access uses the account-scoped internal manifest endpoint',
    pluginId: 'private-service',
    pluginAccess: 'private',
    ownerRcAccountId: 'owner-account',
    fetchResults: [{ data: { platforms: { 'plugin.service': pluginManifest } } }],
    expectedUrls: [
      'https://appconnect.labs.ringcentral.com/public-api/connectors/private-service/manifest?access=internal&type=plugin&accountId=owner-account',
    ],
  },
  {
    label: 'shared access uses the account-scoped internal manifest endpoint',
    pluginId: 'shared-service',
    pluginAccess: 'shared',
    ownerRcAccountId: 'owner-account',
    fetchResults: [{ data: { platforms: { 'plugin.service': pluginManifest } } }],
    expectedUrls: [
      'https://appconnect.labs.ringcentral.com/public-api/connectors/shared-service/manifest?access=internal&type=plugin&accountId=owner-account',
    ],
  },
  {
    label: 'unspecified access stops after a successful public manifest lookup',
    pluginId: 'default-public-service',
    pluginAccess: undefined,
    ownerRcAccountId: 'owner-account',
    fetchResults: [{ data: { platforms: { 'plugin.service': pluginManifest } } }],
    expectedUrls: [
      'https://appconnect.labs.ringcentral.com/public-api/connectors/default-public-service/manifest?type=plugin',
    ],
  },
  {
    label: 'unspecified access falls back from public to account-scoped internal',
    pluginId: 'default-internal-service',
    pluginAccess: undefined,
    ownerRcAccountId: 'owner-account',
    fetchResults: [
      { error: 'public manifest missing' },
      { data: { platforms: { 'plugin.service': pluginManifest } } },
    ],
    expectedUrls: [
      'https://appconnect.labs.ringcentral.com/public-api/connectors/default-internal-service/manifest?type=plugin',
      'https://appconnect.labs.ringcentral.com/public-api/connectors/default-internal-service/manifest?access=internal&type=plugin&accountId=owner-account',
    ],
  },
];

const pluginLicenseCases = [
  {
    label: 'not installed',
    installed: false,
    providerResponse: undefined,
    providerError: undefined,
    expectedResult: null,
    expectedProviderCalls: 0,
  },
  {
    label: 'active license',
    installed: true,
    providerResponse: {
      licenseStatus: true,
      licenseStatusDescription: 'Active',
    },
    providerError: undefined,
    expectedResult: {
      licenseStatus: true,
      licenseStatusDescription: 'Active',
    },
    expectedProviderCalls: 1,
  },
  {
    label: 'inactive license',
    installed: true,
    providerResponse: {
      licenseStatus: false,
      licenseStatusDescription: 'Subscription required',
    },
    providerError: undefined,
    expectedResult: {
      licenseStatus: false,
      licenseStatusDescription: 'Subscription required',
    },
    expectedProviderCalls: 1,
  },
  {
    label: 'provider payload without a license status',
    installed: true,
    providerResponse: {
      message: 'Temporarily unavailable',
    },
    providerError: undefined,
    expectedResult: {
      licenseStatus: false,
      licenseStatusDescription: 'Plugin license status unavailable',
    },
    expectedProviderCalls: 1,
  },
  {
    label: 'empty provider payload',
    installed: true,
    providerResponse: null,
    providerError: undefined,
    expectedResult: {
      licenseStatus: false,
      licenseStatusDescription: 'Plugin license status unavailable',
    },
    expectedProviderCalls: 1,
  },
  {
    label: 'provider request failure',
    installed: true,
    providerResponse: undefined,
    providerError: 'license provider unavailable',
    expectedResult: undefined,
    expectedProviderCalls: 1,
  },
];

module.exports = {
  pluginManifestAccessCases,
  pluginLicenseCases,
};

export {};
