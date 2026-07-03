jest.mock('axios');
jest.mock('../../models/adminConfigModel', () => ({
  AdminConfigModel: {
    findByPk: jest.fn()
  }
}));
jest.mock('../../models/userModel', () => ({
  UserModel: {
    findOne: jest.fn()
  }
}));
jest.mock('../../connector/registry', () => ({
  getConnector: jest.fn()
}));
jest.mock('../../lib/oauth', () => ({
  getOAuthApp: jest.fn(() => ({ app: true })),
  checkAndRefreshAccessToken: jest.fn()
}));
jest.mock('../../lib/util', () => ({
  getHashValue: jest.fn((value) => `hash-${value}`)
}));
jest.mock('../../models/dynamo/connectorSchema', () => ({
  Connector: {
    getProxyConfig: jest.fn()
  }
}));

const axios = require('axios');
const userHandler = require('../../handlers/user');
const { AdminConfigModel } = require('../../models/adminConfigModel');
const { UserModel } = require('../../models/userModel');
const connectorRegistry = require('../../connector/registry');
const oauth = require('../../lib/oauth');
const { Connector } = require('../../models/dynamo/connectorSchema');

describe('User Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.HASH_KEY = 'hash-key';
  });

  test('refreshUserInfo returns warning when user is missing or has no access token', async () => {
    UserModel.findOne.mockResolvedValueOnce(null);

    await expect(userHandler.refreshUserInfo({
      platform: 'testCRM',
      userId: 'user-1'
    })).resolves.toMatchObject({
      successful: false,
      returnMessage: {
        message: 'User not found',
        messageType: 'warning'
      }
    });

    UserModel.findOne.mockResolvedValueOnce({ id: 'user-2' });
    const noTokenResult = await userHandler.refreshUserInfo({
      platform: 'testCRM',
      userId: 'user-2'
    });

    expect(noTokenResult.returnMessage.message).toBe('User not found');
  });

  test('refreshUserInfo handles oauth proxy config and expired refreshed session', async () => {
    const user = {
      id: 'user-1',
      hostname: 'crm.example.com',
      accessToken: 'expired-token',
      platformAdditionalInfo: {
        proxyId: 'proxy-1',
        tokenUrl: 'https://token.example.com'
      }
    };
    const platformModule = {
      getAuthType: jest.fn().mockResolvedValue('oauth'),
      getOauthInfo: jest.fn().mockResolvedValue({ tokenUrl: 'https://token.example.com' })
    };
    UserModel.findOne.mockResolvedValue(user);
    Connector.getProxyConfig.mockResolvedValue({ id: 'proxy-1' });
    connectorRegistry.getConnector.mockReturnValue(platformModule);
    oauth.checkAndRefreshAccessToken.mockResolvedValue(null);

    const result = await userHandler.refreshUserInfo({
      platform: 'testCRM',
      userId: 'user-1',
      tracer: {
        trace: jest.fn(),
        traceError: jest.fn()
      }
    });

    expect(platformModule.getOauthInfo).toHaveBeenCalledWith({
      tokenUrl: 'https://token.example.com',
      hostname: 'crm.example.com',
      proxyId: 'proxy-1',
      proxyConfig: { id: 'proxy-1' }
    });
    expect(result).toMatchObject({
      successful: false,
      isRevokeUserSession: true,
      returnMessage: {
        message: 'User session expired. Please connect again.'
      }
    });
  });

  test('refreshUserInfo supports apiKey auth and maps platform result', async () => {
    const user = {
      id: 'user-1',
      hostname: 'crm.example.com',
      accessToken: 'api-key',
      platformAdditionalInfo: {}
    };
    const platformModule = {
      getAuthType: jest.fn().mockResolvedValue('apiKey'),
      getBasicAuth: jest.fn(() => 'encoded-key'),
      refreshUserInfo: jest.fn().mockResolvedValue({
        successful: true,
        returnMessage: {
          messageType: 'success',
          message: 'Refreshed'
        }
      })
    };
    UserModel.findOne.mockResolvedValue(user);
    connectorRegistry.getConnector.mockReturnValue(platformModule);

    const result = await userHandler.refreshUserInfo({
      platform: 'testCRM',
      userId: 'user-1'
    });

    expect(platformModule.refreshUserInfo).toHaveBeenCalledWith({
      user,
      authHeader: 'Basic encoded-key',
      proxyConfig: null
    });
    expect(result.successful).toBe(true);
  });

  test('refreshUserInfo maps unexpected errors through API error handler', async () => {
    UserModel.findOne.mockRejectedValueOnce(new Error('database unavailable'));

    const result = await userHandler.refreshUserInfo({
      platform: 'testCRM',
      userId: 'user-1'
    });

    expect(result.successful).toBe(false);
    expect(result.returnMessage.messageType).toBe('warning');
  });

  test('getUserSettingsByAdmin resolves account from explicit account id or RC token', async () => {
    AdminConfigModel.findByPk.mockResolvedValueOnce({
      userSettings: {
        theme: { value: 'dark' }
      }
    });

    await expect(userHandler.getUserSettingsByAdmin({
      rcAccountId: 'hashed-account'
    })).resolves.toEqual({
      userSettings: {
        theme: { value: 'dark' }
      }
    });
    expect(AdminConfigModel.findByPk).toHaveBeenCalledWith('hashed-account');

    axios.get.mockResolvedValueOnce({
      data: {
        account: {
          id: 'rc-account-1'
        }
      }
    });
    AdminConfigModel.findByPk.mockResolvedValueOnce({
      userSettings: {
        language: { value: 'en' }
      }
    });

    const result = await userHandler.getUserSettingsByAdmin({
      rcAccessToken: 'rc-token'
    });

    expect(axios.get).toHaveBeenCalledWith(
      'https://platform.ringcentral.com/restapi/v1.0/account/~/extension/~',
      {
        headers: {
          Authorization: 'Bearer rc-token'
        }
      }
    );
    expect(AdminConfigModel.findByPk).toHaveBeenLastCalledWith('hash-rc-account-1');
    expect(result.userSettings.language.value).toBe('en');
  });

  test('getUserSettings merges admin defaults, user overrides, removed keys, and plugin config rules', async () => {
    AdminConfigModel.findByPk.mockResolvedValueOnce({
      userSettings: {
        removedSetting: { isRemoved: true, value: 'hidden' },
        adminOnly: { value: 'admin-only', customizable: false },
        userEditable: { value: 'admin-default', customizable: true },
        plugin_sample: {
          customizable: true,
          value: {
            config: {
              locked: { value: 'admin-locked', customizable: false },
              fillsEmpty: { value: 'admin-fill', customizable: true },
              staysUserEditable: { value: 'admin-stay', customizable: true }
            }
          }
        },
        plugin_empty: {
          customizable: true,
          value: {
            config: {
              adminProvided: { value: 'admin-provided', customizable: true }
            }
          }
        },
        plugin_deleted: {
          customizable: true,
          value: {
            config: null
          }
        }
      }
    });

    const result = await userHandler.getUserSettings({
      user: {
        userSettings: {
          removedSetting: { value: 'user-hidden' },
          userEditable: { value: 'user-value', defaultValue: 'user-default', options: ['a'] },
          userOnly: { value: 'user-only' },
          plugin_sample: {
            value: {
              config: {
                locked: { value: 'user-locked', customizable: true },
                fillsEmpty: { value: '', customizable: true },
                staysUserEditable: { value: 'user-stay', customizable: true }
              }
            }
          },
          plugin_empty: {
            value: {
              config: {}
            }
          },
          plugin_deleted: {
            value: {
              config: {}
            }
          }
        }
      },
      rcAccountId: 'hashed-account'
    });

    expect(result.removedSetting).toBeUndefined();
    expect(result.adminOnly.value).toBe('admin-only');
    expect(result.userOnly.value).toBe('user-only');
    expect(result.userEditable).toEqual({
      customizable: true,
      value: 'user-value',
      defaultValue: 'user-default',
      options: ['a']
    });
    expect(result.plugin_sample.value.config.locked.value).toBe('admin-locked');
    expect(result.plugin_sample.value.config.fillsEmpty.value).toBe('admin-fill');
    expect(result.plugin_sample.value.config.staysUserEditable).toMatchObject({
      value: 'user-stay',
      customizable: true
    });
    expect(result.plugin_empty.value.config.adminProvided.value).toBe('admin-provided');
    expect(result.plugin_deleted).toBeUndefined();
  });

  test('getUserSettings falls back to user settings when admin lookup fails', async () => {
    AdminConfigModel.findByPk.mockRejectedValueOnce(new Error('admin settings unavailable'));

    const result = await userHandler.getUserSettings({
      user: {
        userSettings: {
          localOnly: { value: 'local' }
        }
      },
      rcAccountId: 'hashed-account'
    });

    expect(result).toEqual({
      localOnly: { value: 'local' }
    });
  });

  test('updateUserSettings supports connector hooks, removals, and database error mapping', async () => {
    const user = {
      userSettings: {
        oldKey: { value: 'old' },
        removeMe: { value: 'remove' }
      },
      update: jest.fn().mockImplementation(async function update(values) {
        user.userSettings = values.userSettings;
      })
    };

    connectorRegistry.getConnector.mockReturnValueOnce({});
    const defaultResult = await userHandler.updateUserSettings({
      user,
      userSettings: {
        newKey: { value: 'new' }
      },
      settingKeysToRemove: ['removeMe'],
      platformName: 'testCRM'
    });

    expect(defaultResult.userSettings).toEqual({
      oldKey: { value: 'old' },
      newKey: { value: 'new' }
    });
    expect(user.update).toHaveBeenCalledWith({
      userSettings: {
        oldKey: { value: 'old' },
        newKey: { value: 'new' }
      }
    });

    const hookUser = {
      userSettings: {},
      update: jest.fn()
    };
    connectorRegistry.getConnector.mockReturnValueOnce({
      onUpdateUserSettings: jest.fn().mockResolvedValue({
        successful: false,
        returnMessage: {
          messageType: 'warning',
          message: 'Rejected by connector'
        }
      })
    });
    const rejectedResult = await userHandler.updateUserSettings({
      user: hookUser,
      userSettings: {
        key: { value: 'value' }
      },
      settingKeysToRemove: [],
      platformName: 'testCRM'
    });

    expect(rejectedResult.successful).toBe(false);
    expect(hookUser.update).not.toHaveBeenCalled();

    const failingUser = {
      userSettings: {},
      update: jest.fn().mockRejectedValue(new Error('write failed'))
    };
    connectorRegistry.getConnector.mockReturnValueOnce({
      onUpdateUserSettings: jest.fn().mockResolvedValue({
        successful: true,
        returnMessage: {
          messageType: 'success',
          message: 'Allowed'
        }
      })
    });

    const failedUpdateResult = await userHandler.updateUserSettings({
      user: failingUser,
      userSettings: {
        key: { value: 'value' }
      },
      settingKeysToRemove: [],
      platformName: 'testCRM'
    });

    expect(failedUpdateResult.successful).toBe(false);
    expect(failedUpdateResult.returnMessage.messageType).toBe('warning');
  });
});
