const { CacheModel } = require('../../models/cacheModel');
const { AccountDataModel } = require('../../models/accountDataModel');
const { clearExpiredAccountContactData, clearExpiredCache } = require('../../lib/cacheCleanup');
const tsCacheCleanup = require('../../lib/cacheCleanup.ts');

describe('cacheCleanup', () => {
  beforeEach(async () => {
    await CacheModel.destroy({ where: {} });
    await AccountDataModel.destroy({ where: {} });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('deletes only cache records whose expiry has passed', async () => {
    const now = new Date('2026-05-08T00:00:00.000Z');

    await CacheModel.bulkCreate([
      {
        id: 'expired-cache',
        userId: 'user-1',
        cacheKey: 'auth-session',
        status: 'expired',
        expiry: new Date('2026-05-07T23:59:59.000Z')
      },
      {
        id: 'active-cache',
        userId: 'user-1',
        cacheKey: 'auth-session',
        status: 'pending',
        expiry: new Date('2026-05-08T00:00:01.000Z')
      },
      {
        id: 'cache-without-expiry',
        userId: 'user-2',
        cacheKey: 'contacts',
        status: 'active'
      }
    ]);

    const deletedCount = await clearExpiredCache({ now });

    expect(deletedCount).toBe(1);
    expect(await CacheModel.findByPk('expired-cache')).toBeNull();
    expect(await CacheModel.findByPk('active-cache')).not.toBeNull();
    expect(await CacheModel.findByPk('cache-without-expiry')).not.toBeNull();
  });

  test('deletes only account contact data older than three months', async () => {
    const now = new Date('2026-06-08T00:00:00.000Z');

    await AccountDataModel.bulkCreate([
      {
        rcAccountId: 'account-1',
        platformName: 'test-platform',
        dataKey: 'contact-+1111111111',
        data: [{ id: 'old-contact' }],
        createdAt: new Date('2026-03-07T23:59:59.000Z'),
        updatedAt: new Date('2026-03-07T23:59:59.000Z')
      },
      {
        rcAccountId: 'account-1',
        platformName: 'test-platform',
        dataKey: 'contact-+2222222222',
        data: [{ id: 'exact-cutoff-contact' }],
        createdAt: new Date('2026-03-08T00:00:00.000Z'),
        updatedAt: new Date('2026-03-08T00:00:00.000Z')
      },
      {
        rcAccountId: 'account-1',
        platformName: 'test-platform',
        dataKey: 'contact-+3333333333',
        data: [{ id: 'active-contact' }],
        createdAt: new Date('2026-03-08T00:00:01.000Z'),
        updatedAt: new Date('2026-03-08T00:00:01.000Z')
      },
      {
        rcAccountId: 'account-1',
        platformName: 'test-platform',
        dataKey: 'pluginData',
        data: { jwtToken: 'plugin-token' },
        createdAt: new Date('2026-03-07T23:59:59.000Z'),
        updatedAt: new Date('2026-03-07T23:59:59.000Z')
      }
    ]);

    const deletedCount = await clearExpiredAccountContactData({ now });

    expect(deletedCount).toBe(1);
    expect(await AccountDataModel.findOne({
      where: { rcAccountId: 'account-1', platformName: 'test-platform', dataKey: 'contact-+1111111111' }
    })).toBeNull();
    expect(await AccountDataModel.findOne({
      where: { rcAccountId: 'account-1', platformName: 'test-platform', dataKey: 'contact-+2222222222' }
    })).not.toBeNull();
    expect(await AccountDataModel.findOne({
      where: { rcAccountId: 'account-1', platformName: 'test-platform', dataKey: 'contact-+3333333333' }
    })).not.toBeNull();
    expect(await AccountDataModel.findOne({
      where: { rcAccountId: 'account-1', platformName: 'test-platform', dataKey: 'pluginData' }
    })).not.toBeNull();
  });

  test('clearExpiredCache includes expired account contact data cleanup', async () => {
    const now = new Date('2026-06-08T00:00:00.000Z');

    await CacheModel.create({
      id: 'expired-cache',
      userId: 'user-1',
      cacheKey: 'auth-session',
      status: 'expired',
      expiry: new Date('2026-06-07T23:59:59.000Z')
    });
    await AccountDataModel.create({
      rcAccountId: 'account-1',
      platformName: 'test-platform',
      dataKey: 'contact-+1111111111',
      data: [{ id: 'old-contact' }],
      createdAt: new Date('2026-03-07T23:59:59.000Z'),
      updatedAt: new Date('2026-03-07T23:59:59.000Z')
    });

    const deletedCount = await clearExpiredCache({ now });

    expect(deletedCount).toBe(2);
    expect(await CacheModel.findByPk('expired-cache')).toBeNull();
    expect(await AccountDataModel.findOne({
      where: { rcAccountId: 'account-1', platformName: 'test-platform', dataKey: 'contact-+1111111111' }
    })).toBeNull();
  });

  test('clearExpiredCache uses current time when options are omitted', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-08T00:00:00.000Z'));

    await CacheModel.create({
      id: 'default-now-expired-cache',
      userId: 'user-1',
      cacheKey: 'auth-session',
      status: 'expired',
      expiry: new Date('2026-06-07T23:59:59.000Z')
    });
    await AccountDataModel.create({
      rcAccountId: 'account-1',
      platformName: 'test-platform',
      dataKey: 'contact-+1111111111',
      data: [{ id: 'old-contact' }],
      createdAt: new Date('2026-03-07T23:59:59.000Z'),
      updatedAt: new Date('2026-03-07T23:59:59.000Z')
    });

    const deletedCount = await clearExpiredCache();

    expect(deletedCount).toBe(2);
    expect(await CacheModel.findByPk('default-now-expired-cache')).toBeNull();
    expect(await AccountDataModel.findOne({
      where: { rcAccountId: 'account-1', platformName: 'test-platform', dataKey: 'contact-+1111111111' }
    })).toBeNull();
  });

  test('clearExpiredAccountContactData accepts custom retention months', async () => {
    const now = new Date('2026-06-08T00:00:00.000Z');

    await AccountDataModel.bulkCreate([
      {
        rcAccountId: 'account-1',
        platformName: 'test-platform',
        dataKey: 'contact-+1111111111',
        data: [{ id: 'old-contact' }],
        createdAt: new Date('2026-05-07T23:59:59.000Z'),
        updatedAt: new Date('2026-05-07T23:59:59.000Z')
      },
      {
        rcAccountId: 'account-1',
        platformName: 'test-platform',
        dataKey: 'contact-+2222222222',
        data: [{ id: 'active-contact' }],
        createdAt: new Date('2026-05-08T00:00:00.000Z'),
        updatedAt: new Date('2026-05-08T00:00:00.000Z')
      }
    ]);

    const deletedCount = await clearExpiredAccountContactData({
      now,
      retentionMonths: 1
    });

    expect(deletedCount).toBe(1);
    expect(await AccountDataModel.findOne({
      where: { rcAccountId: 'account-1', platformName: 'test-platform', dataKey: 'contact-+1111111111' }
    })).toBeNull();
    expect(await AccountDataModel.findOne({
      where: { rcAccountId: 'account-1', platformName: 'test-platform', dataKey: 'contact-+2222222222' }
    })).not.toBeNull();
  });

  test('TypeScript implementation deletes the same expired cache surfaces', async () => {
    const now = new Date('2026-06-08T00:00:00.000Z');

    await CacheModel.create({
      id: 'ts-expired-cache',
      userId: 'user-1',
      cacheKey: 'auth-session',
      status: 'expired',
      expiry: new Date('2026-06-07T23:59:59.000Z')
    });
    await AccountDataModel.create({
      rcAccountId: 'account-1',
      platformName: 'test-platform',
      dataKey: 'contact-+2222222222',
      data: [{ id: 'old-contact' }],
      createdAt: new Date('2026-03-07T23:59:59.000Z'),
      updatedAt: new Date('2026-03-07T23:59:59.000Z')
    });

    const deletedCount = await tsCacheCleanup.clearExpiredCache({ now });

    expect(deletedCount).toBe(2);
    expect(await CacheModel.findByPk('ts-expired-cache')).toBeNull();
    expect(await AccountDataModel.findOne({
      where: { rcAccountId: 'account-1', platformName: 'test-platform', dataKey: 'contact-+2222222222' }
    })).toBeNull();
  });
});

export {};
