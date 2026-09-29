const { migrateMessageLogsSchema } = require('../../lib/migrateMessageLogsSchema');

describe('migrateMessageLogsSchema', () => {
  test('adds a nullable contactId column when it is missing', async () => {
    const queryInterface = {
      describeTable: jest.fn().mockResolvedValue({ id: {} }),
      addColumn: jest.fn().mockResolvedValue(undefined),
    };

    await migrateMessageLogsSchema({
      getQueryInterface: () => queryInterface,
    });

    expect(queryInterface.addColumn).toHaveBeenCalledWith(
      'messageLogs',
      'contactId',
      expect.objectContaining({ allowNull: true }),
    );
  });

  test('does nothing when contactId already exists', async () => {
    const queryInterface = {
      describeTable: jest.fn().mockResolvedValue({ id: {}, contactId: {} }),
      addColumn: jest.fn(),
    };

    await migrateMessageLogsSchema({
      getQueryInterface: () => queryInterface,
    });

    expect(queryInterface.addColumn).not.toHaveBeenCalled();
  });

  test('tolerates another process adding contactId concurrently', async () => {
    const queryInterface = {
      describeTable: jest.fn()
        .mockResolvedValueOnce({ id: {} })
        .mockResolvedValueOnce({ id: {}, contactId: {} }),
      addColumn: jest.fn().mockRejectedValue(new Error('duplicate column')),
    };

    await expect(migrateMessageLogsSchema({
      getQueryInterface: () => queryInterface,
    })).resolves.toBeUndefined();
  });

  test('replaces an id-only primary key with the composite key on postgres', async () => {
    const queryInterface = {
      describeTable: jest.fn().mockResolvedValue({
        id: { primaryKey: true },
        platform: { primaryKey: false },
        userId: { primaryKey: false },
        contactId: {},
      }),
      addColumn: jest.fn(),
    };
    const sequelize = {
      getQueryInterface: () => queryInterface,
      getDialect: () => 'postgres',
      query: jest.fn().mockResolvedValue(undefined),
      transaction: jest.fn(async (callback) => callback('transaction-1')),
    };

    await migrateMessageLogsSchema(sequelize);

    expect(queryInterface.addColumn).not.toHaveBeenCalled();
    expect(sequelize.transaction).toHaveBeenCalledTimes(1);
    expect(sequelize.query).toHaveBeenCalledWith(
      'UPDATE "messageLogs" SET platform = COALESCE(platform, \'\'), "userId" = COALESCE("userId", \'\') WHERE platform IS NULL OR "userId" IS NULL',
      { transaction: 'transaction-1' },
    );
    expect(sequelize.query).toHaveBeenCalledWith(
      'ALTER TABLE "messageLogs" DROP CONSTRAINT IF EXISTS "messageLogs_pkey", ADD PRIMARY KEY (id, platform, "userId")',
      { transaction: 'transaction-1' },
    );
  });

  test('does not migrate the primary key on sqlite', async () => {
    const queryInterface = {
      describeTable: jest.fn().mockResolvedValue({
        id: { primaryKey: true },
        platform: { primaryKey: false },
        userId: { primaryKey: false },
        contactId: {},
      }),
    };
    const sequelize = {
      getQueryInterface: () => queryInterface,
      getDialect: () => 'sqlite',
      query: jest.fn(),
      transaction: jest.fn(),
    };

    await migrateMessageLogsSchema(sequelize);

    expect(sequelize.transaction).not.toHaveBeenCalled();
    expect(sequelize.query).not.toHaveBeenCalled();
  });

  test('leaves a composite primary key unchanged', async () => {
    const queryInterface = {
      describeTable: jest.fn().mockResolvedValue({
        id: { primaryKey: true },
        platform: { primaryKey: true },
        userId: { primaryKey: true },
        contactId: {},
      }),
    };
    const sequelize = {
      getQueryInterface: () => queryInterface,
      getDialect: jest.fn(),
      query: jest.fn(),
    };

    await migrateMessageLogsSchema(sequelize);

    expect(sequelize.query).not.toHaveBeenCalled();
  });

  test('rethrows an add-column failure when contactId is still missing', async () => {
    const migrationError = new Error('database unavailable');
    const queryInterface = {
      describeTable: jest.fn().mockResolvedValue({ id: {} }),
      addColumn: jest.fn().mockRejectedValue(migrationError),
    };

    await expect(migrateMessageLogsSchema({
      getQueryInterface: () => queryInterface,
    })).rejects.toBe(migrationError);
  });
});
