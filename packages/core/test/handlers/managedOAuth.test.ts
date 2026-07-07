jest.mock('../../models/sequelize', () => {
  const { Sequelize } = require('sequelize');
  return {
    sequelize: new Sequelize({
      dialect: 'sqlite',
      storage: ':memory:',
      logging: false
    })
  };
});

const managedOAuth = require('../../handlers/managedOAuth');
const { AccountDataModel } = require('../../models/accountDataModel');
const { CacheModel } = require('../../models/cacheModel');
const { sequelize } = require('../../models/sequelize');

describe('Managed OAuth Handler', () => {
  beforeAll(async () => {
    process.env.APP_SERVER_SECRET_KEY = 'test-app-server-secret-key-123456';
    await AccountDataModel.sync({ force: true });
    await CacheModel.sync({ force: true });
  });

  afterEach(async () => {
    await AccountDataModel.destroy({ where: {} });
    await CacheModel.destroy({ where: {} });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  test('returns empty state when account and platform are missing', async () => {
    await expect(managedOAuth.getManagedOAuthState({
      rcAccountId: '',
      platform: '',
      isAdmin: false
    })).resolves.toEqual({
      isAdmin: false,
      hasAccountOAuth: false,
      hasPendingOAuth: false
    });

    await expect(managedOAuth.clearPendingManagedOAuth({})).resolves.toBe(0);
    await expect(managedOAuth.clearAccountManagedOAuth({ rcAccountId: 'acc-1' })).resolves.toBe(0);
  });

  test('upserts pending OAuth values, filters empty fields, and exposes pending values to admin', async () => {
    const firstRecord = await managedOAuth.upsertPendingManagedOAuth({
      rcAccountId: 'acc-1',
      values: {
        clientId: 'client-id',
        clientSecret: 'client-secret',
        accessTokenUri: '',
        authorizationUri: 'https://auth.example.com',
        ignored: 'ignored'
      }
    });

    expect(firstRecord.id).toBe('acc-1-managed-oauth-account');

    const secondRecord = await managedOAuth.upsertPendingManagedOAuth({
      rcAccountId: 'acc-1',
      values: {
        clientId: 'client-id-2',
        redirectUri: 'https://app.example.com/callback',
        scopes: ['read', 'write'],
        hostname: 'crm.example.com'
      }
    });

    expect(secondRecord.id).toBe(firstRecord.id);

    const pendingValues = await managedOAuth.getPendingManagedOAuthValues({ rcAccountId: 'acc-1' });
    expect(pendingValues).toEqual({
      clientId: 'client-id-2',
      redirectUri: 'https://app.example.com/callback',
      scopes: ['read', 'write'],
      hostname: 'crm.example.com'
    });

    const state = await managedOAuth.getManagedOAuthState({
      rcAccountId: 'acc-1',
      platform: 'testCRM',
      isAdmin: true
    });

    expect(state).toEqual({
      isAdmin: true,
      hasAccountOAuth: false,
      hasPendingOAuth: true,
      pendingValues
    });
  });

  test('expired pending OAuth cache is destroyed and ignored', async () => {
    const record = await managedOAuth.upsertPendingManagedOAuth({
      rcAccountId: 'expired-acc',
      values: {
        clientId: 'expired-client'
      }
    });
    await record.update({
      expiry: new Date(Date.now() - 1000)
    });

    const values = await managedOAuth.getPendingManagedOAuthValues({ rcAccountId: 'expired-acc' });

    expect(values).toEqual({});
    expect(await CacheModel.findByPk('expired-acc-managed-oauth-account')).toBeNull();
  });

  test('migrates pending OAuth to account record and hides account client secret in state', async () => {
    await managedOAuth.upsertPendingManagedOAuth({
      rcAccountId: 'acc-2',
      values: {
        clientId: 'client-id',
        clientSecret: 'client-secret',
        accessTokenUri: 'https://token.example.com'
      }
    });

    await expect(managedOAuth.migratePendingManagedOAuth({
      rcAccountId: 'acc-2',
      platform: 'testCRM'
    })).resolves.toBe(true);

    expect(await managedOAuth.getPendingManagedOAuthValues({ rcAccountId: 'acc-2' })).toEqual({});

    const accountValues = await managedOAuth.getAccountManagedOAuthValues({
      rcAccountId: 'acc-2',
      platform: 'testCRM'
    });
    expect(accountValues).toEqual({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      accessTokenUri: 'https://token.example.com'
    });

    const state = await managedOAuth.getManagedOAuthState({
      rcAccountId: 'acc-2',
      platform: 'testCRM',
      isAdmin: true
    });

    expect(state).toEqual({
      isAdmin: true,
      hasAccountOAuth: true,
      hasPendingOAuth: false,
      oauthValues: {
        clientId: 'client-id',
        accessTokenUri: 'https://token.example.com'
      }
    });
  });

  test('migrates pending OAuth into an existing account record and resolves account source first', async () => {
    await managedOAuth.upsertPendingManagedOAuth({
      rcAccountId: 'acc-3',
      values: {
        clientId: 'pending-client'
      }
    });
    await AccountDataModel.create({
      rcAccountId: 'acc-3',
      platformName: 'testCRM',
      dataKey: managedOAuth.MANAGED_OAUTH_ACCOUNT_DATA_KEY,
      data: {
        fields: {
          clientId: {
            encrypted: false,
            value: 'old-client'
          }
        }
      }
    });

    await expect(managedOAuth.migratePendingManagedOAuth({
      rcAccountId: 'acc-3',
      platform: 'testCRM'
    })).resolves.toBe(true);

    await expect(managedOAuth.resolveManagedOAuthInfo({
      rcAccountId: 'acc-3',
      platform: 'testCRM'
    })).resolves.toEqual({
      source: 'account',
      oauthInfo: {
        clientId: 'pending-client'
      }
    });
  });

  test('resolveManagedOAuthInfo falls back to pending values or null source', async () => {
    await managedOAuth.upsertPendingManagedOAuth({
      rcAccountId: 'acc-4',
      values: {
        clientId: 'pending-client'
      }
    });

    await expect(managedOAuth.resolveManagedOAuthInfo({
      rcAccountId: 'acc-4',
      platform: 'testCRM'
    })).resolves.toEqual({
      source: 'pending',
      oauthInfo: {
        clientId: 'pending-client'
      }
    });

    await expect(managedOAuth.resolveManagedOAuthInfo({
      rcAccountId: 'missing-acc',
      platform: 'testCRM'
    })).resolves.toEqual({
      source: null,
      oauthInfo: null
    });
  });

  test('clear and reset delete account and pending OAuth data', async () => {
    await managedOAuth.upsertPendingManagedOAuth({
      rcAccountId: 'acc-5',
      values: {
        clientId: 'pending-client'
      }
    });
    await managedOAuth.migratePendingManagedOAuth({
      rcAccountId: 'acc-5',
      platform: 'testCRM'
    });
    await managedOAuth.upsertPendingManagedOAuth({
      rcAccountId: 'acc-5',
      values: {
        clientId: 'pending-client-2'
      }
    });

    const resetResult = await managedOAuth.resetManagedOAuth({
      rcAccountId: 'acc-5',
      platform: 'testCRM'
    });

    expect(resetResult).toEqual({
      deletedAccountCount: 1,
      deletedPendingCount: 1
    });
  });

  test('throws when upserting pending OAuth without account id and no-ops missing migrations', async () => {
    await expect(managedOAuth.upsertPendingManagedOAuth({
      values: {
        clientId: 'client-id'
      }
    })).rejects.toThrow('rcAccountId is required');

    await expect(managedOAuth.migratePendingManagedOAuth({
      rcAccountId: 'no-pending',
      platform: 'testCRM'
    })).resolves.toBe(false);
  });
});

export {};
