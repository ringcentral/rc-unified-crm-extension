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

const pluginHandler = require('../../handlers/plugin');
const { CacheModel } = require('../../models/cacheModel');
const { AccountDataModel } = require('../../models/accountDataModel');
const axios = require('axios');
const { sequelize } = require('../../models/sequelize');

describe('Plugin Handler', () => {
  beforeAll(async () => {
    process.env.HASH_KEY = 'unit-test-hash-key';
    await CacheModel.sync({ force: true });
    await AccountDataModel.sync({ force: true });
  });

  afterEach(async () => {
    await CacheModel.destroy({ where: {} });
    await AccountDataModel.destroy({ where: {} });
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await sequelize.close();
  });

  describe('registerPluginAccount', () => {
    test('should register plugin account and persist plugin jwt token in account data', async () => {
      const rcAccountId = '12345';
      const pluginId = 'sync-all-caps';

      axios.get.mockResolvedValue({
        data: {
          platforms: {
            'plugin.sample': {
              endpointUrl: `https://plugins.example.com/plugin/${pluginId}`,
              userRegisterEndpointUrl: `https://plugins.example.com/plugin/${pluginId}/auth/register`
            }
          }
        }
      });
      axios.post.mockResolvedValue({
        data: {
          jwtToken: 'plugin-jwt-token'
        }
      });

      const result = await pluginHandler.registerPluginAccount({
        pluginId,
        rcAccessToken: 'rc-access-token',
        rcAccountId,
        pluginAccess: 'public',
        pluginName: 'plugin.sample'
      });

      expect(result.successful).toBe(true);
      expect(axios.post).toHaveBeenCalledWith(
        `https://plugins.example.com/plugin/${pluginId}/auth/register`,
        {
          rcAccessToken: 'rc-access-token',
          rcAccountId
        }
      );

      const accountData = await AccountDataModel.findOne({
        where: {
          rcAccountId,
          platformName: pluginId,
          dataKey: 'pluginData'
        }
      });
      expect(accountData).not.toBeNull();
      expect(accountData.data.jwtToken).toBe('plugin-jwt-token');
      expect(accountData.data.endpointUrl).toBe(`https://plugins.example.com/plugin/${pluginId}`);
    });

    test('should throw when register API does not return jwt token', async () => {
      const rcAccountId = '12345';
      const pluginId = 'sync-all-caps';

      axios.get.mockResolvedValue({
        data: {
          platforms: {
            'plugin.sample': {
              endpointUrl: `https://plugins.example.com/plugin/${pluginId}`,
              userRegisterEndpointUrl: `https://plugins.example.com/plugin/${pluginId}/auth/register`
            }
          }
        }
      });
      axios.post.mockResolvedValue({ data: {} });

      await expect(pluginHandler.registerPluginAccount({
        pluginId,
        rcAccessToken: 'rc-access-token',
        rcAccountId,
        pluginAccess: 'public',
        pluginName: 'plugin.sample'
      })).rejects.toThrow('Plugin register API did not return jwtToken');
    });
  });

  describe('token header helper', () => {
    test('should parse refreshed jwt token from response headers', () => {
      const token = pluginHandler.getRefreshedJwtTokenFromHeaders({
        headers: {
          'x-refreshed-jwt-token': 'new-plugin-token'
        }
      });
      expect(token).toBe('new-plugin-token');
    });
  });
});

