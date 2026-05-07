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
  getConnectorManifest: jest.fn()
}));

const managedAuthHandler = require('../../handlers/managedAuth');
const connectorRegistry = require('../../connector/registry');
const developerPortal = require('../../connector/developerPortal');
const { AccountDataModel } = require('../../models/accountDataModel');
const { sequelize } = require('../../models/sequelize');

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

  test('getManagedAuthState reports all required fields satisfied when shared values exist', async () => {
    connectorRegistry.getManifest.mockReturnValue({
      platforms: {
        testCRM: {
          auth: {
            type: 'apiKey',
            apiKey: {
              page: {
                content: [
                  { const: 'tenantId', required: true, managed: true, managedScope: 'account' },
                  { const: 'apiKey', required: true, managed: true, managedScope: 'user' }
                ]
              }
            }
          }
        }
      }
    });

    await managedAuthHandler.upsertOrgManagedAuthValues({
      rcAccountId: 'acc-1',
      platform: 'testCRM',
      values: { tenantId: 'tenant-1' }
    });
    await managedAuthHandler.upsertUserManagedAuthValues({
      rcAccountId: 'acc-1',
      platform: 'testCRM',
      rcExtensionId: '101',
      rcUserName: 'Agent 101',
      values: { apiKey: 'user-api-key' }
    });

    const state = await managedAuthHandler.getManagedAuthState({
      platform: 'testCRM',
      rcAccountId: 'acc-1',
      rcExtensionId: '101'
    });

    expect(state.hasManagedAuth).toBe(true);
    expect(state.allRequiredFieldsSatisfied).toBe(true);
    expect(state.visibleFieldConsts).toEqual([]);
  });

  test('getManagedAuthAdminSettings returns configured field values and keeps user records separate', async () => {
    connectorRegistry.getManifest.mockReturnValue({
      platforms: {
        testCRM: {
          auth: {
            type: 'apiKey',
            apiKey: {
              page: {
                content: [
                  { const: 'tenantId', managed: true, managedScope: 'account' },
                  { const: 'apiKey', managed: true, managedScope: 'user' }
                ]
              }
            }
          }
        }
      }
    });

    await managedAuthHandler.upsertOrgManagedAuthValues({
      rcAccountId: 'acc-2',
      platform: 'testCRM',
      values: { tenantId: 'tenant-secret' }
    });
    await managedAuthHandler.upsertUserManagedAuthValues({
      rcAccountId: 'acc-2',
      platform: 'testCRM',
      rcExtensionId: '102',
      rcUserName: 'Agent 102',
      values: { apiKey: 'user-key' }
    });

    const settings = await managedAuthHandler.getManagedAuthAdminSettings({
      platform: 'testCRM',
      rcAccountId: 'acc-2'
    });

    expect(settings.orgValues.tenantId.hasValue).toBe(true);
    expect(settings.orgValues.tenantId.value).toBe('tenant-secret');
    expect(settings.userValues[0].rcExtensionId).toBe('102');
    expect(settings.userValues[0].fields.apiKey.value).toBe('user-key');
  });

  test('upsertUserManagedAuthValues stores one row per extension with scoped dataKey', async () => {
    await managedAuthHandler.upsertUserManagedAuthValues({
      rcAccountId: 'acc-scope',
      platform: 'testCRM',
      rcExtensionId: '201',
      rcUserName: 'Agent 201',
      values: { apiKey: 'key-201' }
    });
    await managedAuthHandler.upsertUserManagedAuthValues({
      rcAccountId: 'acc-scope',
      platform: 'testCRM',
      rcExtensionId: '202',
      rcUserName: 'Agent 202',
      values: { apiKey: 'key-202' }
    });

    const records = await AccountDataModel.findAll({
      where: {
        rcAccountId: 'acc-scope',
        platformName: 'testCRM'
      }
    });
    const dataKeys = records.map(r => r.dataKey).sort();

    expect(dataKeys).toEqual(['managed-auth-user:201', 'managed-auth-user:202']);
    expect(records).toHaveLength(2);
  });

  test('getManagedAuthState loads field definitions from Developer Portal when connectorId is provided', async () => {
    developerPortal.getConnectorManifest.mockResolvedValue({
      platforms: {
        testCRM: {
          auth: {
            type: 'apiKey',
            apiKey: {
              page: {
                content: [
                  { const: 'orgToken', required: true, managed: true, managedScope: 'account' }
                ]
              }
            }
          }
        }
      }
    });

    await managedAuthHandler.upsertOrgManagedAuthValues({
      rcAccountId: 'acc-3',
      platform: 'testCRM',
      values: { orgToken: 'portal-token' }
    });

    const state = await managedAuthHandler.getManagedAuthState({
      platform: 'testCRM',
      connectorId: 'connector-123',
      rcAccountId: 'acc-3'
    });

    expect(developerPortal.getConnectorManifest).toHaveBeenCalledWith({ rcAccountId: 'acc-3', connectorId: 'connector-123', isPrivate: false });
    expect(state.hasManagedAuth).toBe(true);
    expect(state.allRequiredFieldsSatisfied).toBe(true);
    expect(state.visibleFieldConsts).toEqual([]);
  });

  test('getManagedAuthState surfaces missing required fields for unshared and missing shared values', async () => {
    connectorRegistry.getManifest.mockReturnValue({
      platforms: {
        testCRM: {
          auth: {
            type: 'apiKey',
            apiKey: {
              page: {
                content: [
                  { const: 'tenantId', required: true, managed: true, managedScope: 'account' },
                  { const: 'userToken', required: true, managed: true, managedScope: 'user' },
                  { const: 'apiSecret', required: true }
                ]
              }
            }
          }
        }
      }
    });

    await managedAuthHandler.upsertOrgManagedAuthValues({
      rcAccountId: 'acc-4',
      platform: 'testCRM',
      values: { tenantId: 'tenant-4' }
    });

    const state = await managedAuthHandler.getManagedAuthState({
      platform: 'testCRM',
      rcAccountId: 'acc-4',
      rcExtensionId: '404'
    });

    expect(state.hasManagedAuth).toBe(true);
    expect(state.allRequiredFieldsSatisfied).toBe(false);
    expect(state.visibleFieldConsts).toEqual(['userToken', 'apiSecret']);
    expect(state.missingRequiredFieldConsts).toEqual(['userToken', 'apiSecret']);
  });

  test('getManagedAuthState returns full-form behavior when connector has no shared fields', async () => {
    connectorRegistry.getManifest.mockReturnValue({
      platforms: {
        testCRM: {
          auth: {
            type: 'apiKey',
            apiKey: {
              page: {
                content: [
                  { const: 'apiKey', required: true },
                  { const: 'tenantId', required: true },
                  { const: 'region', required: false }
                ]
              }
            }
          }
        }
      }
    });

    const state = await managedAuthHandler.getManagedAuthState({
      platform: 'testCRM',
      rcAccountId: 'acc-plain',
      rcExtensionId: '100'
    });

    expect(state.hasManagedAuth).toBe(false);
    expect(state.allRequiredFieldsSatisfied).toBe(false);
    expect(state.visibleFieldConsts).toBeNull();
    expect(state.missingRequiredFieldConsts).toEqual(['apiKey', 'tenantId']);
  });

  test('getManagedAuthState falls back to the full auth form after managed auto-login fails', async () => {
    connectorRegistry.getManifest.mockReturnValue({
      platforms: {
        testCRM: {
          auth: {
            type: 'apiKey',
            apiKey: {
              page: {
                content: [
                  { const: 'tenantId', required: true, managed: true, managedScope: 'account' },
                  { const: 'apiKey', required: true, managed: true, managedScope: 'user' },
                  { const: 'region', required: false }
                ]
              }
            }
          }
        }
      }
    });

    await managedAuthHandler.upsertOrgManagedAuthValues({
      rcAccountId: 'acc-fallback',
      platform: 'testCRM',
      values: { tenantId: 'tenant-1' }
    });
    await managedAuthHandler.upsertUserManagedAuthValues({
      rcAccountId: 'acc-fallback',
      platform: 'testCRM',
      rcExtensionId: '501',
      rcUserName: 'Agent 501',
      values: { apiKey: 'bad-key' }
    });
    await managedAuthHandler.markManagedAuthLoginFailure({
      rcAccountId: 'acc-fallback',
      platform: 'testCRM',
      rcExtensionId: '501'
    });

    const state = await managedAuthHandler.getManagedAuthState({
      platform: 'testCRM',
      rcAccountId: 'acc-fallback',
      rcExtensionId: '501'
    });

    expect(state.hasManagedAuth).toBe(true);
    expect(state.allRequiredFieldsSatisfied).toBe(false);
    expect(state.visibleFieldConsts).toBeNull();
    expect(state.missingRequiredFieldConsts).toEqual(['tenantId', 'apiKey']);
    expect(state.fallbackToManualAuth).toBe(true);
  });

  test('resolveApiKeyLoginFields keeps submitted shared values when managed values are missing', async () => {
    connectorRegistry.getManifest.mockReturnValue({
      platforms: {
        testCRM: {
          auth: {
            type: 'apiKey',
            apiKey: {
              page: {
                content: [
                  { const: 'companyId', required: true, managed: true, managedScope: 'account' },
                  { const: 'userToken', required: true, managed: true, managedScope: 'user' },
                  { const: 'region', required: false, managed: true, managedScope: 'account' }
                ]
              }
            }
          }
        }
      }
    });

    const result = await managedAuthHandler.resolveApiKeyLoginFields({
      platform: 'testCRM',
      rcAccountId: 'acc-shared-fallback',
      rcExtensionId: '201',
      additionalInfo: {
        companyId: 'company-123',
        userToken: 'user-token-123',
        region: 'us'
      }
    });

    expect(result.resolvedAdditionalInfo).toEqual({
      companyId: 'company-123',
      userToken: 'user-token-123',
      region: 'us'
    });
    expect(result.missingRequiredFieldConsts).toEqual([]);
  });

  test('resolveApiKeyLoginFields prefers submitted managed values during manual fallback', async () => {
    connectorRegistry.getManifest.mockReturnValue({
      platforms: {
        testCRM: {
          auth: {
            type: 'apiKey',
            apiKey: {
              page: {
                content: [
                  { const: 'companyId', required: true, managed: true, managedScope: 'account' },
                  { const: 'apiKey', required: true, managed: true, managedScope: 'user' }
                ]
              }
            }
          }
        }
      }
    });

    await managedAuthHandler.upsertOrgManagedAuthValues({
      rcAccountId: 'acc-override',
      platform: 'testCRM',
      values: { companyId: 'stored-company' }
    });
    await managedAuthHandler.upsertUserManagedAuthValues({
      rcAccountId: 'acc-override',
      platform: 'testCRM',
      rcExtensionId: '777',
      rcUserName: 'Agent 777',
      values: { apiKey: 'stored-key' }
    });

    const result = await managedAuthHandler.resolveApiKeyLoginFields({
      platform: 'testCRM',
      rcAccountId: 'acc-override',
      rcExtensionId: '777',
      additionalInfo: {
        companyId: 'manual-company',
        apiKey: 'manual-key'
      },
      preferSubmittedValuesForManagedFields: true
    });

    expect(result.resolvedAdditionalInfo).toEqual({
      companyId: 'manual-company',
      apiKey: 'manual-key'
    });
    expect(result.resolvedApiKey).toBe('manual-key');
    expect(result.missingRequiredFieldConsts).toEqual([]);
  });

  test('upsertUserManagedAuthValues throws when rcExtensionId is missing', async () => {
    await expect(managedAuthHandler.upsertUserManagedAuthValues({
      rcAccountId: 'acc-5',
      platform: 'testCRM',
      values: { apiKey: 'x' }
    })).rejects.toThrow('rcExtensionId is required for user managed auth values');
  });

  test('upsertOrgManagedAuthValues removes specified fields', async () => {
    connectorRegistry.getManifest.mockReturnValue({
      platforms: {
        testCRM: {
          auth: {
            type: 'apiKey',
            apiKey: {
              page: {
                content: [
                  { const: 'tenantId', managed: true, managedScope: 'account' },
                  { const: 'region', managed: true, managedScope: 'account' }
                ]
              }
            }
          }
        }
      }
    });

    await managedAuthHandler.upsertOrgManagedAuthValues({
      rcAccountId: 'acc-6',
      platform: 'testCRM',
      values: { tenantId: 'tenant-6', region: 'us' }
    });

    await managedAuthHandler.upsertOrgManagedAuthValues({
      rcAccountId: 'acc-6',
      platform: 'testCRM',
      values: {},
      fieldsToRemove: ['tenantId']
    });

    const settings = await managedAuthHandler.getManagedAuthAdminSettings({
      platform: 'testCRM',
      rcAccountId: 'acc-6'
    });
    expect(settings.orgValues.tenantId.hasValue).toBe(false);
    expect(settings.orgValues.region.value).toBe('us');

    const record = await AccountDataModel.findOne({
      where: {
        rcAccountId: 'acc-6',
        platformName: 'testCRM',
        dataKey: 'managed-auth-org'
      }
    });
    expect(record.data.fields.tenantId).toBeUndefined();
    expect(record.data.fields.region).toBeDefined();
  });
});

