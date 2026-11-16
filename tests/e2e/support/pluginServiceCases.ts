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

const pluginServiceCase = {
  identity,
  scenarios: {
    allCap,
  },
};

module.exports = { pluginServiceCase };

export {};
