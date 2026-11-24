const { migrateCallDownListSchema } = require('../../lib/migrateCallDownListSchema');

describe('migrateCallDownListSchema', () => {
  test('adds nullable platform and thirdPartyId columns when they are missing', async () => {
    const queryInterface = {
      describeTable: jest.fn().mockResolvedValue({ id: {} }),
      addColumn: jest.fn().mockResolvedValue(undefined),
    };

    await migrateCallDownListSchema({
      getQueryInterface: () => queryInterface,
    });

    expect(queryInterface.addColumn).toHaveBeenCalledWith(
      'callDownLists',
      'platform',
      expect.objectContaining({ allowNull: true }),
    );
    expect(queryInterface.addColumn).toHaveBeenCalledWith(
      'callDownLists',
      'thirdPartyId',
      expect.objectContaining({ allowNull: true }),
    );
  });

  test('does nothing when both columns already exist', async () => {
    const queryInterface = {
      describeTable: jest.fn().mockResolvedValue({
        id: {},
        platform: {},
        thirdPartyId: {},
      }),
      addColumn: jest.fn(),
    };

    await migrateCallDownListSchema({
      getQueryInterface: () => queryInterface,
    });

    expect(queryInterface.addColumn).not.toHaveBeenCalled();
  });

  test('tolerates another process adding a column concurrently', async () => {
    const queryInterface = {
      describeTable: jest.fn()
        .mockResolvedValueOnce({ id: {} })
        .mockResolvedValueOnce({ id: {}, platform: {} })
        .mockResolvedValueOnce({ id: {}, platform: {}, thirdPartyId: {} }),
      addColumn: jest.fn()
        .mockRejectedValueOnce(new Error('duplicate column'))
        .mockResolvedValueOnce(undefined),
    };

    await expect(migrateCallDownListSchema({
      getQueryInterface: () => queryInterface,
    })).resolves.toBeUndefined();
    expect(queryInterface.addColumn).toHaveBeenCalledTimes(2);
  });

  test('rethrows an add-column failure when the column is still missing', async () => {
    const migrationError = new Error('database unavailable');
    const queryInterface = {
      describeTable: jest.fn().mockResolvedValue({ id: {} }),
      addColumn: jest.fn().mockRejectedValue(migrationError),
    };

    await expect(migrateCallDownListSchema({
      getQueryInterface: () => queryInterface,
    })).rejects.toBe(migrationError);
  });
});

export {};
