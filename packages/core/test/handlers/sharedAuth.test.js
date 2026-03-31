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

  test('getSharedAuthAdminSettings masks confidential fields and keeps user records separate', async () => {
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
    expect(settings.orgValues.tenantId.value).toBe('');
    expect(settings.orgValues.tenantId.maskedValue).toBe('********');
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
});
