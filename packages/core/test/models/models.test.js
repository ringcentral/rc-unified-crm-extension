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

const { CallLogModel } = require('../../models/callLogModel');
const { MessageLogModel } = require('../../models/messageLogModel');
const { UserModel } = require('../../models/userModel');
const { CacheModel } = require('../../models/cacheModel');
const { AdminConfigModel } = require('../../models/adminConfigModel');
const { sequelize } = require('../../models/sequelize');

describe('Core Models', () => {
  beforeAll(async () => {
    await CallLogModel.sync({ force: true });
    await MessageLogModel.sync({ force: true });
    await UserModel.sync({ force: true });
    await CacheModel.sync({ force: true });
    await AdminConfigModel.sync({ force: true });
  });

  afterEach(async () => {
    await CallLogModel.destroy({ where: {} });
    await MessageLogModel.destroy({ where: {} });
    await UserModel.destroy({ where: {} });
    await CacheModel.destroy({ where: {} });
    await AdminConfigModel.destroy({ where: {} });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  describe('UserModel', () => {
    test('should create user with required fields', async () => {
      // Arrange & Act
      const user = await UserModel.create({
        id: 'user-1',
        platform: 'testCRM',
        accessToken: 'token-123'
      });

      // Assert
      expect(user.id).toBe('user-1');
      expect(user.platform).toBe('testCRM');
      expect(user.accessToken).toBe('token-123');
    });

    test('should create user with all optional fields', async () => {
      // Arrange
      const tokenExpiry = new Date('2024-12-31');

      // Act
      const user = await UserModel.create({
        id: 'user-full',
        platform: 'testCRM',
        hostname: 'test.example.com',
        accessToken: 'token-123',
        refreshToken: 'refresh-123',
        tokenExpiry: tokenExpiry,
        rcAccountId: 'rc-account-123',
        timezoneOffset: '-08:00',
        timezoneName: 'America/Los_Angeles',
        platformAdditionalInfo: { customField: 'value' },
        userSettings: { autoLog: true }
      });

      // Assert
      expect(user.hostname).toBe('test.example.com');
      expect(user.refreshToken).toBe('refresh-123');
      expect(user.rcAccountId).toBe('rc-account-123');
      expect(user.platformAdditionalInfo).toEqual({ customField: 'value' });
      expect(user.userSettings).toEqual({ autoLog: true });
    });

    test('should find user by primary key', async () => {
      // Arrange
      await UserModel.create({
        id: 'user-find',
        platform: 'testCRM',
        accessToken: 'token'
      });

      // Act
      const user = await UserModel.findByPk('user-find');

      // Assert
      expect(user).not.toBeNull();
      expect(user.id).toBe('user-find');
    });

    test('should find user by platform and id', async () => {
      // Arrange
      await UserModel.create({
        id: 'user-platform',
        platform: 'testCRM',
        accessToken: 'token'
      });

      // Act
      const user = await UserModel.findOne({
        where: { id: 'user-platform', platform: 'testCRM' }
      });

      // Assert
      expect(user).not.toBeNull();
      expect(user.platform).toBe('testCRM');
    });

    test('should update user fields', async () => {
      // Arrange
      const user = await UserModel.create({
        id: 'user-update',
        platform: 'testCRM',
        accessToken: 'old-token'
      });

      // Act
      await user.update({ accessToken: 'new-token' });

      // Assert
      const updated = await UserModel.findByPk('user-update');
      expect(updated.accessToken).toBe('new-token');
    });

    test('should delete user', async () => {
      // Arrange
      await UserModel.create({
        id: 'user-delete',
        platform: 'testCRM',
        accessToken: 'token'
      });

      // Act
      await UserModel.destroy({ where: { id: 'user-delete' } });

      // Assert
      const user = await UserModel.findByPk('user-delete');
      expect(user).toBeNull();
    });
  });

  describe('CallLogModel', () => {
    test('should create call log with required fields', async () => {
      // Arrange & Act
      const log = await CallLogModel.create({
        id: 'call-1',
        sessionId: 'session-123',
        platform: 'testCRM',
        thirdPartyLogId: 'third-party-1',
        userId: 'user-1'
      });

      // Assert
      expect(log.id).toBe('call-1');
      expect(log.sessionId).toBe('session-123');
      expect(log.thirdPartyLogId).toBe('third-party-1');
    });

    test('should create call log with optional contactId', async () => {
      // Act
      const log = await CallLogModel.create({
        id: 'call-contact',
        sessionId: 'session-456',
        platform: 'testCRM',
        thirdPartyLogId: 'third-party-2',
        userId: 'user-1',
        contactId: 'contact-123'
      });

      // Assert
      expect(log.contactId).toBe('contact-123');
    });

    test('should find call logs by session ID', async () => {
      // Arrange
      await CallLogModel.create({
        id: 'call-session',
        sessionId: 'unique-session',
        platform: 'testCRM',
        thirdPartyLogId: 'third-party-3',
        userId: 'user-1'
      });

      // Act
      const log = await CallLogModel.findOne({
        where: { sessionId: 'unique-session' }
      });

      // Assert
      expect(log).not.toBeNull();
      expect(log.id).toBe('call-session');
    });

    test('should find multiple call logs by session IDs', async () => {
      // Arrange
      await CallLogModel.bulkCreate([
        { id: 'call-multi-1', sessionId: 'session-a', platform: 'testCRM', thirdPartyLogId: 'tp-1', userId: 'user-1' },
        { id: 'call-multi-2', sessionId: 'session-b', platform: 'testCRM', thirdPartyLogId: 'tp-2', userId: 'user-1' },
        { id: 'call-multi-3', sessionId: 'session-c', platform: 'testCRM', thirdPartyLogId: 'tp-3', userId: 'user-1' }
      ]);

      // Act
      const { Op } = require('sequelize');
      const logs = await CallLogModel.findAll({
        where: {
          sessionId: { [Op.in]: ['session-a', 'session-c'] }
        }
      });

      // Assert
      expect(logs).toHaveLength(2);
    });
  });

  describe('MessageLogModel', () => {
    test('should create message log with required fields', async () => {
      // Arrange & Act
      const log = await MessageLogModel.create({
        id: 'msg-1',
        platform: 'testCRM',
        conversationId: 'conv-123',
        thirdPartyLogId: 'third-party-msg-1',
        userId: 'user-1'
      });

      // Assert
      expect(log.id).toBe('msg-1');
      expect(log.conversationId).toBe('conv-123');
    });

    test('should create message log with conversationLogId', async () => {
      // Act
      const log = await MessageLogModel.create({
        id: 'msg-conv',
        platform: 'testCRM',
        conversationId: 'conv-456',
        conversationLogId: 'conv-log-456',
        thirdPartyLogId: 'third-party-msg-2',
        userId: 'user-1'
      });

      // Assert
      expect(log.conversationLogId).toBe('conv-log-456');
    });

    test('should find message logs by conversation ID', async () => {
      // Arrange
      await MessageLogModel.create({
        id: 'msg-find',
        platform: 'testCRM',
        conversationId: 'conv-find',
        thirdPartyLogId: 'third-party-find',
        userId: 'user-1'
      });

      // Act
      const log = await MessageLogModel.findOne({
        where: { conversationId: 'conv-find' }
      });

      // Assert
      expect(log).not.toBeNull();
      expect(log.id).toBe('msg-find');
    });

    test('should find message logs by conversationLogId', async () => {
      // Arrange
      await MessageLogModel.create({
        id: 'msg-conv-log',
        platform: 'testCRM',
        conversationId: 'conv-789',
        conversationLogId: 'conv-log-789',
        thirdPartyLogId: 'third-party-789',
        userId: 'user-1'
      });

      // Act
      const log = await MessageLogModel.findOne({
        where: { conversationLogId: 'conv-log-789' }
      });

      // Assert
      expect(log).not.toBeNull();
      expect(log.conversationLogId).toBe('conv-log-789');
    });
  });

  describe('CacheModel', () => {
    test('should create cache entry', async () => {
      // Arrange & Act
      const cache = await CacheModel.create({
        id: 'cache-1',
        userId: 'user-123',
        cacheKey: 'contacts',
        status: 'active'
      });

      // Assert
      expect(cache.id).toBe('cache-1');
      expect(cache.userId).toBe('user-123');
      expect(cache.cacheKey).toBe('contacts');
      expect(cache.status).toBe('active');
    });

    test('should update cache status', async () => {
      // Arrange
      const cache = await CacheModel.create({
        id: 'cache-update',
        userId: 'user-123',
        cacheKey: 'contacts',
        status: 'pending'
      });

      // Act
      await cache.update({ status: 'completed' });

      // Assert
      const updated = await CacheModel.findByPk('cache-update');
      expect(updated.status).toBe('completed');
    });

    test('should find cache by userId and cacheKey', async () => {
      // Arrange
      await CacheModel.create({
        id: 'cache-find',
        userId: 'user-find',
        cacheKey: 'contacts-cache',
        status: 'active'
      });

      // Act
      const cache = await CacheModel.findOne({
        where: { userId: 'user-find', cacheKey: 'contacts-cache' }
      });

      // Assert
      expect(cache).not.toBeNull();
      expect(cache.status).toBe('active');
    });
  });

  describe('AdminConfigModel', () => {
    test('should create admin config with basic settings', async () => {
      // Arrange & Act
      const config = await AdminConfigModel.create({
        id: 'admin-1',
        userSettings: { autoLogCalls: true, autoLogMessages: false }
      });

      // Assert
      expect(config.id).toBe('admin-1');
      expect(config.userSettings).toEqual({ autoLogCalls: true, autoLogMessages: false });
    });

    test('should create admin config with tokens', async () => {
      // Arrange
      const expiry = new Date('2024-12-31');

      // Act
      const config = await AdminConfigModel.create({
        id: 'admin-tokens',
        adminAccessToken: 'access-token',
        adminRefreshToken: 'refresh-token',
        adminTokenExpiry: expiry
      });

      // Assert
      expect(config.adminAccessToken).toBe('access-token');
      expect(config.adminRefreshToken).toBe('refresh-token');
    });

    test('should create admin config with user mappings', async () => {
      // Arrange
      const userMappings = [
        { crmUserId: 'crm-1', rcExtensionId: ['ext-1'] },
        { crmUserId: 'crm-2', rcExtensionId: ['ext-2', 'ext-3'] }
      ];

      // Act
      const config = await AdminConfigModel.create({
        id: 'admin-mappings',
        userMappings: userMappings
      });

      // Assert
      expect(config.userMappings).toEqual(userMappings);
    });

    test('should update admin config settings', async () => {
      // Arrange
      const config = await AdminConfigModel.create({
        id: 'admin-update',
        userSettings: { autoLog: false }
      });

      // Act
      await config.update({ userSettings: { autoLog: true } });

      // Assert
      const updated = await AdminConfigModel.findByPk('admin-update');
      expect(updated.userSettings).toEqual({ autoLog: true });
    });

    test('should find admin config by primary key', async () => {
      // Arrange
      await AdminConfigModel.create({
        id: 'admin-find',
        userSettings: { enabled: true }
      });

      // Act
      const config = await AdminConfigModel.findByPk('admin-find');

      // Assert
      expect(config).not.toBeNull();
      expect(config.id).toBe('admin-find');
    });
  });

  describe('Model Relationships and Edge Cases', () => {
    test('should handle null JSON fields', async () => {
      // Act
      const user = await UserModel.create({
        id: 'user-null-json',
        platform: 'testCRM',
        accessToken: 'token',
        platformAdditionalInfo: null,
        userSettings: null
      });

      // Assert
      expect(user.platformAdditionalInfo).toBeNull();
      expect(user.userSettings).toBeNull();
    });

    test('should handle empty JSON objects', async () => {
      // Act
      const user = await UserModel.create({
        id: 'user-empty-json',
        platform: 'testCRM',
        accessToken: 'token',
        platformAdditionalInfo: {},
        userSettings: {}
      });

      // Assert
      expect(user.platformAdditionalInfo).toEqual({});
      expect(user.userSettings).toEqual({});
    });

    test('should handle complex nested JSON', async () => {
      // Arrange
      const complexData = {
        level1: {
          level2: {
            level3: {
              value: 'deep',
              array: [1, 2, 3]
            }
          },
          items: [
            { id: 1, name: 'Item 1' },
            { id: 2, name: 'Item 2' }
          ]
        }
      };

      // Act
      const user = await UserModel.create({
        id: 'user-complex-json',
        platform: 'testCRM',
        accessToken: 'token',
        platformAdditionalInfo: complexData
      });

      // Assert
      expect(user.platformAdditionalInfo).toEqual(complexData);
      expect(user.platformAdditionalInfo.level1.level2.level3.value).toBe('deep');
    });

    test('should enforce unique primary key constraint', async () => {
      // Arrange
      await UserModel.create({
        id: 'unique-user',
        platform: 'testCRM',
        accessToken: 'token-1'
      });

      // Act & Assert
      await expect(
        UserModel.create({
          id: 'unique-user',
          platform: 'testCRM',
          accessToken: 'token-2'
        })
      ).rejects.toThrow();
    });

    test('should handle bulk create', async () => {
      // Arrange
      const users = [
        { id: 'bulk-1', platform: 'testCRM', accessToken: 'token-1' },
        { id: 'bulk-2', platform: 'testCRM', accessToken: 'token-2' },
        { id: 'bulk-3', platform: 'testCRM', accessToken: 'token-3' }
      ];

      // Act
      await UserModel.bulkCreate(users);

      // Assert
      const count = await UserModel.count({ where: { platform: 'testCRM' } });
      expect(count).toBe(3);
    });

    test('should handle bulk destroy', async () => {
      // Arrange
      await UserModel.bulkCreate([
        { id: 'destroy-1', platform: 'destroyTest', accessToken: 'token-1' },
        { id: 'destroy-2', platform: 'destroyTest', accessToken: 'token-2' }
      ]);

      // Act
      await UserModel.destroy({ where: { platform: 'destroyTest' } });

      // Assert
      const count = await UserModel.count({ where: { platform: 'destroyTest' } });
      expect(count).toBe(0);
    });
  });
});

