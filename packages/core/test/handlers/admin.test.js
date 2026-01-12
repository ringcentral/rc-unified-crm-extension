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

jest.mock('axios');
jest.mock('../../connector/registry');
jest.mock('../../lib/oauth');
jest.mock('../../lib/ringcentral');
jest.mock('../../models/dynamo/connectorSchema', () => ({
  Connector: {
    getProxyConfig: jest.fn()
  }
}));

const axios = require('axios');
const adminHandler = require('../../handlers/admin');
const { AdminConfigModel } = require('../../models/adminConfigModel');
const { UserModel } = require('../../models/userModel');
const connectorRegistry = require('../../connector/registry');
const oauth = require('../../lib/oauth');
const { RingCentral } = require('../../lib/ringcentral');
const { Connector } = require('../../models/dynamo/connectorSchema');
const { sequelize } = require('../../models/sequelize');

describe('Admin Handler', () => {
  beforeAll(async () => {
    await AdminConfigModel.sync({ force: true });
    await UserModel.sync({ force: true });
  });

  afterEach(async () => {
    await AdminConfigModel.destroy({ where: {} });
    await UserModel.destroy({ where: {} });
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await sequelize.close();
  });

  describe('validateAdminRole', () => {
    test('should return validated true when user has admin permissions', async () => {
      // Arrange
      axios.get.mockResolvedValue({
        data: {
          permissions: {
            admin: { enabled: true }
          },
          account: { id: 'rc-account-123' },
          id: 'extension-123'
        }
      });

      // Act
      const result = await adminHandler.validateAdminRole({
        rcAccessToken: 'valid-token'
      });

      // Assert
      expect(result.isValidated).toBe(true);
      expect(result.rcAccountId).toBe('rc-account-123');
      expect(axios.get).toHaveBeenCalledWith(
        'https://platform.ringcentral.com/restapi/v1.0/account/~/extension/~',
        { headers: { Authorization: 'Bearer valid-token' } }
      );
    });

    test('should return validated false when user lacks admin permissions', async () => {
      // Arrange
      axios.get.mockResolvedValue({
        data: {
          permissions: {
            admin: { enabled: false }
          },
          account: { id: 'rc-account-456' },
          id: 'extension-456'
        }
      });

      // Act
      const result = await adminHandler.validateAdminRole({
        rcAccessToken: 'non-admin-token'
      });

      // Assert
      expect(result.isValidated).toBe(false);
      expect(result.rcAccountId).toBe('rc-account-456');
    });

    test('should return validated true for dev pass list extension', async () => {
      // Arrange
      const originalEnv = process.env.ADMIN_EXTENSION_ID_DEV_PASS_LIST;
      process.env.ADMIN_EXTENSION_ID_DEV_PASS_LIST = '999,1000,1001';

      axios.get.mockResolvedValue({
        data: {
          permissions: {
            admin: { enabled: false }
          },
          account: { id: 'rc-account-dev' },
          id: 1000
        }
      });

      // Act
      const result = await adminHandler.validateAdminRole({
        rcAccessToken: 'dev-token'
      });

      // Assert
      expect(result.isValidated).toBe(true);

      // Cleanup
      process.env.ADMIN_EXTENSION_ID_DEV_PASS_LIST = originalEnv;
    });
  });

  describe('upsertAdminSettings', () => {
    test('should create new admin config when none exists', async () => {
      // Act
      await adminHandler.upsertAdminSettings({
        hashedRcAccountId: 'hashed-123',
        adminSettings: {
          userSettings: { autoLogCalls: true, autoLogMessages: false }
        }
      });

      // Assert
      const config = await AdminConfigModel.findByPk('hashed-123');
      expect(config).not.toBeNull();
      expect(config.userSettings).toEqual({ autoLogCalls: true, autoLogMessages: false });
    });

    test('should update existing admin config', async () => {
      // Arrange
      await AdminConfigModel.create({
        id: 'hashed-existing',
        userSettings: { autoLogCalls: false, autoLogMessages: true }
      });

      // Act
      await adminHandler.upsertAdminSettings({
        hashedRcAccountId: 'hashed-existing',
        adminSettings: {
          userSettings: { autoLogCalls: true, autoLogMessages: false }
        }
      });

      // Assert
      const config = await AdminConfigModel.findByPk('hashed-existing');
      expect(config.userSettings).toEqual({ autoLogCalls: true, autoLogMessages: false });
    });
  });

  describe('getAdminSettings', () => {
    test('should return admin settings when they exist', async () => {
      // Arrange
      await AdminConfigModel.create({
        id: 'hashed-get-test',
        userSettings: { autoLogCalls: true, autoLogMessages: true }
      });

      // Act
      const result = await adminHandler.getAdminSettings({
        hashedRcAccountId: 'hashed-get-test'
      });

      // Assert
      expect(result).not.toBeNull();
      expect(result.userSettings).toEqual({ autoLogCalls: true, autoLogMessages: true });
    });

    test('should return null when settings do not exist', async () => {
      // Act
      const result = await adminHandler.getAdminSettings({
        hashedRcAccountId: 'non-existent'
      });

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('updateAdminRcTokens', () => {
    test('should update tokens for existing config', async () => {
      // Arrange
      await AdminConfigModel.create({
        id: 'hashed-token-test',
        adminAccessToken: 'old-access',
        adminRefreshToken: 'old-refresh',
        adminTokenExpiry: new Date('2024-01-01')
      });

      const newExpiry = new Date('2024-12-31');

      // Act
      await adminHandler.updateAdminRcTokens({
        hashedRcAccountId: 'hashed-token-test',
        adminAccessToken: 'new-access',
        adminRefreshToken: 'new-refresh',
        adminTokenExpiry: newExpiry
      });

      // Assert
      const config = await AdminConfigModel.findByPk('hashed-token-test');
      expect(config.adminAccessToken).toBe('new-access');
      expect(config.adminRefreshToken).toBe('new-refresh');
    });

    test('should create new config with tokens when none exists', async () => {
      // Arrange
      const expiry = new Date('2024-12-31');

      // Act
      await adminHandler.updateAdminRcTokens({
        hashedRcAccountId: 'hashed-new-token',
        adminAccessToken: 'new-access-token',
        adminRefreshToken: 'new-refresh-token',
        adminTokenExpiry: expiry
      });

      // Assert
      const config = await AdminConfigModel.findByPk('hashed-new-token');
      expect(config).not.toBeNull();
      expect(config.adminAccessToken).toBe('new-access-token');
      expect(config.adminRefreshToken).toBe('new-refresh-token');
    });
  });

  describe('getServerLoggingSettings', () => {
    test('should return settings from platform module when available', async () => {
      // Arrange
      const mockUser = { platform: 'testCRM', accessToken: 'token' };
      const mockSettings = { enableAutoLog: true, logLevel: 'debug' };

      const mockConnector = {
        getServerLoggingSettings: jest.fn().mockResolvedValue(mockSettings)
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      // Act
      const result = await adminHandler.getServerLoggingSettings({ user: mockUser });

      // Assert
      expect(result).toEqual(mockSettings);
      expect(mockConnector.getServerLoggingSettings).toHaveBeenCalledWith({ user: mockUser });
    });

    test('should return empty object when platform module lacks getServerLoggingSettings', async () => {
      // Arrange
      const mockUser = { platform: 'testCRM', accessToken: 'token' };

      const mockConnector = {};
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      // Act
      const result = await adminHandler.getServerLoggingSettings({ user: mockUser });

      // Assert
      expect(result).toEqual({});
    });
  });

  describe('updateServerLoggingSettings', () => {
    test('should update settings via platform module when available', async () => {
      // Arrange
      const mockUser = { platform: 'testCRM', accessToken: 'token' };
      const additionalFieldValues = { field1: 'value1' };

      const mockConnector = {
        getOauthInfo: jest.fn().mockResolvedValue({
          clientId: 'id',
          clientSecret: 'secret',
          accessTokenUri: 'https://token.url'
        }),
        updateServerLoggingSettings: jest.fn().mockResolvedValue({
          successful: true,
          returnMessage: { message: 'Settings updated' }
        })
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);
      oauth.getOAuthApp.mockReturnValue({});

      // Act
      const result = await adminHandler.updateServerLoggingSettings({
        user: mockUser,
        additionalFieldValues
      });

      // Assert
      expect(result.successful).toBe(true);
      expect(mockConnector.updateServerLoggingSettings).toHaveBeenCalled();
    });

    test('should return empty object when platform module lacks updateServerLoggingSettings', async () => {
      // Arrange
      const mockUser = { platform: 'testCRM', accessToken: 'token' };

      const mockConnector = {
        getOauthInfo: jest.fn().mockResolvedValue({})
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);
      oauth.getOAuthApp.mockReturnValue({});

      // Act
      const result = await adminHandler.updateServerLoggingSettings({
        user: mockUser,
        additionalFieldValues: {}
      });

      // Assert
      expect(result).toEqual({});
    });
  });

  describe('getAdminReport', () => {
    test('should return empty stats when RC credentials are not configured', async () => {
      // Arrange
      const originalServer = process.env.RINGCENTRAL_SERVER;
      delete process.env.RINGCENTRAL_SERVER;

      // Act
      const result = await adminHandler.getAdminReport({
        rcAccountId: 'account-123',
        timezone: 'America/Los_Angeles',
        timeFrom: '2024-01-01',
        timeTo: '2024-01-31',
        groupBy: 'Users'
      });

      // Assert
      expect(result).toEqual({ callLogStats: {} });

      // Cleanup
      if (originalServer) {
        process.env.RINGCENTRAL_SERVER = originalServer;
      }
    });

    test('should handle errors and return empty stats', async () => {
      // Arrange
      const originalServer = process.env.RINGCENTRAL_SERVER;
      const originalClientId = process.env.RINGCENTRAL_CLIENT_ID;
      const originalClientSecret = process.env.RINGCENTRAL_CLIENT_SECRET;

      process.env.RINGCENTRAL_SERVER = 'https://platform.ringcentral.com';
      process.env.RINGCENTRAL_CLIENT_ID = 'test-client-id';
      process.env.RINGCENTRAL_CLIENT_SECRET = 'test-client-secret';

      // Mock AdminConfigModel.findByPk to throw error
      jest.spyOn(AdminConfigModel, 'findByPk').mockRejectedValueOnce(new Error('Database error'));

      // Act
      const result = await adminHandler.getAdminReport({
        rcAccountId: 'account-123',
        timezone: 'America/Los_Angeles',
        timeFrom: '2024-01-01',
        timeTo: '2024-01-31',
        groupBy: 'Users'
      });

      // Assert
      expect(result).toEqual({ callLogStats: {} });

      // Cleanup
      process.env.RINGCENTRAL_SERVER = originalServer;
      process.env.RINGCENTRAL_CLIENT_ID = originalClientId;
      process.env.RINGCENTRAL_CLIENT_SECRET = originalClientSecret;
    });
  });

  describe('getUserReport', () => {
    test('should return empty stats when RC credentials are not configured', async () => {
      // Arrange
      const originalServer = process.env.RINGCENTRAL_SERVER;
      delete process.env.RINGCENTRAL_SERVER;

      // Act
      const result = await adminHandler.getUserReport({
        rcAccountId: 'account-123',
        rcExtensionId: 'extension-123',
        timezone: 'America/Los_Angeles',
        timeFrom: '2024-01-01',
        timeTo: '2024-01-31'
      });

      // Assert
      expect(result).toEqual({ callLogStats: {} });

      // Cleanup
      if (originalServer) {
        process.env.RINGCENTRAL_SERVER = originalServer;
      }
    });

    test('should handle errors and return null', async () => {
      // Arrange
      const originalServer = process.env.RINGCENTRAL_SERVER;
      const originalClientId = process.env.RINGCENTRAL_CLIENT_ID;
      const originalClientSecret = process.env.RINGCENTRAL_CLIENT_SECRET;

      process.env.RINGCENTRAL_SERVER = 'https://platform.ringcentral.com';
      process.env.RINGCENTRAL_CLIENT_ID = 'test-client-id';
      process.env.RINGCENTRAL_CLIENT_SECRET = 'test-client-secret';

      // Mock AdminConfigModel.findByPk to throw error
      jest.spyOn(AdminConfigModel, 'findByPk').mockRejectedValueOnce(new Error('Database error'));

      // Act
      const result = await adminHandler.getUserReport({
        rcAccountId: 'account-123',
        rcExtensionId: 'extension-123',
        timezone: 'America/Los_Angeles',
        timeFrom: '2024-01-01',
        timeTo: '2024-01-31'
      });

      // Assert
      expect(result).toBeNull();

      // Cleanup
      process.env.RINGCENTRAL_SERVER = originalServer;
      process.env.RINGCENTRAL_CLIENT_ID = originalClientId;
      process.env.RINGCENTRAL_CLIENT_SECRET = originalClientSecret;
    });
  });

  describe('getUserMapping', () => {
    test('should return empty array when platform module lacks getUserList', async () => {
      // Arrange
      await UserModel.create({
        id: 'test-user-id',
        platform: 'testCRM',
        accessToken: 'token',
        platformAdditionalInfo: {}
      });

      const mockConnector = {};
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      // Act
      const result = await adminHandler.getUserMapping({
        user: { id: 'test-user-id', platform: 'testCRM', platformAdditionalInfo: {} },
        hashedRcAccountId: 'hashed-123',
        rcExtensionList: []
      });

      // Assert
      expect(result).toEqual([]);
    });

    test('should return empty array when proxy config lacks getUserList operation', async () => {
      // Arrange
      const user = {
        id: 'test-user-id',
        platform: 'testCRM',
        accessToken: 'token',
        platformAdditionalInfo: { proxyId: 'proxy-123' }
      };

      Connector.getProxyConfig.mockResolvedValue({
        operations: {}
      });

      const mockConnector = {
        getUserList: jest.fn()
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      // Act
      const result = await adminHandler.getUserMapping({
        user,
        hashedRcAccountId: 'hashed-123',
        rcExtensionList: []
      });

      // Assert
      expect(result).toEqual([]);
    });

    test('should map CRM users to RC extensions', async () => {
      // Arrange
      await AdminConfigModel.create({
        id: 'hashed-mapping',
        userMappings: []
      });

      const user = {
        id: 'test-user-id',
        platform: 'testCRM',
        accessToken: 'token',
        platformAdditionalInfo: {}
      };

      const crmUsers = [
        { id: 'crm-user-1', name: 'John Doe', email: 'john@example.com' },
        { id: 'crm-user-2', name: 'Jane Smith', email: 'jane@example.com' }
      ];

      const rcExtensions = [
        { id: 'ext-1', firstName: 'John', lastName: 'Doe', email: 'john@example.com', extensionNumber: '101' },
        { id: 'ext-2', firstName: 'Bob', lastName: 'Wilson', email: 'bob@example.com', extensionNumber: '102' }
      ];

      const mockConnector = {
        getAuthType: jest.fn().mockResolvedValue('apiKey'),
        getBasicAuth: jest.fn().mockReturnValue('base64'),
        getUserList: jest.fn().mockResolvedValue(crmUsers)
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      // Act
      const result = await adminHandler.getUserMapping({
        user,
        hashedRcAccountId: 'hashed-mapping',
        rcExtensionList: rcExtensions
      });

      // Assert
      expect(result).toHaveLength(2);
      // John should be matched by email
      const johnMapping = result.find(m => m.crmUser.id === 'crm-user-1');
      expect(johnMapping.rcUser).toHaveLength(1);
      expect(johnMapping.rcUser[0].extensionId).toBe('ext-1');

      // Jane should not be matched
      const janeMapping = result.find(m => m.crmUser.id === 'crm-user-2');
      expect(janeMapping.rcUser).toHaveLength(0);
    });

    test('should preserve existing mappings', async () => {
      // Arrange
      await AdminConfigModel.create({
        id: 'hashed-existing-mapping',
        userMappings: [
          { crmUserId: 'crm-user-1', rcExtensionId: ['ext-existing'] }
        ]
      });

      const user = {
        id: 'test-user-id',
        platform: 'testCRM',
        accessToken: 'token',
        platformAdditionalInfo: {}
      };

      const crmUsers = [
        { id: 'crm-user-1', name: 'John Doe', email: 'john@example.com' }
      ];

      const rcExtensions = [
        { id: 'ext-existing', firstName: 'John', lastName: 'Doe', email: 'john@example.com', extensionNumber: '101' }
      ];

      const mockConnector = {
        getAuthType: jest.fn().mockResolvedValue('apiKey'),
        getBasicAuth: jest.fn().mockReturnValue('base64'),
        getUserList: jest.fn().mockResolvedValue(crmUsers)
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      // Act
      const result = await adminHandler.getUserMapping({
        user,
        hashedRcAccountId: 'hashed-existing-mapping',
        rcExtensionList: rcExtensions
      });

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].rcUser[0].extensionId).toBe('ext-existing');
    });
  });
});

