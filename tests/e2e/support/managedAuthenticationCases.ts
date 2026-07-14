const apiKeyManagedAuth = {
  platform: 'insightly',
  connectorId: 'e2e-managed-insightly-connector',
  rcExtensionId: 'e2e-managed-api-key-extension',
  adminAccessToken: 'e2e-managed-api-key-admin-token',
  managedApiKey: 'e2e-managed-insightly-api-key',
  managedApiUrl: 'https://api.e2e-managed-auth.insightly.com',
  user: {
    id: '90301-insightly',
    platform: 'insightly',
    hostname: 'app.insightly.com',
    rcAccountId: 'e2e-managed-auth-rc-account',
    rcUserNumber: '+14155550901',
    accessToken: 'e2e-managed-auth-seed-api-key',
    hashedRcExtensionId: 'e2e-managed-auth-hashed-extension',
    platformAdditionalInfo: {
      apiUrl: 'https://api.e2e-managed-auth.insightly.com',
    },
  },
  expectedState: {
    hasManagedAuth: false,
    allRequiredFieldsSatisfied: false,
    visibleFieldConsts: null,
    missingRequiredFieldConsts: ['apiKey', 'apiUrl'],
    fallbackToManualAuth: false,
  },
  expectedAdminSettings: {
    hasManagedAuth: false,
    fields: [],
    orgFields: [],
    userFields: [],
    orgValues: {},
    userValues: [],
  },
  developerPortalManifest: {
    platforms: {
      insightly: {
        auth: {
          type: 'apiKey',
          apiKey: {
            page: {
              content: [
                {
                  const: 'apiKey',
                  title: 'Insightly API key',
                  type: 'string',
                  required: true,
                  managed: true,
                  managedScope: 'user',
                },
                {
                  const: 'apiUrl',
                  title: 'Insightly API URL',
                  type: 'string',
                  required: true,
                  managed: true,
                  managedScope: 'account',
                },
              ],
            },
          },
        },
      },
    },
  },
  crmUserResponse: {
    USER_ID: 90301,
    FIRST_NAME: 'Managed',
    LAST_NAME: 'Insightly User',
    TIMEZONE_ID: 'Eastern Standard Time',
  },
};

const managedOAuth = {
  platform: 'pipedrive',
  rcAccountId: 'e2e-managed-oauth-rc-account',
  rcExtensionId: 'e2e-managed-oauth-admin-extension',
  adminAccessToken: 'e2e-managed-oauth-admin-access-token',
  userAccessToken: 'e2e-managed-oauth-user-access-token',
  hashedRcExtensionId: 'e2e-managed-oauth-hashed-extension',
  authorizationCode: 'e2e-managed-oauth-authorization-code',
  redirectUri: 'https://unified-crm-extension.labs.ringcentral.com/pipedrive-redirect',
  clientId: 'e2e-managed-oauth-client-id',
  clientSecret: 'e2e-managed-oauth-client-secret',
  accessToken: 'e2e-managed-oauth-access-token',
  refreshToken: 'e2e-managed-oauth-refresh-token',
  userId: '90201-pipedrive',
  crmUserResponse: {
    data: {
      id: 90201,
      name: 'Managed OAuth Admin',
      timezone_name: 'America/Los_Angeles',
      timezone_offset: '-07:00',
      company_id: 90202,
      company_name: 'Managed OAuth Company',
      company_domain: 'managed-oauth-company',
    },
  },
};

function buildManagedOAuthValues(accessTokenUri) {
  return {
    clientId: managedOAuth.clientId,
    clientSecret: managedOAuth.clientSecret,
    accessTokenUri,
    authorizationUri: 'https://oauth.pipedrive.com/oauth/authorize',
    redirectUri: managedOAuth.redirectUri,
    scopes: [],
    hostname: 'temp',
  };
}

function ringCentralExtensionResponse({
  isAdmin,
  rcAccountId = managedOAuth.rcAccountId,
  rcExtensionId = managedOAuth.rcExtensionId,
}) {
  return {
    id: rcExtensionId,
    account: { id: rcAccountId },
    permissions: {
      admin: { enabled: isAdmin },
    },
  };
}

module.exports = {
  apiKeyManagedAuth,
  managedOAuth,
  buildManagedOAuthValues,
  ringCentralExtensionResponse,
};

export {};
