const identity = {
  platform: 'pipedrive',
  userId: '77881-pipedrive',
  rcAccountId: 'e2e-pipedrive-mapping-account',
  rcUserNumber: '+14155550781',
  rcAccessToken: 'e2e-pipedrive-mapping-rc-access-token',
  hashedExtensionId: 'e2e-pipedrive-mapping-extension',
  accessToken: 'e2e-pipedrive-mapping-access-token',
};

const provider = {
  hostname: 'mapping-e2e.pipedrive.com',
  apiBaseUrl: 'https://mapping-e2e.pipedrive.com',
  authorization: `Bearer ${identity.accessToken}`,
};

const legacyExtension = {
  id: 'pipedrive-legacy-extension',
  name: 'Legacy Pipedrive Assignment',
  extensionNumber: '781',
  email: 'legacy.pipedrive@example.test',
};

const currentExtension = {
  id: 'pipedrive-current-extension',
  firstName: 'Casey',
  lastName: 'Pipeline',
  extensionNumber: '782',
  email: 'casey.pipeline@example.test',
};

const crmUser = {
  id: 77882,
  name: 'Casey Pipeline',
  email: currentExtension.email,
};

const pipedriveUserMappingCase = {
  identity,
  provider,
  requestHeaders: {
    'rc-account-id': 'e2e-pipedrive-mapping-hashed-account',
    'rc-extension-id': identity.hashedExtensionId,
    'X-RC-Access-Token': identity.rcAccessToken,
  },
  ringCentralAdminResponse: {
    id: 'e2e-pipedrive-mapping-admin-extension',
    account: { id: identity.rcAccountId },
    permissions: { admin: { enabled: true } },
  },
  crmResponse: {
    data: [
      {
        id: crmUser.id,
        name: crmUser.name,
        email: crmUser.email,
        is_deleted: false,
      },
      {
        id: 77883,
        name: 'Deleted Pipeline User',
        email: 'deleted.pipeline@example.test',
        is_deleted: true,
      },
    ],
  },
  initialPersistedMappings: [{
    crmUserId: String(crmUser.id),
    rcExtensionId: [legacyExtension.id],
  }],
  appRequestBody: {
    rcExtensionList: [legacyExtension, currentExtension],
  },
  expectedInitialRead: [{
    crmUser,
    rcUser: [{
      extensionId: legacyExtension.id,
      name: legacyExtension.name,
      extensionNumber: legacyExtension.extensionNumber,
      email: legacyExtension.email,
    }],
  }],
  expectedReinitializedRead: [{
    crmUser,
    rcUser: [{
      extensionId: currentExtension.id,
      name: `${currentExtension.firstName} ${currentExtension.lastName}`,
      extensionNumber: currentExtension.extensionNumber,
      email: currentExtension.email,
    }],
  }],
  expectedPersistedMappings: [{
    crmUserId: String(crmUser.id),
    rcExtensionId: [currentExtension.id],
  }],
};

module.exports = { pipedriveUserMappingCase };

export {};
