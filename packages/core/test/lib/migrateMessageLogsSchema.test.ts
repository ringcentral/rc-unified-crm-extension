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
