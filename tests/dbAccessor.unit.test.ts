describe('dbAccessor', () => {
  function loadDbAccessor({ queryImpl }) {
    jest.resetModules();
    jest.doMock('@app-connect/core/models/sequelize', () => ({
      sequelize: {
        query: jest.fn(queryImpl)
      }
    }));
    jest.doMock('@app-connect/core/lib/logger', () => ({
      info: jest.fn(),
      error: jest.fn()
    }));

    return require('../src/dbAccessor');
  }

  afterEach(() => {
    jest.dontMock('@app-connect/core/models/sequelize');
    jest.dontMock('@app-connect/core/lib/logger');
  });

  test('executes and logs a database query result', async () => {
    const dbAccessor = loadDbAccessor({
      queryImpl: jest.fn().mockResolvedValue([{ id: 1 }])
    });
    const { sequelize } = require('@app-connect/core/models/sequelize');
    const logger = require('@app-connect/core/lib/logger');

    await dbAccessor.app({ dbQuery: 'select 1' });

    expect(sequelize.query).toHaveBeenCalledWith('select 1');
    expect(logger.info).toHaveBeenCalledWith('select 1');
    expect(logger.info).toHaveBeenCalledWith(JSON.stringify([{ id: 1 }], null, 2));
  });

  test('logs query errors instead of throwing', async () => {
    const dbAccessor = loadDbAccessor({
      queryImpl: jest.fn().mockRejectedValue(new Error('query failed'))
    });
    const logger = require('@app-connect/core/lib/logger');

    await expect(dbAccessor.app({ dbQuery: 'bad sql' })).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith('query failed');
  });
});

export {};
