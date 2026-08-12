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

const connectorRegistry = require('../../connector/registry');
const { AccountDataModel } = require('../../models/accountDataModel');
const { getAccountData, getAccountDataKeys } = require('../../lib/accountData');
const { sequelize } = require('../../models/sequelize');

describe('accountData lib', () => {
  const user = { rcAccountId: 'rc-account-123' };
  const platform = 'testCRM';
  let fetchMock: jest.Mock;

  beforeAll(async () => {
    await AccountDataModel.sync({ force: true });
  });

  // A zero TTL only expires once the clock moves past updatedAt, so back-date the row
  // instead of relying on a millisecond elapsing between create and read.
  async function createExpiredRecord(dataKey: string, data: any) {
    await AccountDataModel.create({
      rcAccountId: user.rcAccountId,
      platformName: platform,
      dataKey,
      data
    });
    await AccountDataModel.update(
      { updatedAt: new Date(Date.now() - 60000) },
      {
        where: { rcAccountId: user.rcAccountId, platformName: platform, dataKey },
        silent: true
      }
    );
  }

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue([{ const: 'k1', title: 'Type 1' }]);
    connectorRegistry.getConnector.mockReturnValue({
      accountData: {
        freshKey: { fetch: fetchMock },
        expiredKey: { fetch: fetchMock, ttlMs: 0 }
      }
    });
  });

  afterEach(async () => {
    await AccountDataModel.destroy({ where: {} });
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await sequelize.close();
  });

  test('fetches and stores data on first access', async () => {
    const result = await getAccountData({ platform, user, authHeader: 'Bearer x', dataKey: 'freshKey' });

    expect(fetchMock).toHaveBeenCalledWith({ user, authHeader: 'Bearer x' });
    expect(result).toEqual([{ const: 'k1', title: 'Type 1' }]);
    const stored = await AccountDataModel.findOne({
      where: { rcAccountId: user.rcAccountId, platformName: platform, dataKey: 'freshKey' }
    });
    expect(stored.data).toEqual([{ const: 'k1', title: 'Type 1' }]);
  });

  test('returns cached data without fetching when not expired', async () => {
    await AccountDataModel.create({
      rcAccountId: user.rcAccountId,
      platformName: platform,
      dataKey: 'freshKey',
      data: [{ const: 'cached', title: 'Cached' }]
    });

    const result = await getAccountData({ platform, user, authHeader: 'Bearer x', dataKey: 'freshKey' });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual([{ const: 'cached', title: 'Cached' }]);
  });

  test('refetches when TTL expired', async () => {
    await createExpiredRecord('expiredKey', [{ const: 'stale', title: 'Stale' }]);

    const result = await getAccountData({ platform, user, authHeader: 'Bearer x', dataKey: 'expiredKey' });

    expect(fetchMock).toHaveBeenCalled();
    expect(result).toEqual([{ const: 'k1', title: 'Type 1' }]);
    const stored = await AccountDataModel.findOne({
      where: { rcAccountId: user.rcAccountId, platformName: platform, dataKey: 'expiredKey' }
    });
    expect(stored.data).toEqual([{ const: 'k1', title: 'Type 1' }]);
  });

  test('refetches when forceRefresh even if not expired', async () => {
    await AccountDataModel.create({
      rcAccountId: user.rcAccountId,
      platformName: platform,
      dataKey: 'freshKey',
      data: [{ const: 'cached', title: 'Cached' }]
    });

    const result = await getAccountData({ platform, user, authHeader: 'Bearer x', dataKey: 'freshKey', forceRefresh: true });

    expect(fetchMock).toHaveBeenCalled();
    expect(result).toEqual([{ const: 'k1', title: 'Type 1' }]);
  });

  test('serves stale data when fetch fails and cached data exists', async () => {
    fetchMock.mockRejectedValue(new Error('CRM is down'));
    await createExpiredRecord('expiredKey', [{ const: 'stale', title: 'Stale' }]);

    const result = await getAccountData({ platform, user, authHeader: 'Bearer x', dataKey: 'expiredKey' });

    expect(result).toEqual([{ const: 'stale', title: 'Stale' }]);
  });

  test('throws when fetch fails and no cached data exists', async () => {
    fetchMock.mockRejectedValue(new Error('CRM is down'));

    await expect(getAccountData({ platform, user, authHeader: 'Bearer x', dataKey: 'freshKey' }))
      .rejects.toThrow('CRM is down');
  });

  test('throws on unknown data key', async () => {
    await expect(getAccountData({ platform, user, authHeader: 'Bearer x', dataKey: 'nope' }))
      .rejects.toThrow(`Unknown account data key 'nope' for platform '${platform}'`);
  });

  test('throws when user has no rcAccountId', async () => {
    await expect(getAccountData({ platform, user: {}, authHeader: 'Bearer x', dataKey: 'freshKey' }))
      .rejects.toThrow('user has no rcAccountId');
  });

  test('getAccountDataKeys enumerates registered keys', () => {
    expect(getAccountDataKeys(platform)).toEqual(['freshKey', 'expiredKey']);
  });

  test('getAccountDataKeys returns empty array for platform without descriptor table', () => {
    connectorRegistry.getConnector.mockReturnValue({});
    expect(getAccountDataKeys(platform)).toEqual([]);
  });
});

export {};
