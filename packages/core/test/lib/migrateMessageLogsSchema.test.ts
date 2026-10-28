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

  test('never rewrites the primary key or existing rows', async () => {
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
      query: jest.fn(),
      transaction: jest.fn(),
    };

    await migrateMessageLogsSchema(sequelize);

    expect(queryInterface.addColumn).not.toHaveBeenCalled();
    expect(sequelize.transaction).not.toHaveBeenCalled();
    expect(sequelize.query).not.toHaveBeenCalled();
  });

  test('uses the shared sequelize instance when none is passed', async () => {
    const queryInterface = {
      describeTable: jest.fn().mockResolvedValue({ id: {} }),
      addColumn: jest.fn().mockResolvedValue(undefined),
    };

    await jest.isolateModulesAsync(async () => {
      jest.doMock('../../models/sequelize', () => ({
        sequelize: { getQueryInterface: () => queryInterface },
      }));
      const { migrateMessageLogsSchema: isolatedMigrate } = require('../../lib/migrateMessageLogsSchema');

      await isolatedMigrate();
    });

    expect(queryInterface.describeTable).toHaveBeenCalledWith('messageLogs');
    expect(queryInterface.addColumn).toHaveBeenCalledWith(
      'messageLogs',
      'contactId',
      expect.objectContaining({ allowNull: true }),
    );
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
