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

const { AccountDataModel, getOrRefreshAccountData } = require('../../models/accountDataModel');
const { sequelize } = require('../../models/sequelize');

describe('getOrRefreshAccountData', () => {
  beforeAll(async () => {
    await AccountDataModel.sync({ force: true });
  });

  afterEach(async () => {
    await AccountDataModel.destroy({ where: {} });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  test('returns cached data when record exists and refresh not forced', async () => {
    await AccountDataModel.create({
      rcAccountId: 'acc-1',
      platformName: 'test-platform',
      dataKey: 'key-1',
      data: { cached: true },
    });

    const fetchFn = jest.fn().mockResolvedValue({ cached: false });

    const out = await getOrRefreshAccountData({
      rcAccountId: 'acc-1',
      platformName: 'test-platform',
      dataKey: 'key-1',
      forceRefresh: false,
      fetchFn,
    });

    expect(out).toEqual({ cached: true });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  test('creates new record when none exists', async () => {
    const fetchFn = jest.fn().mockResolvedValue({ fresh: 'data' });

    const out = await getOrRefreshAccountData({
      rcAccountId: 'acc-2',
      platformName: 'test-platform',
      dataKey: 'key-2',
      fetchFn,
    });

    expect(out).toEqual({ fresh: 'data' });
    expect(fetchFn).toHaveBeenCalledTimes(1);

    const stored = await AccountDataModel.findOne({
      where: { rcAccountId: 'acc-2', platformName: 'test-platform', dataKey: 'key-2' },
    });
    expect(stored).not.toBeNull();
    expect(stored.data).toEqual({ fresh: 'data' });
  });

  test('refreshes existing record when forceRefresh is true', async () => {
    await AccountDataModel.create({
      rcAccountId: 'acc-3',
      platformName: 'test-platform',
      dataKey: 'key-3',
      data: { cached: true },
    });

    const fetchFn = jest.fn().mockResolvedValue({ cached: false, updated: true });

    const out = await getOrRefreshAccountData({
      rcAccountId: 'acc-3',
      platformName: 'test-platform',
      dataKey: 'key-3',
      forceRefresh: true,
      fetchFn,
    });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(out).toEqual({ cached: false, updated: true });

    const refreshed = await AccountDataModel.findOne({
      where: { rcAccountId: 'acc-3', platformName: 'test-platform', dataKey: 'key-3' },
    });
    expect(refreshed.data).toEqual({ cached: false, updated: true });
  });
});

