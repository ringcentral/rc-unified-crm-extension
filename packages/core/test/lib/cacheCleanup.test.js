const { CacheModel } = require('../../models/cacheModel');
const { clearExpiredCache } = require('../../lib/cacheCleanup');

describe('cacheCleanup', () => {
  beforeEach(async () => {
    await CacheModel.destroy({ where: {} });
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
});
