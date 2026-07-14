// Use in-memory SQLite for isolated model tests
jest.mock('../../models/sequelize', () => {
  const { Sequelize } = require('sequelize');
  return {
    sequelize: new Sequelize({
      dialect: 'sqlite',
      storage: ':memory:',
      logging: false,
    }),
  };
});

jest.mock('../../connector/registry');
jest.mock('../../connector/developerPortal', () => ({
  getConnectorManifest: jest.fn(),
}));

const managedAuthHandler = require('../../handlers/managedAuth');
const connectorRegistry = require('../../connector/registry');
const developerPortal = require('../../connector/developerPortal');
const { AccountDataModel } = require('../../models/accountDataModel');
const { sequelize } = require('../../models/sequelize');
const {
  managedAuthStateCases,
  managedAuthResolutionCases,
  managedAuthMutationCases,
  managedAuthIsolationFields,
  managedAuthIsolationCases,
  managedAuthFailureRecoveryCase,
} = require('../data/managedAuthCases');

const defaultPlatform = 'testCRM';

function buildManifest(platform, fields) {
  return {
    platforms: {
      [platform]: {
        auth: {
          type: 'apiKey',
          apiKey: {
            page: {
              content: fields,
            },
          },
        },
      },
    },
  };
}

function mockManifest(fields) {
  connectorRegistry.getManifest.mockImplementation((platform) => (
    buildManifest(platform, fields)
  ));
}

async function seedManagedValues({
  rcAccountId,
  platform = defaultPlatform,
  rcExtensionId,
  orgValues = {},
  userValues = {},
}) {
  if (Object.keys(orgValues).length > 0) {
    await managedAuthHandler.upsertOrgManagedAuthValues({
      rcAccountId,
      platform,
      values: orgValues,
    });
  }
  if (Object.keys(userValues).length > 0) {
    await managedAuthHandler.upsertUserManagedAuthValues({
      rcAccountId,
      platform,
      rcExtensionId,
      rcUserName: `Agent ${rcExtensionId}`,
      values: userValues,
    });
  }
}

describe('Managed Auth Handler', () => {
  beforeAll(async () => {
    process.env.APP_SERVER_SECRET_KEY = 'test-app-server-secret-key-123456';
    await AccountDataModel.sync({ force: true });
  });

  afterEach(async () => {
    await AccountDataModel.destroy({ where: {} });
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await sequelize.close();
  });

  describe('getManagedAuthState', () => {
    test.each(managedAuthStateCases)('$label', async (...args: any[]) => {
      const {
        rcAccountId,
        rcExtensionId,
        fields,
        orgValues,
        userValues,
        markLoginFailure,
        expectedState,
      } = args[0];
      mockManifest(fields);
      await seedManagedValues({
        rcAccountId,
        rcExtensionId,
        orgValues,
        userValues,
      });
      if (markLoginFailure) {
        await managedAuthHandler.markManagedAuthLoginFailure({
          rcAccountId,
          platform: defaultPlatform,
          rcExtensionId,
        });
      }

      const state = await managedAuthHandler.getManagedAuthState({
        platform: defaultPlatform,
        rcAccountId,
        rcExtensionId,
      });

      expect(state).toEqual(expectedState);
    });

    test('clearing a login failure restores automatic managed authentication', async () => {
      const {
        rcAccountId,
        rcExtensionId,
        fields,
        orgValues,
        userValues,
      } = managedAuthFailureRecoveryCase;
      mockManifest(fields);
      await seedManagedValues({
        rcAccountId,
        rcExtensionId,
        orgValues,
        userValues,
      });
      await managedAuthHandler.markManagedAuthLoginFailure({
        rcAccountId,
        platform: defaultPlatform,
        rcExtensionId,
      });

      await expect(managedAuthHandler.getManagedAuthState({
        platform: defaultPlatform,
        rcAccountId,
        rcExtensionId,
      })).resolves.toMatchObject({
        fallbackToManualAuth: true,
      });

      await expect(managedAuthHandler.clearManagedAuthLoginFailure({
        rcAccountId,
        platform: defaultPlatform,
        rcExtensionId,
      })).resolves.toBe(1);

      await expect(managedAuthHandler.getManagedAuthState({
        platform: defaultPlatform,
        rcAccountId,
        rcExtensionId,
      })).resolves.toEqual({
        hasManagedAuth: true,
        allRequiredFieldsSatisfied: true,
        visibleFieldConsts: [],
        missingRequiredFieldConsts: [],
        fallbackToManualAuth: false,
      });
    });
  });

  test('getManagedAuthAdminSettings returns decrypted account and user fields while storage stays encrypted', async () => {
    const fields = [
      { const: 'tenantId', managed: true, managedScope: 'account' },
      { const: 'apiKey', managed: true, managedScope: 'user' },
    ];
    mockManifest(fields);
    await seedManagedValues({
      rcAccountId: 'admin-settings-account',
      rcExtensionId: '601',
      orgValues: { tenantId: 'tenant-secret' },
      userValues: { apiKey: 'user-secret' },
    });

    const settings = await managedAuthHandler.getManagedAuthAdminSettings({
      platform: defaultPlatform,
      rcAccountId: 'admin-settings-account',
    });

    expect(settings.orgValues.tenantId).toEqual({
      hasValue: true,
      value: 'tenant-secret',
    });
    expect(settings.userValues).toEqual([
      {
        rcExtensionId: '601',
        rcUserName: 'Agent 601',
        fields: {
          apiKey: {
            hasValue: true,
            value: 'user-secret',
          },
        },
      },
    ]);

    const rawOrgRecord = await AccountDataModel.findOne({
      where: {
        rcAccountId: 'admin-settings-account',
        platformName: defaultPlatform,
        dataKey: managedAuthHandler.MANAGED_AUTH_ORG_DATA_KEY,
      },
    });
    expect(rawOrgRecord.data.fields.tenantId).toMatchObject({
      version: 1,
      encrypted: true,
    });
    expect(rawOrgRecord.data.fields.tenantId.value).not.toContain('tenant-secret');
  });

  test('field definitions can be loaded from Developer Portal for a connector id', async () => {
    const fields = [
      { const: 'orgToken', required: true, managed: true, managedScope: 'account' },
    ];
    developerPortal.getConnectorManifest.mockResolvedValue(
      buildManifest(defaultPlatform, fields),
    );
    await managedAuthHandler.upsertOrgManagedAuthValues({
      rcAccountId: 'developer-portal-account',
      platform: defaultPlatform,
      values: { orgToken: 'portal-token' },
    });

    const state = await managedAuthHandler.getManagedAuthState({
      platform: defaultPlatform,
      connectorId: 'connector-123',
      rcAccountId: 'developer-portal-account',
    });

    expect(developerPortal.getConnectorManifest).toHaveBeenCalledWith({
      rcAccountId: 'developer-portal-account',
      connectorId: 'connector-123',
      isPrivate: false,
    });
    expect(state).toMatchObject({
      hasManagedAuth: true,
      allRequiredFieldsSatisfied: true,
      visibleFieldConsts: [],
    });
  });

  describe('resolveApiKeyLoginFields', () => {
    test.each(managedAuthResolutionCases)('$label', async (...args: any[]) => {
      const {
        rcAccountId,
        rcExtensionId,
        fields,
        orgValues,
        userValues,
        apiKey,
        additionalInfo,
        preferSubmittedValuesForManagedFields,
        expectedResult,
      } = args[0];
      mockManifest(fields);
      await seedManagedValues({
        rcAccountId,
        rcExtensionId,
        orgValues,
        userValues,
      });

      const result = await managedAuthHandler.resolveApiKeyLoginFields({
        platform: defaultPlatform,
        rcAccountId,
        rcExtensionId,
        apiKey,
        additionalInfo,
        preferSubmittedValuesForManagedFields,
      });

      expect(result).toEqual(expectedResult);
    });
  });

  describe('managed value mutations', () => {
    test.each(managedAuthMutationCases)('$label', async (...args: any[]) => {
      const {
        scope,
        rcAccountId,
        rcExtensionId,
        fields,
        initialValues,
        updateValues,
        fieldsToRemove,
        expectedAdminValues,
      } = args[0];
      mockManifest(fields);
      if (scope === 'account') {
        await managedAuthHandler.upsertOrgManagedAuthValues({
          rcAccountId,
          platform: defaultPlatform,
          values: initialValues,
        });
        await managedAuthHandler.upsertOrgManagedAuthValues({
          rcAccountId,
          platform: defaultPlatform,
          values: updateValues,
          fieldsToRemove,
        });
      } else {
        await managedAuthHandler.upsertUserManagedAuthValues({
          rcAccountId,
          platform: defaultPlatform,
          rcExtensionId,
          rcUserName: 'Mutation Agent',
          values: initialValues,
        });
        await managedAuthHandler.upsertUserManagedAuthValues({
          rcAccountId,
          platform: defaultPlatform,
          rcExtensionId,
          values: updateValues,
          fieldsToRemove,
        });
      }

      const settings = await managedAuthHandler.getManagedAuthAdminSettings({
        platform: defaultPlatform,
        rcAccountId,
      });
      const actualValues = scope === 'account'
        ? settings.orgValues
        : settings.userValues[0].fields;
      expect(actualValues).toEqual(expectedAdminValues);
    });

    test.each(managedAuthIsolationCases)('$label', async (...args: any[]) => {
      const { records, lookup, expectedAdditionalInfo } = args[0];
      mockManifest(managedAuthIsolationFields);
      for (const record of records) {
        if (record.scope === 'account') {
          await managedAuthHandler.upsertOrgManagedAuthValues({
            rcAccountId: record.rcAccountId,
            platform: record.platform,
            values: record.values,
          });
        } else {
          await managedAuthHandler.upsertUserManagedAuthValues({
            rcAccountId: record.rcAccountId,
            platform: record.platform,
            rcExtensionId: record.rcExtensionId,
            rcUserName: `Agent ${record.rcExtensionId}`,
            values: record.values,
          });
        }
      }

      const result = await managedAuthHandler.resolveApiKeyLoginFields({
        ...lookup,
        additionalInfo: {},
      });

      expect(result).toEqual({
        resolvedAdditionalInfo: expectedAdditionalInfo,
        resolvedApiKey: expectedAdditionalInfo.apiKey,
        missingRequiredFieldConsts: [],
      });
    });
  });

  test('persistSubmittedManagedValues stores account and user submissions and ignores a missing account id', async () => {
    const fields = [
      { const: 'tenantId', managed: true, managedScope: 'account' },
      { const: 'apiKey', managed: true, managedScope: 'user' },
    ];
    mockManifest(fields);

    await managedAuthHandler.persistSubmittedManagedValues({
      platform: defaultPlatform,
      rcAccountId: 'persist-account',
      rcExtensionId: '701',
      rcUserName: 'Agent 701',
      submittedManagedValues: {
        org: { tenantId: 'tenant-persisted' },
        user: { apiKey: 'key-persisted' },
      },
    });
    await managedAuthHandler.persistSubmittedManagedValues({
      platform: defaultPlatform,
      rcExtensionId: '702',
      submittedManagedValues: {
        org: { tenantId: 'ignored-without-account' },
      },
    });

    const settings = await managedAuthHandler.getManagedAuthAdminSettings({
      platform: defaultPlatform,
      rcAccountId: 'persist-account',
    });
    expect(settings.orgValues.tenantId.value).toBe('tenant-persisted');
    expect(settings.userValues[0].fields.apiKey.value).toBe('key-persisted');
    await expect(AccountDataModel.count()).resolves.toBe(2);
  });

  test('getApiKeyFieldDefinitions returns no fields for missing platforms or manifest lookup failures', async () => {
    await expect(managedAuthHandler.getApiKeyFieldDefinitions({
      platform: '',
      rcAccountId: 'definitions-empty-account',
    })).resolves.toEqual([]);

    connectorRegistry.getManifest.mockImplementationOnce(() => {
      throw new Error('manifest unavailable');
    });

    await expect(managedAuthHandler.getApiKeyFieldDefinitions({
      platform: defaultPlatform,
      rcAccountId: 'definitions-error-account',
    })).resolves.toEqual([]);
  });

  test('upsertUserManagedAuthValues requires an RC extension id', async () => {
    await expect(managedAuthHandler.upsertUserManagedAuthValues({
      rcAccountId: 'missing-extension-account',
      platform: defaultPlatform,
      values: { apiKey: 'key' },
    })).rejects.toThrow('rcExtensionId is required for user managed auth values');
  });
});

export {};
