const identity = {
  userId: 'e2e-plugin-services-user',
  platform: 'pipedrive',
  rcAccountId: 'e2e-plugin-services-account',
  rcUserNumber: '+14155550201',
  hostname: 'plugin-services.e2e.example.test',
  crmAccessToken: 'e2e-crm-access-token',
  crmRefreshToken: 'e2e-crm-refresh-token',
  hashedRcExtensionId: 'e2e-plugin-services-extension',
};

const oauthEnvironment = {
  GOOGLE_DRIVE_PLUGIN_CLIENT_ID: 'e2e-google-drive-client',
  GOOGLE_DRIVE_PLUGIN_CLIENT_SECRET: 'e2e-google-drive-secret',
  GOOGLE_DRIVE_PLUGIN_REDIRECT_URI: 'https://app.e2e.example.test/googleDrive/oauthCallback',
  GOOGLE_DRIVE_PLUGIN_TOKEN_URI: '',
  GOOGLE_DRIVE_PLUGIN_AUTHORIZATION_URI: 'https://accounts.e2e.example.test/o/oauth2/v2/auth',
  APP_SERVER: 'https://app.e2e.example.test',
};

const allCapSettingKey = 'plugin_ringcentral_labs-app_caps-yKI8e20W';
const allCap = {
  userSettings: {
    [allCapSettingKey]: {
      value: {
        config: {
          ignoredLetters: {
            value: ['e', ' ', '!'],
          },
        },
      },
    },
  },
  appRequestBody: {
    data: {
      note: 'Hello e2e!',
      unchangedField: 'preserved',
    },
  },
  expectedResponse: {
    note: 'HeLLO e2e!',
    unchangedField: 'preserved',
  },
};

const googleDrive = {
  pluginId: 'googleDrive',
  accessToken: 'e2e-google-access-token',
  refreshToken: 'e2e-google-refresh-token',
  authorizationCode: 'e2e-google-authorization-code',
  scope: 'https://www.googleapis.com/auth/drive.file',
  tokenResponse: {
    access_token: 'e2e-google-access-token',
    refresh_token: 'e2e-google-refresh-token',
    expires_in: 3600,
    token_type: 'Bearer',
  },
  expectedAuthorizationQuery: {
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/drive.file',
    access_type: 'offline',
    prompt: 'consent',
  },
  expectedState: {
    from: 'plugin',
    redirectTo: `${oauthEnvironment.APP_SERVER}/googleDrive/oauthCallback`,
    pluginId: 'googleDrive',
  },
  expectedTokenAuthorization: `Basic ${Buffer.from(
    `${oauthEnvironment.GOOGLE_DRIVE_PLUGIN_CLIENT_ID}:${oauthEnvironment.GOOGLE_DRIVE_PLUGIN_CLIENT_SECRET}`,
  ).toString('base64')}`,
  expectedTokenRequest: {
    code: 'e2e-google-authorization-code',
    grant_type: 'authorization_code',
    redirect_uri: oauthEnvironment.GOOGLE_DRIVE_PLUGIN_REDIRECT_URI,
  },
  expectedCallbackResponse: { pluginId: 'googleDrive' },
  expectedPersistedUser: {
    id: identity.userId,
    accessToken: 'e2e-google-access-token',
    refreshToken: 'e2e-google-refresh-token',
  },
  expectedCheckAuthResponse: { successful: true },
  expectedLogoutResponse: {
    successful: true,
    returnMessage: {
      message: 'User logged out',
      messageType: 'success',
      ttl: 3000,
    },
  },
};

const pluginServiceCase = {
  identity,
  oauthEnvironment,
  scenarios: {
    allCap,
    googleDrive,
  },
};

module.exports = { pluginServiceCase };

export {};
