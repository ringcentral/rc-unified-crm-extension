const insightlyAuthenticationCase = {
  platform: 'insightly',
  apiVersion: 'v3.1',
  apiKey: 'e2e-insightly-auth-api-key',
  apiBaseUrl: 'https://api.e2e.insightly.com',
  hostname: 'app.insightly.com',
  userId: '71001-insightly',
  hashedExtensionId: 'e2e-insightly-auth-hashed-extension',
  crmUserResponse: {
    USER_ID: 71001,
    FIRST_NAME: 'Ada',
    LAST_NAME: 'Lovelace',
    TIMEZONE_ID: 'Eastern Standard Time',
  },
  expectedLoginResponse: {
    name: 'Ada Lovelace',
    returnMessage: {
      messageType: 'success',
      message: 'Connected to Insightly.',
    },
  },
  expectedPersistedUser: {
    id: '71001-insightly',
    platform: 'insightly',
    hostname: 'app.insightly.com',
    accessToken: 'e2e-insightly-auth-api-key',
    hashedRcExtensionId: 'e2e-insightly-auth-hashed-extension',
    timezoneName: 'Eastern Standard Time',
    platformAdditionalInfo: {
      apiUrl: 'https://api.e2e.insightly.com',
      apiKey: 'e2e-insightly-auth-api-key',
    },
    userSettings: {},
  },
};

const pipedriveAuthenticationCase = {
  platform: 'pipedrive',
  userId: '72002-pipedrive',
  clientId: 'e2e-pipedrive-client-id',
  clientSecret: 'e2e-pipedrive-client-secret',
  accessToken: 'e2e-pipedrive-access-token',
  refreshToken: 'e2e-pipedrive-refresh-token',
  redirectUri: 'https://unified-crm-extension.labs.ringcentral.com/pipedrive-redirect',
  hashedExtensionId: 'e2e-pipedrive-auth-hashed-extension',
  authorizationCode: 'e2e-pipedrive-authorization-code',
  apiBaseUrl: 'https://api.pipedrive.com',
  tokenResponse: {
    access_token: 'e2e-pipedrive-access-token',
    refresh_token: 'e2e-pipedrive-refresh-token',
    token_type: 'Bearer',
    expires_in: 7200,
  },
  crmUserResponse: {
    data: {
      id: 72002,
      name: 'Grace Hopper',
      timezone_name: 'America/New_York',
      timezone_offset: '-04:00',
      company_id: 73003,
      company_name: 'E2E Pipedrive Company',
      company_domain: 'e2e-auth-company',
    },
  },
  expectedLoginResponse: {
    name: 'Grace Hopper',
    returnMessage: {
      messageType: 'success',
      message: 'Connected to Pipedrive.',
    },
  },
  expectedPersistedUser: {
    id: '72002-pipedrive',
    platform: 'pipedrive',
    hostname: 'e2e-auth-company.pipedrive.com',
    accessToken: 'e2e-pipedrive-access-token',
    refreshToken: 'e2e-pipedrive-refresh-token',
    hashedRcExtensionId: 'e2e-pipedrive-auth-hashed-extension',
    timezoneName: 'America/New_York',
    timezoneOffset: '-04:00',
    platformAdditionalInfo: {
      companyId: 73003,
      companyName: 'E2E Pipedrive Company',
      companyDomain: 'e2e-auth-company',
    },
    userSettings: {},
  },
};

module.exports = {
  insightlyAuthenticationCase,
  pipedriveAuthenticationCase,
};

export {};
