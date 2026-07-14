const managedOAuthValueCases = [
  {
    label: 'all supported fields are retained while unknown and empty fields are filtered',
    rcAccountId: 'values-all-account',
    values: {
      clientId: 'client-all',
      clientSecret: 'secret-all',
      accessTokenUri: 'https://token.example.com',
      authorizationUri: 'https://authorize.example.com',
      redirectUri: 'https://app.example.com/oauth/callback',
      scopes: ['contacts.read', 'contacts.write'],
      hostname: 'crm.example.com',
      ignored: 'not-managed-oauth-data',
      emptyAllowedField: '',
    },
    expectedValues: {
      clientId: 'client-all',
      clientSecret: 'secret-all',
      accessTokenUri: 'https://token.example.com',
      authorizationUri: 'https://authorize.example.com',
      redirectUri: 'https://app.example.com/oauth/callback',
      scopes: ['contacts.read', 'contacts.write'],
      hostname: 'crm.example.com',
    },
  },
  {
    label: 'a string scope value is retained',
    rcAccountId: 'values-string-scopes-account',
    values: {
      clientId: 'client-string-scopes',
      scopes: 'contacts.read contacts.write',
    },
    expectedValues: {
      clientId: 'client-string-scopes',
      scopes: 'contacts.read contacts.write',
    },
  },
  {
    label: 'empty and unknown values produce an empty pending record',
    rcAccountId: 'values-empty-account',
    values: {
      clientId: '',
      clientSecret: null,
      authorizationUri: undefined,
      ignored: 'not-managed-oauth-data',
    },
    expectedValues: {},
  },
];

const managedOAuthStateCases = [
  {
    label: 'an admin sees pending OAuth values, including the secret needed to finish setup',
    rcAccountId: 'state-pending-admin-account',
    platform: 'testCRM',
    isAdmin: true,
    accountValues: undefined,
    pendingValues: {
      clientId: 'pending-client',
      clientSecret: 'pending-secret',
    },
    expectedState: {
      isAdmin: true,
      hasAccountOAuth: false,
      hasPendingOAuth: true,
      pendingValues: {
        clientId: 'pending-client',
        clientSecret: 'pending-secret',
      },
    },
  },
  {
    label: 'a non-admin cannot observe pending OAuth values',
    rcAccountId: 'state-pending-user-account',
    platform: 'testCRM',
    isAdmin: false,
    accountValues: undefined,
    pendingValues: {
      clientId: 'pending-client',
      clientSecret: 'pending-secret',
    },
    expectedState: {
      isAdmin: false,
      hasAccountOAuth: false,
      hasPendingOAuth: false,
    },
  },
  {
    label: 'an admin sees account OAuth values with the client secret redacted',
    rcAccountId: 'state-account-admin-account',
    platform: 'testCRM',
    isAdmin: true,
    accountValues: {
      clientId: 'account-client',
      clientSecret: 'account-secret',
      accessTokenUri: 'https://token.example.com',
    },
    pendingValues: undefined,
    expectedState: {
      isAdmin: true,
      hasAccountOAuth: true,
      hasPendingOAuth: false,
      oauthValues: {
        clientId: 'account-client',
        accessTokenUri: 'https://token.example.com',
      },
    },
  },
  {
    label: 'a non-admin sees account OAuth state with the client secret redacted',
    rcAccountId: 'state-account-user-account',
    platform: 'testCRM',
    isAdmin: false,
    accountValues: {
      clientId: 'account-client',
      clientSecret: 'account-secret',
    },
    pendingValues: undefined,
    expectedState: {
      isAdmin: false,
      hasAccountOAuth: true,
      hasPendingOAuth: false,
      oauthValues: {
        clientId: 'account-client',
      },
    },
  },
  {
    label: 'account OAuth state takes precedence over a newer pending setup',
    rcAccountId: 'state-account-precedence-account',
    platform: 'testCRM',
    isAdmin: true,
    accountValues: {
      clientId: 'account-client',
      clientSecret: 'account-secret',
    },
    pendingValues: {
      clientId: 'pending-client',
      clientSecret: 'pending-secret',
    },
    expectedState: {
      isAdmin: true,
      hasAccountOAuth: true,
      hasPendingOAuth: false,
      oauthValues: {
        clientId: 'account-client',
      },
    },
  },
];

const managedOAuthResolutionCases = [
  {
    label: 'account values take precedence over pending values',
    rcAccountId: 'resolve-account-first',
    platform: 'testCRM',
    accountValues: {
      clientId: 'account-client',
      clientSecret: 'account-secret',
    },
    pendingValues: {
      clientId: 'pending-client',
      clientSecret: 'pending-secret',
    },
    expectedResolution: {
      source: 'account',
      oauthInfo: {
        clientId: 'account-client',
        clientSecret: 'account-secret',
      },
    },
  },
  {
    label: 'pending values are used when account values do not exist',
    rcAccountId: 'resolve-pending-only',
    platform: 'testCRM',
    accountValues: undefined,
    pendingValues: {
      clientId: 'pending-client',
      clientSecret: 'pending-secret',
    },
    expectedResolution: {
      source: 'pending',
      oauthInfo: {
        clientId: 'pending-client',
        clientSecret: 'pending-secret',
      },
    },
  },
  {
    label: 'no source is returned when neither account nor pending values exist',
    rcAccountId: 'resolve-missing',
    platform: 'testCRM',
    accountValues: undefined,
    pendingValues: undefined,
    expectedResolution: {
      source: null,
      oauthInfo: null,
    },
  },
];

const managedOAuthIsolationData = {
  accounts: [
    {
      rcAccountId: 'isolation-account-a',
      platform: 'crm-a',
      values: { clientId: 'account-a-crm-a' },
    },
    {
      rcAccountId: 'isolation-account-a',
      platform: 'crm-b',
      values: { clientId: 'account-a-crm-b' },
    },
    {
      rcAccountId: 'isolation-account-b',
      platform: 'crm-a',
      values: { clientId: 'account-b-crm-a' },
    },
  ],
  lookups: [
    {
      label: 'first account and platform',
      rcAccountId: 'isolation-account-a',
      platform: 'crm-a',
      expectedValues: { clientId: 'account-a-crm-a' },
    },
    {
      label: 'same account on another platform',
      rcAccountId: 'isolation-account-a',
      platform: 'crm-b',
      expectedValues: { clientId: 'account-a-crm-b' },
    },
    {
      label: 'another account on the same platform',
      rcAccountId: 'isolation-account-b',
      platform: 'crm-a',
      expectedValues: { clientId: 'account-b-crm-a' },
    },
  ],
};

const managedOAuthExpiryCase = {
  rcAccountId: 'expired-pending-account',
  values: {
    clientId: 'expired-client',
    clientSecret: 'expired-secret',
  },
};

const managedOAuthResetCase = {
  rcAccountId: 'reset-account',
  platform: 'testCRM',
  accountValues: {
    clientId: 'account-client',
  },
  pendingValues: {
    clientId: 'replacement-pending-client',
  },
};

module.exports = {
  managedOAuthValueCases,
  managedOAuthStateCases,
  managedOAuthResolutionCases,
  managedOAuthIsolationData,
  managedOAuthExpiryCase,
  managedOAuthResetCase,
};

export {};
