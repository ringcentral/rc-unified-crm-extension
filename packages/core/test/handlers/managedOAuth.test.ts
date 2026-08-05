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

const managedOAuth = require('../../handlers/managedOAuth');
const { AccountDataModel } = require('../../models/accountDataModel');
const { CacheModel } = require('../../models/cacheModel');
const { sequelize } = require('../../models/sequelize');
const {
  managedOAuthValueCases,
  managedOAuthStateCases,
  managedOAuthResolutionCases,
  managedOAuthIsolationData,
  managedOAuthExpiryCase,
  managedOAuthResetCase,
} = require('../data/managedOAuthCases');

async function seedAccountOAuth({ rcAccountId, platform, values }) {
  await managedOAuth.upsertPendingManagedOAuth({
    rcAccountId,
    values,
  });
  await managedOAuth.migratePendingManagedOAuth({
    rcAccountId,
    platform,
  });
}

async function seedOAuthSources({
  rcAccountId,
  platform,
  accountValues,
  pendingValues,
}) {
  if (accountValues) {
    await seedAccountOAuth({
      rcAccountId,
      platform,
      values: accountValues,
    });
  }
  if (pendingValues) {
    await managedOAuth.upsertPendingManagedOAuth({
      rcAccountId,
      values: pendingValues,
    });
  }
}

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

  describe('pending OAuth values', () => {
    test.each(managedOAuthValueCases)('$label', async (...args: any[]) => {
      const { rcAccountId, values, expectedValues } = args[0];
      const record = await managedOAuth.upsertPendingManagedOAuth({
        rcAccountId,
        values,
      });

      expect(record.id).toBe(`${rcAccountId}-managed-oauth-account`);
      await expect(managedOAuth.getPendingManagedOAuthValues({
        rcAccountId,
      })).resolves.toEqual(expectedValues);
    });

    test('upserting pending OAuth replaces the previous pending field set', async () => {
      await managedOAuth.upsertPendingManagedOAuth({
        rcAccountId: 'pending-replacement-account',
        values: {
          clientId: 'first-client',
          clientSecret: 'first-secret',
        },
      });
      await managedOAuth.upsertPendingManagedOAuth({
        rcAccountId: 'pending-replacement-account',
        values: {
          clientId: 'second-client',
          redirectUri: 'https://app.example.com/oauth/callback',
        },
      });

      await expect(managedOAuth.getPendingManagedOAuthValues({
        rcAccountId: 'pending-replacement-account',
      })).resolves.toEqual({
        clientId: 'second-client',
        redirectUri: 'https://app.example.com/oauth/callback',
      });
    });

    test('expired pending OAuth is deleted and ignored', async () => {
      const { rcAccountId, values } = managedOAuthExpiryCase;
      const record = await managedOAuth.upsertPendingManagedOAuth({
        rcAccountId,
        values,
      });
      await record.update({
        expiry: new Date(Date.now() - 1000),
      });

      await expect(managedOAuth.getPendingManagedOAuthValues({
        rcAccountId,
      })).resolves.toEqual({});
      await expect(CacheModel.findByPk(
        `${rcAccountId}-managed-oauth-account`,
      )).resolves.toBeNull();
    });
  });

  describe('OAuth state and redaction', () => {
    test.each(managedOAuthStateCases)('$label', async (...args: any[]) => {
      const {
        rcAccountId,
        platform,
        isAdmin,
        accountValues,
        pendingValues,
        expectedState,
      } = args[0];
      await seedOAuthSources({
        rcAccountId,
        platform,
        accountValues,
        pendingValues,
      });

      const state = await managedOAuth.getManagedOAuthState({
        rcAccountId,
        platform,
        isAdmin,
      });

      expect(state).toEqual(expectedState);
      if (state.oauthValues) {
        expect(state.oauthValues).not.toHaveProperty('clientSecret');
      }
    });
  });

  describe('OAuth source resolution', () => {
    test.each(managedOAuthResolutionCases)('$label', async (...args: any[]) => {
      const {
        rcAccountId,
        platform,
        accountValues,
        pendingValues,
        expectedResolution,
      } = args[0];
      await seedOAuthSources({
        rcAccountId,
        platform,
        accountValues,
        pendingValues,
      });

      await expect(managedOAuth.resolveManagedOAuthInfo({
        rcAccountId,
        platform,
      })).resolves.toEqual(expectedResolution);
    });
  });

  test('migrating pending OAuth replaces an existing account record and clears pending data', async () => {
    await seedAccountOAuth({
      rcAccountId: 'migration-update-account',
      platform: 'testCRM',
      values: {
        clientId: 'old-client',
        clientSecret: 'old-secret',
      },
    });
    await managedOAuth.upsertPendingManagedOAuth({
      rcAccountId: 'migration-update-account',
      values: {
        clientId: 'new-client',
      },
    });

    await expect(managedOAuth.migratePendingManagedOAuth({
      rcAccountId: 'migration-update-account',
      platform: 'testCRM',
    })).resolves.toBe(true);
    await expect(managedOAuth.getAccountManagedOAuthValues({
      rcAccountId: 'migration-update-account',
      platform: 'testCRM',
    })).resolves.toEqual({
      clientId: 'new-client',
    });
    await expect(managedOAuth.getPendingManagedOAuthValues({
      rcAccountId: 'migration-update-account',
    })).resolves.toEqual({});
  });

  test('account OAuth values are isolated by RC account and platform', async () => {
    for (const account of managedOAuthIsolationData.accounts) {
      await seedAccountOAuth(account);
    }

    for (const lookup of managedOAuthIsolationData.lookups) {
      await expect(managedOAuth.getAccountManagedOAuthValues({
        rcAccountId: lookup.rcAccountId,
        platform: lookup.platform,
      })).resolves.toEqual(lookup.expectedValues);
    }
  });

  test('reset deletes both account and pending OAuth data', async () => {
    const {
      rcAccountId,
      platform,
      accountValues,
      pendingValues,
    } = managedOAuthResetCase;
    await seedOAuthSources({
      rcAccountId,
      platform,
      accountValues,
      pendingValues,
    });

    await expect(managedOAuth.resetManagedOAuth({
      rcAccountId,
      platform,
    })).resolves.toEqual({
      deletedAccountCount: 1,
      deletedPendingCount: 1,
    });
    await expect(managedOAuth.resolveManagedOAuthInfo({
      rcAccountId,
      platform,
    })).resolves.toEqual({
      source: null,
      oauthInfo: null,
    });
  });

  test('missing identifiers use empty/no-op behavior and pending upsert requires an account id', async () => {
    await expect(managedOAuth.getManagedOAuthState({
      rcAccountId: '',
      platform: '',
      isAdmin: false,
    })).resolves.toEqual({
      isAdmin: false,
      hasAccountOAuth: false,
      hasPendingOAuth: false,
    });
    await expect(managedOAuth.clearPendingManagedOAuth({})).resolves.toBe(0);
    await expect(managedOAuth.clearAccountManagedOAuth({
      rcAccountId: 'account-without-platform',
    })).resolves.toBe(0);
    await expect(managedOAuth.migratePendingManagedOAuth({
      rcAccountId: 'account-without-pending',
      platform: 'testCRM',
    })).resolves.toBe(false);
    await expect(managedOAuth.upsertPendingManagedOAuth({
      values: { clientId: 'client-id' },
    })).rejects.toThrow('rcAccountId is required');
  });
});

export {};
