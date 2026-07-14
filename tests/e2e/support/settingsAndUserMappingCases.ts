const identity = {
  platform: 'insightly',
  userId: 'e2e-settings-mapping-insightly-user',
  rcAccountId: 'e2e-settings-mapping-rc-account',
  rcExtensionId: 'e2e-settings-mapping-admin-extension',
  rcUserNumber: '+14155550881',
  rcAccessToken: 'e2e-settings-mapping-rc-access-token',
  insightlyApiKey: 'e2e-settings-mapping-insightly-api-key',
};

const provider = {
  hostname: 'app.insightly.com',
  apiBaseUrl: 'https://api.e2e-settings.insightly.com',
  apiVersion: 'v3.1',
  expectedAuthorization: `Basic ${Buffer.from(`${identity.insightlyApiKey}:`).toString('base64')}`,
};

const requestHeaders = {
  'X-RC-Access-Token': identity.rcAccessToken,
  'rc-account-id': 'e2e-settings-mapping-hashed-account',
  'rc-extension-id': 'e2e-settings-mapping-hashed-extension',
};

const ringCentralAdminResponse = {
  id: identity.rcExtensionId,
  account: { id: identity.rcAccountId },
  permissions: {
    admin: { enabled: true },
  },
};

const userSettings = {
  recordingMode: {
    value: 'user-choice',
    defaultValue: 'user-default',
    options: ['user-choice', 'disabled'],
  },
  locale: {
    value: 'fr-FR',
    defaultValue: 'system',
    options: ['en-US', 'fr-FR'],
  },
  userOnly: {
    value: 'compact',
    defaultValue: 'comfortable',
    options: ['compact', 'comfortable'],
  },
};

const adminUserSettings = {
  recordingMode: {
    value: 'admin-required',
    customizable: false,
    defaultValue: 'admin-default',
    options: ['admin-required', 'disabled'],
  },
  locale: {
    value: 'en-US',
    customizable: true,
    defaultValue: 'en-US',
    options: ['en-US', 'fr-FR'],
  },
};

const settings = {
  userSettings,
  adminUserSettings,
  expectedMergedUserSettings: {
    recordingMode: adminUserSettings.recordingMode,
    locale: {
      customizable: true,
      value: 'fr-FR',
      defaultValue: 'system',
      options: ['en-US', 'fr-FR'],
    },
    userOnly: {
      customizable: true,
      value: 'compact',
      defaultValue: 'comfortable',
      options: ['compact', 'comfortable'],
    },
  },
};

const legacyExtension = {
  id: 'rc-extension-legacy',
  name: 'Legacy RC Assignment',
  extensionNumber: '880',
  email: 'legacy.assignment@example.test',
};

const currentExtension = {
  id: 'rc-extension-current',
  firstName: 'Ada',
  lastName: 'Mapping',
  extensionNumber: '881',
  email: 'ada.mapping@example.test',
};

const crmUser = {
  id: 88101,
  name: 'Ada Mapping',
  email: 'ada.mapping@example.test',
};

const legacyRcUser = {
  extensionId: legacyExtension.id,
  name: legacyExtension.name,
  extensionNumber: legacyExtension.extensionNumber,
  email: legacyExtension.email,
};

const currentRcUser = {
  extensionId: currentExtension.id,
  name: `${currentExtension.firstName} ${currentExtension.lastName}`,
  extensionNumber: currentExtension.extensionNumber,
  email: currentExtension.email,
};

const userMapping = {
  initialPersistedMappings: [{
    crmUserId: String(crmUser.id),
    rcExtensionId: [legacyExtension.id],
  }],
  appRequestBody: {
    rcExtensionList: [legacyExtension, currentExtension],
  },
  insightlyUsersResponse: [{
    USER_ID: crmUser.id,
    FIRST_NAME: 'Ada',
    LAST_NAME: 'Mapping',
    EMAIL_ADDRESS: crmUser.email,
  }],
  expectedInitialRead: [{
    crmUser,
    rcUser: [legacyRcUser],
  }],
  expectedReinitializedRead: [{
    crmUser,
    rcUser: [currentRcUser],
  }],
  expectedPersistedMappings: [{
    crmUserId: String(crmUser.id),
    rcExtensionId: [currentExtension.id],
  }],
  expectedUpdatedRcUsers: [currentRcUser],
};

const settingsAndUserMappingCase = {
  identity,
  provider,
  requestHeaders,
  externalApiResponses: {
    ringCentralAdmin: ringCentralAdminResponse,
  },
  scenarios: {
    settings,
    userMapping,
  },
};

module.exports = { settingsAndUserMappingCase };

export {};
