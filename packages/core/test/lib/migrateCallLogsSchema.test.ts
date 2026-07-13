const {
  ensureCallLogsHashedExtensionIdSchema,
  ensureCallLogsHashedExtensionIdSchemaPostgresOnline,
  findColumnKey,
  runCallLogsSchemaMigration,
  sqliteCallLogsPkIncludesExtension,
  sqliteCallLogsPkIncludesHashedExtension,
} = require('../../lib/migrateCallLogsSchema');

function createQueryGenerator() {
  return {
    quoteIdentifier: jest.fn((id) => `"${id}"`),
    quoteTable: jest.fn(({ tableName }) => `"${tableName}"`),
  };
}

function createSqliteSequelize({ createSql, descriptions = [] }) {
  const descQueue = [...descriptions];
  const queryGenerator = createQueryGenerator();
  const qi = {
    queryGenerator,
    describeTable: jest.fn(async () => descQueue.shift() ?? {}),
    addColumn: jest.fn(async () => {}),
  };
  const sequelize = {
    getDialect: jest.fn(() => 'sqlite'),
    getQueryInterface: jest.fn(() => qi),
    query: jest.fn(async (sql) => {
      if (String(sql).includes('sqlite_master')) {
        return createSql === undefined ? [] : [{ sql: createSql }];
      }
      return [];
    }),
    transaction: jest.fn(async (callback) => callback({ id: 'tx' })),
  };
  return { sequelize, qi };
}

function createPostgresSequelize({ hasIdentityPk = false, descriptions = [{}], primaryKeyName = 'callLogs_pkey' } = {}) {
  const descQueue = [...descriptions];
  const queryGenerator = createQueryGenerator();
  const qi = {
    queryGenerator,
    describeTable: jest.fn(async () => descQueue.shift() ?? {}),
    addColumn: jest.fn(async () => {}),
  };
  const sequelize = {
    getDialect: jest.fn(() => 'postgres'),
    getQueryInterface: jest.fn(() => qi),
    query: jest.fn(async (sql) => {
      const text = String(sql);
      if (text.includes('information_schema.table_constraints')) {
        return primaryKeyName ? [{ constraintName: primaryKeyName }] : [];
      }
      if (text.includes('information_schema.key_column_usage')) {
        const rows = [
          { columnName: 'id' },
          { columnName: 'sessionId' },
          { columnName: 'extensionNumber' },
        ];
        return hasIdentityPk ? [...rows, { columnName: 'hashedExtensionId' }] : rows;
      }
      return [];
    }),
    transaction: jest.fn(async (callback) => callback({ id: 'tx' })),
  };
  return { sequelize, qi };
}

function createOnlinePostgresSequelize(client, hasIdentityPk = false) {
  const { sequelize: baseSequelize } = createPostgresSequelize({ hasIdentityPk });
  const connectionManager = {
    getConnection: jest.fn(async () => client),
    releaseConnection: jest.fn(),
  };
  const sequelize = Object.assign(baseSequelize, { connectionManager });
  return { sequelize, connectionManager };
}

describe('call log schema migration helpers', () => {
  test('finds columns case-insensitively and detects SQLite primary-key shapes', async () => {
    expect(findColumnKey({ HashedExtensionID: {} }, 'hashedExtensionId')).toBe('HashedExtensionID');
    expect(findColumnKey({ id: {} }, 'missing')).toBeUndefined();

    const legacy = createSqliteSequelize({
      createSql: 'CREATE TABLE callLogs (id text, extensionNumber text, PRIMARY KEY ("id", "sessionId", "extensionNumber"))',
    });
    await expect(sqliteCallLogsPkIncludesExtension(legacy.sequelize)).resolves.toBe(true);
    await expect(sqliteCallLogsPkIncludesHashedExtension(legacy.sequelize)).resolves.toBe(false);

    const invalid = createSqliteSequelize({ createSql: null });
    await expect(sqliteCallLogsPkIncludesExtension(invalid.sequelize)).resolves.toBe(false);
  });

  test('skips SQLite migration when the identity column and primary key already exist', async () => {
    const { sequelize, qi } = createSqliteSequelize({
      descriptions: [{ hashedExtensionId: {} }],
      createSql: 'CREATE TABLE callLogs (PRIMARY KEY (id, sessionId, extensionNumber, hashedExtensionId))',
    });

    await ensureCallLogsHashedExtensionIdSchema(sequelize);

    expect(qi.addColumn).not.toHaveBeenCalled();
    expect(sequelize.transaction).not.toHaveBeenCalled();
  });

  test('adds the SQLite identity column before checking whether a rebuild is needed', async () => {
    const { sequelize, qi } = createSqliteSequelize({
      descriptions: [{ id: {} }, { id: {}, hashedExtensionId: {} }],
      createSql: 'CREATE TABLE callLogs (PRIMARY KEY (id, sessionId, extensionNumber, hashedExtensionId))',
    });

    await ensureCallLogsHashedExtensionIdSchema(sequelize);

    expect(qi.addColumn).toHaveBeenCalledWith('callLogs', 'hashedExtensionId', expect.objectContaining({
      allowNull: false,
      defaultValue: '',
    }));
    expect(qi.describeTable).toHaveBeenCalledTimes(2);
    expect(sequelize.transaction).not.toHaveBeenCalled();
  });

  test('rebuilds a legacy SQLite table and fills missing identity columns with defaults', async () => {
    const { sequelize } = createSqliteSequelize({
      descriptions: [
        { hashedExtensionId: {} },
        {
          ID: {},
          sessionId: {},
          platform: {},
          thirdPartyLogId: {},
          userId: {},
          contactId: {},
          createdAt: {},
          updatedAt: {},
        },
      ],
      createSql: 'CREATE TABLE callLogs (id text, sessionId text, PRIMARY KEY (id, sessionId))',
    });

    await ensureCallLogsHashedExtensionIdSchema(sequelize);

    expect(sequelize.transaction).toHaveBeenCalledTimes(1);
    const sql = sequelize.query.mock.calls.map(([text]) => String(text)).join('\n');
    expect(sql).toContain('ALTER TABLE "callLogs" RENAME TO "callLogs_mig_legacy_');
    expect(sql).toContain('CREATE TABLE "callLogs"');
    expect(sql).toContain('PRIMARY KEY ("id", "sessionId", "extensionNumber", "hashedExtensionId")');
    expect(sql).toContain('CAST(\'\' AS VARCHAR(255))');
    expect(sql).toContain('DROP TABLE "callLogs_mig_legacy_');
  });

  test('fails SQLite rebuilds when required legacy columns are missing', async () => {
    const { sequelize } = createSqliteSequelize({
      descriptions: [
        { hashedExtensionId: {} },
        {
          id: {},
          sessionId: {},
          createdAt: {},
          updatedAt: {},
        },
      ],
      createSql: 'CREATE TABLE callLogs (id text, sessionId text, PRIMARY KEY (id, sessionId))',
    });

    await expect(ensureCallLogsHashedExtensionIdSchema(sequelize)).rejects.toThrow(
      'unexpected callLogs schema before migration',
    );
  });

  test('rebuilds a legacy Postgres primary key when hashedExtensionId is missing from the key', async () => {
    const { sequelize, qi } = createPostgresSequelize({
      hasIdentityPk: false,
      descriptions: [{ id: {} }, { id: {}, hashedExtensionId: {} }],
    });

    await ensureCallLogsHashedExtensionIdSchema(sequelize);

    expect(qi.addColumn).toHaveBeenCalledWith('callLogs', 'hashedExtensionId', expect.objectContaining({
      allowNull: false,
      defaultValue: '',
    }));
    expect(sequelize.transaction).toHaveBeenCalledTimes(1);
    const sql = sequelize.query.mock.calls.map(([text]) => String(text)).join('\n');
    expect(sql).toContain('DROP CONSTRAINT "callLogs_pkey"');
    expect(sql).toContain('ADD PRIMARY KEY ("id", "sessionId", "extensionNumber", "hashedExtensionId")');
  });

  test('adds a Postgres identity primary key when no existing primary key constraint is found', async () => {
    const { sequelize, qi } = createPostgresSequelize({
      hasIdentityPk: false,
      descriptions: [{ hashedExtensionId: {} }],
      primaryKeyName: null,
    });

    await ensureCallLogsHashedExtensionIdSchema(sequelize);

    expect(qi.addColumn).not.toHaveBeenCalled();
    const sql = sequelize.query.mock.calls.map(([text]) => String(text)).join('\n');
    expect(sql).not.toContain('DROP CONSTRAINT');
    expect(sql).toContain('ADD PRIMARY KEY ("id", "sessionId", "extensionNumber", "hashedExtensionId")');
  });
});

describe('online Postgres call log schema migration', () => {
  test('skips without opening a dedicated connection when the pooled precheck is already migrated', async () => {
    const client = { query: jest.fn() };
    const { sequelize, connectionManager } = createOnlinePostgresSequelize(client, true);

    await ensureCallLogsHashedExtensionIdSchemaPostgresOnline(sequelize);

    expect(connectionManager.getConnection).not.toHaveBeenCalled();
    expect(client.query).not.toHaveBeenCalled();
  });

  test('skips and releases the connection when another instance owns the advisory lock', async () => {
    const client = {
      query: jest.fn(async (sql) => {
        if (String(sql).includes('pg_try_advisory_lock')) {
          return { rows: [{ locked: false }] };
        }
        return { rows: [] };
      }),
    };
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const { sequelize, connectionManager } = createOnlinePostgresSequelize(client, false);

    await ensureCallLogsHashedExtensionIdSchemaPostgresOnline(sequelize, logger);

    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('another instance is migrating; skipping this run'));
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes('pg_advisory_unlock'))).toBe(false);
    expect(connectionManager.releaseConnection).toHaveBeenCalledWith(client);
  });

  test('rechecks identity primary key under the advisory lock and exits early when already migrated', async () => {
    const client = {
      query: jest.fn(async (sql) => {
        const text = String(sql);
        if (text.includes('pg_try_advisory_lock')) return { rows: [{ locked: true }] };
        if (text.includes('tc.constraint_type = ')) {
          return {
            rows: [
              { col: 'id' },
              { col: 'sessionId' },
              { col: 'extensionNumber' },
              { col: 'hashedExtensionId' },
            ],
          };
        }
        return { rows: [] };
      }),
    };
    const { sequelize, connectionManager } = createOnlinePostgresSequelize(client, false);

    await ensureCallLogsHashedExtensionIdSchemaPostgresOnline(sequelize);

    const sql = client.query.mock.calls.map(([text]) => String(text)).join('\n');
    expect(sql).not.toContain('SET statement_timeout = 0');
    expect(sql).toContain('RESET statement_timeout');
    expect(sql).toContain('pg_advisory_unlock');
    expect(connectionManager.releaseConnection).toHaveBeenCalledWith(client);
  });

  test('runs the online migration and reuses a valid unique index', async () => {
    const client = {
      query: jest.fn(async (sql) => {
        const text = String(sql);
        if (text.includes('pg_try_advisory_lock')) return { rows: [{ locked: true }] };
        if (text.includes('tc.constraint_type = ')) return { rows: [{ col: 'id' }, { col: 'sessionId' }, { col: 'extensionNumber' }] };
        if (text.includes('information_schema.columns')) return { rows: [{ is_nullable: 'YES' }] };
        if (text.includes('pg_index')) return { rows: [{ ok: true }] };
        if (text.includes('pg_constraint')) return { rows: [{ conname: 'callLogs_pkey' }] };
        return { rows: [] };
      }),
    };
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const { sequelize, connectionManager } = createOnlinePostgresSequelize(client, false);

    await ensureCallLogsHashedExtensionIdSchemaPostgresOnline(sequelize, logger);

    const sql = client.query.mock.calls.map(([text]) => String(text)).join('\n');
    expect(sql).toContain('SET statement_timeout = 0');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "hashedExtensionId"');
    expect(sql).toContain('UPDATE "callLogs" SET "extensionNumber" = \'\' WHERE "extensionNumber" IS NULL');
    expect(sql).toContain('ALTER TABLE "callLogs" ALTER COLUMN "extensionNumber" SET NOT NULL');
    expect(sql).not.toContain('CREATE UNIQUE INDEX CONCURRENTLY');
    expect(sql).toContain('DROP CONSTRAINT "callLogs_pkey", ADD PRIMARY KEY USING INDEX "callLogs_identity_pk"');
    expect(sql).toContain('RESET statement_timeout');
    expect(sql).toContain('RESET lock_timeout');
    expect(sql).toContain('pg_advisory_unlock');
    expect(connectionManager.releaseConnection).toHaveBeenCalledWith(client);
  });

  test('drops an invalid index, rebuilds it, and adds a primary key when none exists', async () => {
    const client = {
      query: jest.fn(async (sql) => {
        const text = String(sql);
        if (text.includes('pg_try_advisory_lock')) return { rows: [{ locked: true }] };
        if (text.includes('tc.constraint_type = ')) return { rows: [{ col: 'id' }, { col: 'sessionId' }, { col: 'extensionNumber' }] };
        if (text.includes('information_schema.columns')) return { rows: [{ is_nullable: 'NO' }] };
        if (text.includes('pg_index')) return { rows: [{ ok: false }] };
        if (text.includes('pg_constraint')) return { rows: [] };
        return { rows: [] };
      }),
    };
    const { sequelize } = createOnlinePostgresSequelize(client, false);

    await ensureCallLogsHashedExtensionIdSchemaPostgresOnline(sequelize);

    const sql = client.query.mock.calls.map(([text]) => String(text)).join('\n');
    expect(sql).toContain('DROP INDEX CONCURRENTLY IF EXISTS "callLogs_identity_pk"');
    expect(sql).toContain('CREATE UNIQUE INDEX CONCURRENTLY "callLogs_identity_pk"');
    expect(sql).toContain('ALTER TABLE "callLogs" ADD PRIMARY KEY USING INDEX "callLogs_identity_pk"');
  });

  test('logs migration failures instead of throwing from the startup entry point', async () => {
    const logger = { error: jest.fn() };
    const sequelize = {
      getDialect: jest.fn(() => {
        throw new Error('dialect failed');
      }),
    };

    await expect(runCallLogsSchemaMigration(sequelize, logger)).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith(
      '[callLogs migration] failed; will retry on next start',
      expect.objectContaining({ message: 'dialect failed' }),
    );
  });
});
