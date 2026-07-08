describe('TypeScript model definitions', () => {
  const loadSequelizeModel = (modulePath) => {
    jest.resetModules();
    const model = {
      findOne: jest.fn(),
      create: jest.fn()
    };
    const define = jest.fn(() => model);
    jest.doMock('../../models/sequelize', () => ({
      sequelize: { define }
    }));

    const moduleExports = require(modulePath);
    return { define, model, moduleExports };
  };

  const loadDynamoModel = (modulePath) => {
    jest.resetModules();
    const Schema = jest.fn(function Schema(definition, options) {
      this.definition = definition;
      this.options = options;
    });
    const modelInstance = {};
    const model = jest.fn(() => modelInstance);
    jest.doMock('dynamoose', () => ({
      Schema,
      model
    }));

    const moduleExports = require(modulePath);
    return { Schema, model, modelInstance, moduleExports };
  };

  afterEach(() => {
    jest.dontMock('../../models/sequelize');
    jest.dontMock('sequelize');
    jest.dontMock('dynamoose');
  });

  const restoreEnvValue = (name, value) => {
    if (typeof value === 'undefined') {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  };

  test('userModel.ts defines the users model with auth fields', () => {
    const { define, moduleExports } = loadSequelizeModel('../../models/userModel.ts');

    expect(moduleExports.UserModel).toBeDefined();
    expect(define).toHaveBeenCalledWith(
      'users',
      expect.objectContaining({
        id: expect.objectContaining({ primaryKey: true }),
        accessToken: expect.any(Object),
        refreshToken: expect.any(Object),
        tokenExpiry: expect.any(Object),
        userSettings: expect.any(Object)
      })
    );
  });

  test('callLogModel.ts preserves the composite identity key', () => {
    const { define, moduleExports } = loadSequelizeModel('../../models/callLogModel.ts');

    expect(moduleExports.CallLogModel).toBeDefined();
    expect(define).toHaveBeenCalledWith(
      'callLogs',
      expect.objectContaining({
        id: expect.objectContaining({ primaryKey: true }),
        sessionId: expect.objectContaining({ primaryKey: true }),
        extensionNumber: expect.objectContaining({
          primaryKey: true,
          allowNull: false,
          defaultValue: ''
        }),
        hashedExtensionId: expect.objectContaining({
          primaryKey: true,
          allowNull: false,
          defaultValue: ''
        })
      })
    );
  });

  test('accountDataModel.ts exports getOrRefreshAccountData behavior', async () => {
    const { model, moduleExports } = loadSequelizeModel('../../models/accountDataModel.ts');
    const existing = {
      data: { old: true },
      update: jest.fn()
    };
    model.findOne.mockResolvedValue(existing);

    await expect(moduleExports.getOrRefreshAccountData({
      rcAccountId: 'account-1',
      platformName: 'crm',
      dataKey: 'contacts',
      forceRefresh: false,
      fetchFn: jest.fn()
    })).resolves.toEqual({ old: true });

    expect(model.findOne).toHaveBeenCalledWith({
      where: {
        rcAccountId: 'account-1',
        platformName: 'crm',
        dataKey: 'contacts'
      }
    });
    expect(existing.update).not.toHaveBeenCalled();
  });

  test('cacheModel.ts and callDownListModel.ts preserve indexes', () => {
    const cache = loadSequelizeModel('../../models/cacheModel.ts');
    expect(cache.define).toHaveBeenCalledWith(
      'cache',
      expect.objectContaining({
        id: expect.objectContaining({ primaryKey: true }),
        expiry: expect.any(Object)
      }),
      expect.objectContaining({
        indexes: [{ fields: ['expiry'] }]
      })
    );

    const callDownList = loadSequelizeModel('../../models/callDownListModel.ts');
    expect(callDownList.define).toHaveBeenCalledWith(
      'callDownLists',
      expect.objectContaining({
        id: expect.objectContaining({ primaryKey: true }),
        scheduledAt: expect.any(Object)
      }),
      expect.objectContaining({
        timestamps: true,
        indexes: expect.arrayContaining([
          { fields: ['userId'] },
          { fields: ['status'] },
          { fields: ['scheduledAt'] },
          { fields: ['userId', 'status'] }
        ])
      })
    );
  });

  test('remaining Sequelize TS model modules export their model definitions', () => {
    const modules: Array<[string, string, string, string[]]> = [
      ['../../models/adminConfigModel.ts', 'AdminConfigModel', 'adminConfigs', ['id', 'userSettings', 'adminAccessToken']],
      ['../../models/llmSessionModel.ts', 'LlmSessionModel', 'llmSessions', ['id', 'jwtToken', 'expiry']],
      ['../../models/messageLogModel.ts', 'MessageLogModel', 'messageLogs', ['id', 'conversationId', 'conversationLogId']]
    ];

    for (const [modulePath, exportName, modelName, expectedFields] of modules) {
      const { define, moduleExports } = loadSequelizeModel(modulePath);
      const calls = define.mock.calls as any[];
      const [, attributes] = calls[0] as [string, any];

      expect(moduleExports[exportName]).toBeDefined();
      expect(calls[0][0]).toBe(modelName);
      for (const field of expectedFields) {
        expect(attributes[field]).toBeDefined();
      }
    }
  });

  const loadSequelizeConfig = (databaseUrl: string, databaseSsl?: string) => {
    jest.resetModules();
    const previousDatabaseUrl = process.env.DATABASE_URL;
    const previousDatabaseSsl = process.env.DATABASE_SSL;
    process.env.DATABASE_URL = databaseUrl;
    if (typeof databaseSsl === 'undefined') {
      delete process.env.DATABASE_SSL;
    } else {
      process.env.DATABASE_SSL = databaseSsl;
    }

    const Sequelize = jest.fn();
    jest.doMock('sequelize', () => ({ Sequelize }));

    try {
      const { sequelize } = require('../../models/sequelize.ts');
      expect(sequelize).toBeInstanceOf(Sequelize);
      return Sequelize.mock.calls[0] as [string, any];
    } finally {
      restoreEnvValue('DATABASE_URL', previousDatabaseUrl);
      restoreEnvValue('DATABASE_SSL', previousDatabaseSsl);
    }
  };

  test('sequelize.ts enables SSL for remote postgres URLs by default', () => {
    const [databaseUrl, options] = loadSequelizeConfig('postgres://user:password@db.example.com:5432/app_connect');

    expect(databaseUrl).toBe('postgres://user:password@db.example.com:5432/app_connect');
    expect(options).toEqual(expect.objectContaining({
      dialect: 'postgres',
      protocol: 'postgres',
      dialectOptions: {
        ssl: {
          rejectUnauthorized: false
        }
      },
      logging: false
    }));
  });

  test('sequelize.ts disables SSL for localhost postgres URLs by default', () => {
    const [, options] = loadSequelizeConfig('postgres://user:password@localhost:5432/app_connect');

    expect(options).toEqual(expect.objectContaining({
      dialect: 'postgres',
      protocol: 'postgres',
      logging: false
    }));
    expect(options).not.toHaveProperty('dialectOptions');
  });

  test('sequelize.ts lets DATABASE_SSL override the postgres host default', () => {
    const [, remoteOptions] = loadSequelizeConfig(
      'postgres://user:password@db.example.com:5432/app_connect',
      'false'
    );
    const [, localOptions] = loadSequelizeConfig(
      'postgres://user:password@localhost:5432/app_connect',
      'true'
    );

    expect(remoteOptions).not.toHaveProperty('dialectOptions');
    expect(localOptions).toEqual(expect.objectContaining({
      dialectOptions: {
        ssl: {
          rejectUnauthorized: false
        }
      }
    }));
  });

  test('sequelize.ts keeps sqlite URLs on sqlite without SSL options', () => {
    const [, options] = loadSequelizeConfig('sqlite::memory:');

    expect(options).toEqual(expect.objectContaining({
      dialect: 'sqlite',
      logging: false
    }));
    expect(options).not.toHaveProperty('protocol');
    expect(options).not.toHaveProperty('dialectOptions');
  });

  test('Dynamo TS schemas preserve model names and table options', () => {
    const previousDynamoPrefix = process.env.DYNAMODB_TABLE_PREFIX;
    const previousDeveloperPrefix = process.env.DEVELOPER_DYNAMODB_TABLE_PREFIX;
    process.env.DYNAMODB_TABLE_PREFIX = 'app-';
    process.env.DEVELOPER_DYNAMODB_TABLE_PREFIX = 'dev-';

    const lock = loadDynamoModel('../../models/dynamo/lockSchema.ts');
    expect(lock.model).toHaveBeenCalledWith(
      '-token-refresh-lock',
      expect.any(Object),
      expect.objectContaining({
        prefix: 'app-',
        expires: 60
      })
    );
    expect(lock.moduleExports.Lock).toBe(lock.modelInstance);

    const noteCache = loadDynamoModel('../../models/dynamo/noteCacheSchema.ts');
    expect(noteCache.model).toHaveBeenCalledWith(
      '-note-cache',
      expect.any(Object),
      expect.objectContaining({
        prefix: 'app-',
        expires: 60
      })
    );
    expect(noteCache.moduleExports.NoteCache).toBe(noteCache.modelInstance);

    const connector = loadDynamoModel('../../models/dynamo/connectorSchema.ts');
    expect(connector.model).toHaveBeenCalledWith(
      'connectors',
      expect.any(Object),
      expect.objectContaining({
        prefix: 'dev-'
      })
    );
    expect(connector.moduleExports.Connector.getProxyConfig).toEqual(expect.any(Function));

    restoreEnvValue('DYNAMODB_TABLE_PREFIX', previousDynamoPrefix);
    restoreEnvValue('DEVELOPER_DYNAMODB_TABLE_PREFIX', previousDeveloperPrefix);
  });
});

export {};
