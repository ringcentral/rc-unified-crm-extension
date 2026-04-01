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

const sharedAuthHandler = require('../../handlers/sharedAuth');
const connectorRegistry = require('../../connector/registry');
const developerPortal = require('../../connector/developerPortal');
const { AccountDataModel } = require('../../models/accountDataModel');
const { sequelize } = require('../../models/sequelize');

describe('Shared Auth Handler', () => {
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

  test('getSharedAuthState reports all required fields satisfied when shared values exist', async () => {
    connectorRegistry.getManifest.mockReturnValue({
      platforms: {
        testCRM: {
          auth: {
            type: 'apiKey',
            apiKey: {
              page: {
                content: [
                  { const: 'tenantId', required: true, shared: true, sharedScope: 'org' },
                  { const: 'apiKey', required: true, shared: true, sharedScope: 'user' }
                ]
              }
            }
          }
        }
      }
    });

    await sharedAuthHandler.upsertOrgSharedAuthValues({
      rcAccountId: 'acc-1',
      platform: 'testCRM',
      values: { tenantId: 'tenant-1' }
    });
    await sharedAuthHandler.upsertUserSharedAuthValues({
      rcAccountId: 'acc-1',
      platform: 'testCRM',
      rcExtensionId: '101',
      rcUserName: 'Agent 101',
      values: { apiKey: 'user-api-key' }
    });

    const state = await sharedAuthHandler.getSharedAuthState({
      platform: 'testCRM',
      rcAccountId: 'acc-1',
      rcExtensionId: '101'
    });

    expect(state.hasSharedAuth).toBe(true);
    expect(state.allRequiredFieldsSatisfied).toBe(true);
    expect(state.visibleFieldConsts).toEqual([]);
  });

  test('getSharedAuthAdminSettings returns configured field values and keeps user records separate', async () => {
    connectorRegistry.getManifest.mockReturnValue({
      platforms: {
        testCRM: {
          auth: {
            type: 'apiKey',
            apiKey: {
              page: {
                content: [
                  { const: 'tenantId', shared: true, sharedScope: 'org', confidential: true },
                  { const: 'apiKey', shared: true, sharedScope: 'user', confidential: false }
                ]
              }
            }
          }
        }
      }
    });

    await sharedAuthHandler.upsertOrgSharedAuthValues({
      rcAccountId: 'acc-2',
      platform: 'testCRM',
      values: { tenantId: 'tenant-secret' }
    });
    await sharedAuthHandler.upsertUserSharedAuthValues({
      rcAccountId: 'acc-2',
      platform: 'testCRM',
      rcExtensionId: '102',
      rcUserName: 'Agent 102',
      values: { apiKey: 'user-key' }
    });

    const settings = await sharedAuthHandler.getSharedAuthAdminSettings({
      platform: 'testCRM',
      rcAccountId: 'acc-2'
    });

    expect(settings.orgValues.tenantId.hasValue).toBe(true);
    expect(settings.orgValues.tenantId.value).toBe('tenant-secret');
    expect(settings.orgValues.tenantId.confidential).toBe(false);
    expect(settings.userValues[0].rcExtensionId).toBe('102');
    expect(settings.userValues[0].fields.apiKey.value).toBe('user-key');
  });

  test('getSharedAuthState loads field definitions from Developer Portal when connectorId is provided', async () => {
    developerPortal.getConnectorManifest.mockResolvedValue({
      platforms: {
        testCRM: {
          auth: {
            type: 'apiKey',
            apiKey: {
              page: {
                content: [
                  { const: 'orgToken', required: true, shared: true, sharedScope: 'org' }
                ]
              }
            }
          }
        }
      }
    });

    await sharedAuthHandler.upsertOrgSharedAuthValues({
      rcAccountId: 'acc-3',
      platform: 'testCRM',
      values: { orgToken: 'portal-token' }
    });

    const state = await sharedAuthHandler.getSharedAuthState({
      platform: 'testCRM',
      connectorId: 'connector-123',
      rcAccountId: 'acc-3'
    });

    expect(developerPortal.getConnectorManifest).toHaveBeenCalledWith({ connectorId: 'connector-123', isPrivate: false });
    expect(state.hasSharedAuth).toBe(true);
    expect(state.allRequiredFieldsSatisfied).toBe(true);
    expect(state.visibleFieldConsts).toEqual([]);
  });

  test('getSharedAuthState surfaces missing required fields for unshared and missing shared values', async () => {
    connectorRegistry.getManifest.mockReturnValue({
      platforms: {
        testCRM: {
          auth: {
            type: 'apiKey',
            apiKey: {
              page: {
                content: [
                  { const: 'tenantId', required: true, shared: true, sharedScope: 'org' },
                  { const: 'userToken', required: true, shared: true, sharedScope: 'user' },
                  { const: 'apiSecret', required: true }
                ]
              }
            }
          }
        }
      }
    });

    await sharedAuthHandler.upsertOrgSharedAuthValues({
      rcAccountId: 'acc-4',
      platform: 'testCRM',
      values: { tenantId: 'tenant-4' }
    });

    const state = await sharedAuthHandler.getSharedAuthState({
      platform: 'testCRM',
      rcAccountId: 'acc-4',
      rcExtensionId: '404'
    });

    expect(state.hasSharedAuth).toBe(true);
    expect(state.allRequiredFieldsSatisfied).toBe(false);
    expect(state.visibleFieldConsts).toEqual(['apiSecret']);
    expect(state.missingRequiredFieldConsts).toEqual(['userToken', 'apiSecret']);
  });

  test('getSharedAuthState returns full-form behavior when connector has no shared fields', async () => {
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

    const state = await sharedAuthHandler.getSharedAuthState({
      platform: 'testCRM',
      rcAccountId: 'acc-plain',
      rcExtensionId: '100'
    });

    expect(state.hasSharedAuth).toBe(false);
    expect(state.allRequiredFieldsSatisfied).toBe(false);
    expect(state.visibleFieldConsts).toBeNull();
    expect(state.missingRequiredFieldConsts).toEqual(['apiKey', 'tenantId']);
  });

  test('upsertUserSharedAuthValues throws when rcExtensionId is missing', async () => {
    await expect(sharedAuthHandler.upsertUserSharedAuthValues({
      rcAccountId: 'acc-5',
      platform: 'testCRM',
      values: { apiKey: 'x' }
    })).rejects.toThrow('rcExtensionId is required for user shared auth values');
  });

  test('upsertOrgSharedAuthValues removes specified fields', async () => {
    connectorRegistry.getManifest.mockReturnValue({
      platforms: {
        testCRM: {
          auth: {
            type: 'apiKey',
            apiKey: {
              page: {
                content: [
                  { const: 'tenantId', shared: true, sharedScope: 'org' },
                  { const: 'region', shared: true, sharedScope: 'org' }
                ]
              }
            }
          }
        }
      }
    });

    await sharedAuthHandler.upsertOrgSharedAuthValues({
      rcAccountId: 'acc-6',
      platform: 'testCRM',
      values: { tenantId: 'tenant-6', region: 'us' }
    });

    await sharedAuthHandler.upsertOrgSharedAuthValues({
      rcAccountId: 'acc-6',
      platform: 'testCRM',
      values: {},
      fieldsToRemove: ['tenantId']
    });

    const settings = await sharedAuthHandler.getSharedAuthAdminSettings({
      platform: 'testCRM',
      rcAccountId: 'acc-6'
    });
    expect(settings.orgValues.tenantId.hasValue).toBe(false);
    expect(settings.orgValues.region.value).toBe('us');

    const record = await AccountDataModel.findOne({
      where: {
        rcAccountId: 'acc-6',
        platformName: 'testCRM',
        dataKey: 'shared-auth-org'
      }
    });
    expect(record.data.fields.tenantId).toBeUndefined();
    expect(record.data.fields.region).toBeDefined();
  });
});
