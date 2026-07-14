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
const logger = require('../../lib/logger');
const {
  pluginManifestAccessCases,
  pluginLicenseCases,
} = require('../data/pluginServiceCases');

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
    jest.restoreAllMocks();
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

    test('should throw when resolved plugin manifest has no endpoint URL', async () => {
      axios.get.mockResolvedValue({
        data: {
          platforms: {
            'plugin.sample': {
              userRegisterEndpointUrl: 'https://plugins.example.com/plugin/auth/register'
            }
          }
        }
      });

      await expect(pluginHandler.registerPluginAccount({
        pluginId: 'missing-endpoint',
        rcAccessToken: 'rc-access-token',
        rcAccountId: '12345',
        pluginAccess: 'public',
        pluginName: 'plugin.sample'
      })).rejects.toThrow('Plugin endpoint URL not found for missing-endpoint');
    });
  });

  describe('plugin data helpers', () => {
    test('should list persisted plugin data for an RC account', async () => {
      await AccountDataModel.bulkCreate([
        {
          rcAccountId: '12345',
          platformName: 'plugin-one',
          dataKey: 'pluginData',
          data: { endpointUrl: 'https://plugin-one.example.com' }
        },
        {
          rcAccountId: '12345',
          platformName: 'plugin-two',
          dataKey: 'pluginData',
          data: { endpointUrl: 'https://plugin-two.example.com' }
        },
        {
          rcAccountId: '12345',
          platformName: 'not-plugin',
          dataKey: 'otherData',
          data: { ignored: true }
        }
      ]);

      await expect(pluginHandler.getPluginsFromRcAccountId({ rcAccountId: '12345' }))
        .resolves.toEqual([
          { id: 'plugin-one', data: { endpointUrl: 'https://plugin-one.example.com' } },
          { id: 'plugin-two', data: { endpointUrl: 'https://plugin-two.example.com' } }
        ]);
    });

    test('should resolve plugin config from user settings and return null for missing config', () => {
      expect(pluginHandler.getPluginConfigFromUserSettings({
        userSettings: null,
        pluginId: 'plugin-one'
      })).toBeNull();
      expect(pluginHandler.getPluginConfigFromUserSettings({
        userSettings: {
          'plugin_plugin-one': {
            value: {}
          }
        },
        pluginId: 'plugin-one'
      })).toBeNull();
      expect(pluginHandler.getPluginConfigFromUserSettings({
        userSettings: {
          'plugin_plugin-one': {
            value: {
              config: {
                queueId: 'q-1'
              }
            }
          }
        },
        pluginId: 'plugin-one'
      })).toEqual({ queueId: 'q-1' });
    });

    test('should update existing plugin data and log persist failures without throwing', async () => {
      await AccountDataModel.create({
        rcAccountId: '12345',
        platformName: 'plugin-one',
        dataKey: 'pluginData',
        data: {
          jwtToken: 'old-token',
          endpointUrl: 'https://old.example.com'
        }
      });

      await pluginHandler.persistPluginData({
        rcAccountId: '12345',
        pluginId: 'plugin-one',
        jwtToken: 'new-token',
        pluginData: {
          endpointUrl: 'https://new.example.com'
        }
      });

      const updated = await AccountDataModel.findOne({
        where: {
          rcAccountId: '12345',
          platformName: 'plugin-one'
        }
      });
      expect(updated.data).toEqual({
        jwtToken: 'new-token',
        endpointUrl: 'https://new.example.com'
      });

      const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => {});
      jest.spyOn(AccountDataModel, 'findOne').mockRejectedValueOnce(new Error('db unavailable'));
      await expect(pluginHandler.persistPluginData({
        rcAccountId: '12345',
        pluginId: 'plugin-one',
        jwtToken: 'ignored'
      })).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalledWith('Failed to persist plugin data', {
        pluginId: 'plugin-one',
        rcAccountId: '12345',
        message: 'db unavailable'
      });
    });
  });

  describe('resolvePluginManifest', () => {
    test.each(pluginManifestAccessCases)('$label', async (...args: any[]) => {
      const {
        pluginId,
        pluginAccess,
        ownerRcAccountId,
        fetchResults,
        expectedUrls,
      } = args[0];
      fetchResults.forEach((fetchResult) => {
        if (fetchResult.error) {
          axios.get.mockRejectedValueOnce(new Error(fetchResult.error));
        } else {
          axios.get.mockResolvedValueOnce({ data: fetchResult.data });
        }
      });

      const result = await pluginHandler.resolvePluginManifest({
        pluginId,
        pluginAccess,
        ownerRcAccountId,
      });

      expect(axios.get.mock.calls.map(([url]) => url)).toEqual(expectedUrls);
      expect(result.platformKey).toBe('plugin.service');
      expect(result.pluginManifest.endpointUrl).toBe(
        'https://plugins.example.com/service',
      );
    });

    test('should throw the last manifest fetch error or platform resolution error', async () => {
      axios.get.mockRejectedValueOnce(new Error('manifest unavailable'));

      await expect(pluginHandler.resolvePluginManifest({
        pluginId: 'missing-plugin',
        pluginAccess: 'public'
      })).rejects.toThrow('manifest unavailable');

      axios.get.mockResolvedValueOnce({
        data: {
          platforms: {}
        }
      });
      await expect(pluginHandler.resolvePluginManifest({
        pluginId: 'empty-plugin',
        pluginAccess: 'public',
        pluginName: 'plugin.missing'
      })).rejects.toThrow('Unable to resolve platform manifest for plugin empty-plugin');
    });
  });

  describe('getPluginLicenseStatus', () => {
    test.each(pluginLicenseCases)('$label', async (...args: any[]) => {
      const {
        installed,
        providerResponse,
        providerError,
        expectedResult,
        expectedProviderCalls,
      } = args[0];
      const rcAccountId = 'license-account';
      const pluginId = 'licensed-service';
      const licenseStatusUrl = 'https://plugins.example.com/service/license';

      if (installed) {
        await AccountDataModel.create({
          rcAccountId,
          platformName: pluginId,
          dataKey: 'pluginData',
          data: {
            jwtToken: 'plugin-jwt-token',
            licenseStatusUrl,
          },
        });
        if (providerError) {
          axios.get.mockRejectedValueOnce(new Error(providerError));
        } else {
          axios.get.mockResolvedValueOnce({ data: providerResponse });
        }
      }

      const resultPromise = pluginHandler.getPluginLicenseStatus({
        rcAccountId,
        pluginId,
      });

      if (providerError) {
        await expect(resultPromise).rejects.toThrow(providerError);
      } else {
        await expect(resultPromise).resolves.toEqual(expectedResult);
      }
      expect(axios.get).toHaveBeenCalledTimes(expectedProviderCalls);
      if (installed) {
        expect(axios.get).toHaveBeenCalledWith(licenseStatusUrl, {
          headers: {
            Authorization: 'Bearer plugin-jwt-token',
          },
        });
      }
    });
  });
  describe('unregisterPluginAccount', () => {
    test('should remove persisted plugin account data', async () => {
      const rcAccountId = '12345';
      const pluginId = 'sync-all-caps';
      await AccountDataModel.create({
        rcAccountId,
        platformName: pluginId,
        dataKey: 'pluginData',
        data: {
          jwtToken: 'plugin-jwt-token'
        }
      });

      await pluginHandler.unregisterPluginAccount({ rcAccountId, pluginId });

      const accountData = await AccountDataModel.findOne({
        where: {
          rcAccountId,
          platformName: pluginId,
          dataKey: 'pluginData'
        }
      });
      expect(accountData).toBeNull();
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

    test('should parse uppercase refreshed jwt token header and return null without headers', () => {
      expect(pluginHandler.getRefreshedJwtTokenFromHeaders({ headers: null })).toBeNull();
      expect(pluginHandler.getRefreshedJwtTokenFromHeaders({
        headers: {
          'X-Refreshed-Jwt-Token': 'upper-token'
        }
      })).toBe('upper-token');
    });
  });
});


export {};
