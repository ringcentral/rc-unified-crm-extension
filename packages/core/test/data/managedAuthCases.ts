const managedAuthStateCases = [
  {
    label: 'ordinary required fields use the full form when no fields are managed',
    rcAccountId: 'state-plain-account',
    rcExtensionId: '100',
    fields: [
      { const: 'apiKey', required: true },
      { const: 'tenantId', required: true },
      { const: 'region', required: false },
    ],
    orgValues: {},
    userValues: {},
    markLoginFailure: false,
    expectedState: {
      hasManagedAuth: false,
      allRequiredFieldsSatisfied: false,
      visibleFieldConsts: null,
      missingRequiredFieldConsts: ['apiKey', 'tenantId'],
      fallbackToManualAuth: false,
    },
  },
  {
    label: 'required account and user managed fields are satisfied by stored values',
    rcAccountId: 'state-complete-account',
    rcExtensionId: '101',
    fields: [
      { const: 'tenantId', required: true, managed: true, managedScope: 'account' },
      { const: 'apiKey', required: true, managed: true, managedScope: 'user' },
    ],
    orgValues: { tenantId: 'tenant-101' },
    userValues: { apiKey: 'key-101' },
    markLoginFailure: false,
    expectedState: {
      hasManagedAuth: true,
      allRequiredFieldsSatisfied: true,
      visibleFieldConsts: [],
      missingRequiredFieldConsts: [],
      fallbackToManualAuth: false,
    },
  },
  {
    label: 'missing user-managed and ordinary required fields remain visible',
    rcAccountId: 'state-missing-account',
    rcExtensionId: '102',
    fields: [
      { const: 'tenantId', required: true, managed: true, managedScope: 'account' },
      { const: 'userToken', required: true, managed: true, managedScope: 'user' },
      { const: 'apiSecret', required: true },
    ],
    orgValues: { tenantId: 'tenant-102' },
    userValues: {},
    markLoginFailure: false,
    expectedState: {
      hasManagedAuth: true,
      allRequiredFieldsSatisfied: false,
      visibleFieldConsts: ['userToken', 'apiSecret'],
      missingRequiredFieldConsts: ['userToken', 'apiSecret'],
      fallbackToManualAuth: false,
    },
  },
  {
    label: 'missing optional managed fields do not block automatic authentication',
    rcAccountId: 'state-optional-account',
    rcExtensionId: '103',
    fields: [
      { const: 'tenantId', required: true, managed: true, managedScope: 'account' },
      { const: 'region', required: false, managed: true, managedScope: 'account' },
      { const: 'userAlias', required: false, managed: true, managedScope: 'user' },
    ],
    orgValues: { tenantId: 'tenant-103' },
    userValues: {},
    markLoginFailure: false,
    expectedState: {
      hasManagedAuth: true,
      allRequiredFieldsSatisfied: true,
      visibleFieldConsts: [],
      missingRequiredFieldConsts: [],
      fallbackToManualAuth: false,
    },
  },
  {
    label: 'a recorded automatic-login failure exposes the complete manual form',
    rcAccountId: 'state-fallback-account',
    rcExtensionId: '104',
    fields: [
      { const: 'tenantId', required: true, managed: true, managedScope: 'account' },
      { const: 'apiKey', required: true, managed: true, managedScope: 'user' },
      { const: 'region', required: false },
    ],
    orgValues: { tenantId: 'tenant-104' },
    userValues: { apiKey: 'bad-key-104' },
    markLoginFailure: true,
    expectedState: {
      hasManagedAuth: true,
      allRequiredFieldsSatisfied: false,
      visibleFieldConsts: null,
      missingRequiredFieldConsts: ['tenantId', 'apiKey'],
      fallbackToManualAuth: true,
    },
  },
];

const managedAuthResolutionCases = [
  {
    label: 'stored account and user values take precedence during automatic login',
    rcAccountId: 'resolve-stored-account',
    rcExtensionId: '201',
    fields: [
      { const: 'companyId', required: true, managed: true, managedScope: 'account' },
      { const: 'apiKey', required: true, managed: true, managedScope: 'user' },
      { const: 'region', required: true },
    ],
    orgValues: { companyId: 'stored-company' },
    userValues: { apiKey: 'stored-key' },
    apiKey: undefined,
    additionalInfo: {
      companyId: 'submitted-company',
      apiKey: 'submitted-key',
      region: 'us',
    },
    preferSubmittedValuesForManagedFields: false,
    expectedResult: {
      resolvedAdditionalInfo: {
        companyId: 'stored-company',
        apiKey: 'stored-key',
        region: 'us',
      },
      resolvedApiKey: 'stored-key',
      missingRequiredFieldConsts: [],
    },
  },
  {
    label: 'submitted values fill managed fields that have not been configured',
    rcAccountId: 'resolve-submitted-account',
    rcExtensionId: '202',
    fields: [
      { const: 'companyId', required: true, managed: true, managedScope: 'account' },
      { const: 'userToken', required: true, managed: true, managedScope: 'user' },
      { const: 'region', required: false, managed: true, managedScope: 'account' },
    ],
    orgValues: {},
    userValues: {},
    apiKey: undefined,
    additionalInfo: {
      companyId: 'submitted-company',
      userToken: 'submitted-token',
      region: 'eu',
    },
    preferSubmittedValuesForManagedFields: false,
    expectedResult: {
      resolvedAdditionalInfo: {
        companyId: 'submitted-company',
        userToken: 'submitted-token',
        region: 'eu',
      },
      resolvedApiKey: undefined,
      missingRequiredFieldConsts: [],
    },
  },
  {
    label: 'manual fallback allows submitted values to override stored managed values',
    rcAccountId: 'resolve-manual-account',
    rcExtensionId: '203',
    fields: [
      { const: 'companyId', required: true, managed: true, managedScope: 'account' },
      { const: 'apiKey', required: true, managed: true, managedScope: 'user' },
    ],
    orgValues: { companyId: 'stored-company' },
    userValues: { apiKey: 'stored-key' },
    apiKey: undefined,
    additionalInfo: {
      companyId: 'manual-company',
      apiKey: 'manual-key',
    },
    preferSubmittedValuesForManagedFields: true,
    expectedResult: {
      resolvedAdditionalInfo: {
        companyId: 'manual-company',
        apiKey: 'manual-key',
      },
      resolvedApiKey: 'manual-key',
      missingRequiredFieldConsts: [],
    },
  },
  {
    label: 'missing required managed and ordinary fields are reported together',
    rcAccountId: 'resolve-missing-account',
    rcExtensionId: '204',
    fields: [
      { const: 'companyId', required: true, managed: true, managedScope: 'account' },
      { const: 'apiKey', required: true, managed: true, managedScope: 'user' },
      { const: 'apiSecret', required: true },
    ],
    orgValues: { companyId: 'stored-company' },
    userValues: {},
    apiKey: undefined,
    additionalInfo: {},
    preferSubmittedValuesForManagedFields: false,
    expectedResult: {
      resolvedAdditionalInfo: {
        companyId: 'stored-company',
      },
      resolvedApiKey: undefined,
      missingRequiredFieldConsts: ['apiKey', 'apiSecret'],
    },
  },
  {
    label: 'a top-level API key satisfies an ordinary API key field',
    rcAccountId: 'resolve-top-level-key-account',
    rcExtensionId: '205',
    fields: [
      { const: 'apiKey', required: true },
    ],
    orgValues: {},
    userValues: {},
    apiKey: 'top-level-key',
    additionalInfo: {},
    preferSubmittedValuesForManagedFields: false,
    expectedResult: {
      resolvedAdditionalInfo: {
        apiKey: 'top-level-key',
      },
      resolvedApiKey: 'top-level-key',
      missingRequiredFieldConsts: [],
    },
  },
];

const managedAuthMutationCases = [
  {
    label: 'account-scoped upsert merges an update and removes selected fields',
    scope: 'account',
    rcAccountId: 'mutation-org-account',
    rcExtensionId: undefined,
    fields: [
      { const: 'tenantId', managed: true, managedScope: 'account' },
      { const: 'region', managed: true, managedScope: 'account' },
    ],
    initialValues: {
      tenantId: 'tenant-initial',
      region: 'us',
    },
    updateValues: {
      region: 'eu',
    },
    fieldsToRemove: ['tenantId'],
    expectedAdminValues: {
      tenantId: { hasValue: false, value: '' },
      region: { hasValue: true, value: 'eu' },
    },
  },
  {
    label: 'user-scoped upsert merges an update and removes selected fields',
    scope: 'user',
    rcAccountId: 'mutation-user-account',
    rcExtensionId: '301',
    fields: [
      { const: 'apiKey', managed: true, managedScope: 'user' },
      { const: 'loginName', managed: true, managedScope: 'user' },
    ],
    initialValues: {
      apiKey: 'key-initial',
      loginName: 'agent-initial',
    },
    updateValues: {
      apiKey: 'key-updated',
    },
    fieldsToRemove: ['loginName'],
    expectedAdminValues: {
      apiKey: { hasValue: true, value: 'key-updated' },
      loginName: { hasValue: false, value: '' },
    },
  },
];

const managedAuthIsolationFields = [
  { const: 'tenantId', required: true, managed: true, managedScope: 'account' },
  { const: 'apiKey', required: true, managed: true, managedScope: 'user' },
];

const managedAuthIsolationCases = [
  {
    label: 'account records are isolated by RC account',
    records: [
      { scope: 'account', rcAccountId: 'isolation-account-a', platform: 'crm-a', values: { tenantId: 'tenant-a' } },
      { scope: 'user', rcAccountId: 'isolation-account-a', platform: 'crm-a', rcExtensionId: '401', values: { apiKey: 'key-a' } },
      { scope: 'account', rcAccountId: 'isolation-account-b', platform: 'crm-a', values: { tenantId: 'tenant-b' } },
      { scope: 'user', rcAccountId: 'isolation-account-b', platform: 'crm-a', rcExtensionId: '401', values: { apiKey: 'key-b' } },
    ],
    lookup: {
      rcAccountId: 'isolation-account-a',
      platform: 'crm-a',
      rcExtensionId: '401',
    },
    expectedAdditionalInfo: {
      tenantId: 'tenant-a',
      apiKey: 'key-a',
    },
  },
  {
    label: 'account and user records are isolated by platform',
    records: [
      { scope: 'account', rcAccountId: 'isolation-platform-account', platform: 'crm-a', values: { tenantId: 'tenant-a' } },
      { scope: 'user', rcAccountId: 'isolation-platform-account', platform: 'crm-a', rcExtensionId: '402', values: { apiKey: 'key-a' } },
      { scope: 'account', rcAccountId: 'isolation-platform-account', platform: 'crm-b', values: { tenantId: 'tenant-b' } },
      { scope: 'user', rcAccountId: 'isolation-platform-account', platform: 'crm-b', rcExtensionId: '402', values: { apiKey: 'key-b' } },
    ],
    lookup: {
      rcAccountId: 'isolation-platform-account',
      platform: 'crm-b',
      rcExtensionId: '402',
    },
    expectedAdditionalInfo: {
      tenantId: 'tenant-b',
      apiKey: 'key-b',
    },
  },
  {
    label: 'user records are isolated by RC extension',
    records: [
      { scope: 'account', rcAccountId: 'isolation-extension-account', platform: 'crm-a', values: { tenantId: 'tenant-shared' } },
      { scope: 'user', rcAccountId: 'isolation-extension-account', platform: 'crm-a', rcExtensionId: '403', values: { apiKey: 'key-403' } },
      { scope: 'user', rcAccountId: 'isolation-extension-account', platform: 'crm-a', rcExtensionId: '404', values: { apiKey: 'key-404' } },
    ],
    lookup: {
      rcAccountId: 'isolation-extension-account',
      platform: 'crm-a',
      rcExtensionId: '404',
    },
    expectedAdditionalInfo: {
      tenantId: 'tenant-shared',
      apiKey: 'key-404',
    },
  },
];

const managedAuthFailureRecoveryCase = {
  rcAccountId: 'failure-recovery-account',
  rcExtensionId: '501',
  fields: [
    { const: 'tenantId', required: true, managed: true, managedScope: 'account' },
    { const: 'apiKey', required: true, managed: true, managedScope: 'user' },
  ],
  orgValues: { tenantId: 'tenant-501' },
  userValues: { apiKey: 'key-501' },
};

module.exports = {
  managedAuthStateCases,
  managedAuthResolutionCases,
  managedAuthMutationCases,
  managedAuthIsolationFields,
  managedAuthIsolationCases,
  managedAuthFailureRecoveryCase,
};

export {};
