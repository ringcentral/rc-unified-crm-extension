describe('Handler TypeScript module exports', () => {
  const expectedExports = {
    admin: [
      'validateAdminRole',
      'validateRcUserToken',
      'upsertAdminSettings',
      'getAdminSettings',
      'updateAdminRcTokens',
      'getServerLoggingSettings',
      'updateServerLoggingSettings',
      'getAdminReport',
      'getUserReport',
      'getUserMapping',
      'reinitializeUserMapping',
    ],
    appointment: [
      'listAppointments',
      'createAppointment',
      'updateAppointment',
      'refreshAppointment',
      'confirmAppointment',
      'cancelAppointment',
    ],
    auth: [
      'onOAuthCallback',
      'onApiKeyLogin',
      'authValidation',
      'getLicenseStatus',
      'onRingcentralOAuthCallback',
    ],
    calldown: ['schedule', 'list', 'remove', 'markCalled', 'update'],
    contact: ['findContact', 'createContact', 'findContactWithName'],
    disposition: ['upsertCallDisposition'],
    log: [
      'createCallLog',
      'updateCallLog',
      'createMessageLog',
      'getCallLog',
      'saveNoteCache',
      'handleAsyncPluginCallback',
    ],
    managedAuth: [
      'MANAGED_AUTH_ORG_DATA_KEY',
      'MANAGED_AUTH_USER_DATA_KEY',
      'getApiKeyFieldDefinitions',
      'getManagedFieldDefinitions',
      'getManagedAuthAdminSettings',
      'getManagedAuthState',
      'hasManagedAuthLoginFailure',
      'markManagedAuthLoginFailure',
      'clearManagedAuthLoginFailure',
      'resolveApiKeyLoginFields',
      'persistSubmittedManagedValues',
      'upsertOrgManagedAuthValues',
      'upsertUserManagedAuthValues',
    ],
    managedOAuth: [
      'MANAGED_OAUTH_ACCOUNT_DATA_KEY',
      'MANAGED_OAUTH_FIELDS',
      'getManagedOAuthState',
      'upsertPendingManagedOAuth',
      'getPendingManagedOAuthValues',
      'getAccountManagedOAuthValues',
      'migratePendingManagedOAuth',
      'resolveManagedOAuthInfo',
      'clearPendingManagedOAuth',
      'clearAccountManagedOAuth',
      'resetManagedOAuth',
      'removeSecret',
    ],
    plugin: [
      'getPluginsFromRcAccountId',
      'getPluginConfigFromUserSettings',
      'getPluginLicenseStatus',
      'getRefreshedJwtTokenFromHeaders',
      'resolvePluginManifest',
      'persistPluginData',
      'registerPluginAccount',
      'unregisterPluginAccount',
    ],
    user: [
      'refreshUserInfo',
      'getUserSettingsByAdmin',
      'getUserSettings',
      'updateUserSettings',
    ],
  };

  test.each(Object.entries(expectedExports))('%s.ts exposes the compatibility handler API', (moduleName, exports) => {
    const moduleExports = require(`../../handlers/${moduleName}.ts`);

    for (const exportName of exports) {
      expect(moduleExports[exportName]).toBeDefined();
    }
  });
});

export {};
