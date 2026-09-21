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
jest.mock('../../lib/logger', () => ({
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
}));

const extensionActivity = require('../../handlers/extensionActivity');
const { ExtensionActivityModel } = require('../../models/extensionActivityModel');
const { UserModel } = require('../../models/userModel');
const { sequelize } = require('../../models/sequelize');
const logger = require('../../lib/logger');

const HOUR = 60 * 60 * 1000;

describe('Extension activity handler', () => {
  beforeAll(async () => {
    await ExtensionActivityModel.sync({ force: true });
    await UserModel.sync({ force: true });
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await ExtensionActivityModel.destroy({ where: {} });
    await UserModel.destroy({ where: {} });
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await sequelize.close();
  });

  describe('recordExtensionActivity', () => {
    test('inserts one row with createdAt and updatedAt on first login', async () => {
      const result = await extensionActivity.recordExtensionActivity({
        hashedRcExtensionId: 'hash-ext-1',
        rcAccountId: 'acc-1',
      });

      expect(result).toBe(true);
      const rows = await ExtensionActivityModel.findAll();
      expect(rows).toHaveLength(1);
      expect(rows[0].hashedRcExtensionId).toBe('hash-ext-1');
      expect(rows[0].rcAccountId).toBe('acc-1');
      expect(rows[0].createdAt).toBeInstanceOf(Date);
      expect(rows[0].updatedAt).toBeInstanceOf(Date);
    });

    test('skips the write when the row was refreshed less than an hour ago', async () => {
      await extensionActivity.recordExtensionActivity({ hashedRcExtensionId: 'hash-ext-1', rcAccountId: 'acc-1' });
      const [before] = await ExtensionActivityModel.findAll();
      const upsertSpy = jest.spyOn(ExtensionActivityModel, 'upsert');

      const result = await extensionActivity.recordExtensionActivity({ hashedRcExtensionId: 'hash-ext-1', rcAccountId: 'acc-1' });

      expect(result).toBe(false);
      expect(upsertSpy).not.toHaveBeenCalled();
      const rows = await ExtensionActivityModel.findAll();
      expect(rows).toHaveLength(1);
      expect(rows[0].updatedAt.getTime()).toBe(before.updatedAt.getTime());
    });

    test('bumps updatedAt but keeps createdAt and row count after the throttle window', async () => {
      const createdAt = new Date(Date.now() - 3 * HOUR);
      const updatedAt = new Date(Date.now() - 2 * HOUR);
      await ExtensionActivityModel.create({ hashedRcExtensionId: 'hash-ext-1', rcAccountId: 'acc-1' });
      // Sequelize manages the timestamps itself, so backdate them with raw SQL.
      await sequelize.query(
        'UPDATE extensionActivities SET createdAt = ?, updatedAt = ? WHERE hashedRcExtensionId = ?',
        { replacements: [createdAt, updatedAt, 'hash-ext-1'] },
      );

      const result = await extensionActivity.recordExtensionActivity({ hashedRcExtensionId: 'hash-ext-1', rcAccountId: 'acc-1' });

      expect(result).toBe(true);
      const rows = await ExtensionActivityModel.findAll();
      expect(rows).toHaveLength(1);
      expect(rows[0].createdAt.getTime()).toBe(createdAt.getTime());
      expect(rows[0].updatedAt.getTime()).toBeGreaterThan(updatedAt.getTime());
    });

    test('keeps separate rows per account for the same hashed extension', async () => {
      await extensionActivity.recordExtensionActivity({ hashedRcExtensionId: 'hash-ext-1', rcAccountId: 'acc-1' });
      await extensionActivity.recordExtensionActivity({ hashedRcExtensionId: 'hash-ext-1', rcAccountId: 'acc-2' });

      expect(await ExtensionActivityModel.count()).toBe(2);
    });

    test('does nothing when the extension or account id is missing', async () => {
      expect(await extensionActivity.recordExtensionActivity({ hashedRcExtensionId: '', rcAccountId: 'acc-1' })).toBe(false);
      expect(await extensionActivity.recordExtensionActivity({ hashedRcExtensionId: 'hash-ext-1', rcAccountId: '' })).toBe(false);
      expect(await ExtensionActivityModel.count()).toBe(0);
    });

    test('swallows database errors and only warns', async () => {
      jest.spyOn(ExtensionActivityModel, 'findOne').mockRejectedValue(new Error('no such table: extensionActivities'));

      await expect(extensionActivity.recordExtensionActivity({ hashedRcExtensionId: 'hash-ext-1', rcAccountId: 'acc-1' })).resolves.toBe(false);
      expect(logger.warn).toHaveBeenCalledWith('Record extension activity failed', expect.objectContaining({
        message: expect.stringContaining('no such table'),
      }));
    });
  });

  describe('getExtensionAdoptionStats', () => {
    let userCounter = 0;
    async function seedUser(overrides) {
      userCounter += 1;
      return UserModel.create({
        id: `user-${userCounter}`,
        platform: 'testCRM',
        accessToken: 'token',
        ...overrides,
      });
    }

    async function seedActivity(hashedRcExtensionId, rcAccountId) {
      return ExtensionActivityModel.create({ hashedRcExtensionId, rcAccountId });
    }

    test('returns zeros and null when the account has no data', async () => {
      await expect(extensionActivity.getExtensionAdoptionStats({ rcAccountId: 'acc-1' })).resolves.toEqual({
        installedCount: 0,
        connectedCount: 0,
        lastActiveAt: null,
      });
    });

    test('counts only connected users with a non-empty access token', async () => {
      await seedUser({ rcAccountId: 'acc-1', hashedRcExtensionId: 'hash-a', accessToken: 'token' });
      await seedUser({ rcAccountId: 'acc-1', hashedRcExtensionId: 'hash-b', accessToken: '' });
      await seedUser({ rcAccountId: 'acc-1', hashedRcExtensionId: 'hash-c', accessToken: null });

      const stats = await extensionActivity.getExtensionAdoptionStats({ rcAccountId: 'acc-1' });

      expect(stats.connectedCount).toBe(1);
      expect(stats.installedCount).toBe(1);
    });

    test('scopes users to the account and ignores other accounts', async () => {
      await seedUser({ rcAccountId: 'acc-1', hashedRcExtensionId: 'hash-a' });
      await seedUser({ rcAccountId: 'acc-2', hashedRcExtensionId: 'hash-z' });
      await seedActivity('hash-y', 'acc-2');

      const stats = await extensionActivity.getExtensionAdoptionStats({ rcAccountId: 'acc-1' });

      expect(stats).toMatchObject({ installedCount: 1, connectedCount: 1 });
    });

    test('includes users without rcAccountId when their hashed extension is in the activity table', async () => {
      await seedActivity('hash-legacy', 'acc-1');
      await seedUser({ rcAccountId: null, hashedRcExtensionId: 'hash-legacy' });

      const stats = await extensionActivity.getExtensionAdoptionStats({ rcAccountId: 'acc-1' });

      expect(stats).toMatchObject({ installedCount: 1, connectedCount: 1 });
    });

    test('installedCount is the union of activated and connected sets, not the max', async () => {
      // Only activated: installed the extension, never connected a CRM
      await seedActivity('hash-only-activated-1', 'acc-1');
      await seedActivity('hash-only-activated-2', 'acc-1');
      // Both activated and connected
      await seedActivity('hash-both', 'acc-1');
      await seedUser({ rcAccountId: 'acc-1', hashedRcExtensionId: 'hash-both' });
      // Only connected: connected before the server upgrade, not logged in since
      await seedUser({ rcAccountId: 'acc-1', hashedRcExtensionId: 'hash-only-connected' });

      const stats = await extensionActivity.getExtensionAdoptionStats({ rcAccountId: 'acc-1' });

      expect(stats.connectedCount).toBe(2);
      // |A| = 3, |C| = 2, |A ∪ C| = 4; max would give 3
      expect(stats.installedCount).toBe(4);
    });

    test('dedupes a user connected to several CRMs by hashed extension id', async () => {
      await seedUser({ rcAccountId: 'acc-1', hashedRcExtensionId: 'hash-a', platform: 'crmOne' });
      await seedUser({ rcAccountId: 'acc-1', hashedRcExtensionId: 'hash-a', platform: 'crmTwo' });

      const stats = await extensionActivity.getExtensionAdoptionStats({ rcAccountId: 'acc-1' });

      expect(stats).toMatchObject({ installedCount: 1, connectedCount: 1 });
    });

    test('lastActiveAt is the newest updatedAt among connected users only', async () => {
      const older = await seedUser({ rcAccountId: 'acc-1', hashedRcExtensionId: 'hash-a' });
      const newer = await seedUser({ rcAccountId: 'acc-1', hashedRcExtensionId: 'hash-b' });
      const disconnected = await seedUser({ rcAccountId: 'acc-1', hashedRcExtensionId: 'hash-c', accessToken: '' });
      const olderAt = new Date('2026-01-01T00:00:00.000Z');
      const newerAt = new Date('2026-06-01T00:00:00.000Z');
      const disconnectedAt = new Date('2026-09-01T00:00:00.000Z');
      // Sequelize manages updatedAt itself, so backdate rows with raw SQL.
      async function setUpdatedAt(id, date) {
        await sequelize.query('UPDATE users SET updatedAt = ? WHERE id = ?', { replacements: [date, id] });
      }
      await setUpdatedAt(older.id, olderAt);
      await setUpdatedAt(newer.id, newerAt);
      await setUpdatedAt(disconnected.id, disconnectedAt);

      const stats = await extensionActivity.getExtensionAdoptionStats({ rcAccountId: 'acc-1' });

      expect(stats.lastActiveAt).toBe(newerAt.toISOString());
    });

    test('throws when rcAccountId is missing', async () => {
      await expect(extensionActivity.getExtensionAdoptionStats({ rcAccountId: '' })).rejects.toThrow('rcAccountId is required');
    });

    test('propagates database errors so the route can report a server error', async () => {
      jest.spyOn(ExtensionActivityModel, 'findAll').mockRejectedValue(new Error('relation "extensionActivities" does not exist'));

      await expect(extensionActivity.getExtensionAdoptionStats({ rcAccountId: 'acc-1' })).rejects.toThrow('does not exist');
    });
  });
});
