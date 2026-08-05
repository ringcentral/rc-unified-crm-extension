describe('dbAccessor', () => {
  function loadDbAccessor({ queryImpl, backfillImpl = jest.fn() }) {
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
    jest.doMock('../src/backfillCallLogAiNotes', () => ({
      app: backfillImpl
    }));

    return require('../src/dbAccessor');
  }

  afterEach(() => {
    jest.dontMock('@app-connect/core/models/sequelize');
    jest.dontMock('@app-connect/core/lib/logger');
    jest.dontMock('../src/backfillCallLogAiNotes');
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

  test.each(['dry-run', 'run'])('routes the %s command without executing SQL', async (mode) => {
    const result = { mode, wouldPatchCount: 1, patchedCount: mode === 'run' ? 1 : 0 };
    const backfillImpl = jest.fn().mockResolvedValue(result);
    const dbAccessor = loadDbAccessor({
      queryImpl: jest.fn(),
      backfillImpl
    });
    const { sequelize } = require('@app-connect/core/models/sequelize');
    const input = {
      dbQuery: mode,
      dateFrom: '2026-07-24T09:50:00Z',
      dateTo: '2026-07-28T01:50:00Z',
      rcAccountId: '485987048'
    };

    await expect(dbAccessor.app(input)).resolves.toEqual(result);
    expect(backfillImpl).toHaveBeenCalledWith({
      mode,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      rcAccountId: input.rcAccountId
    });
    expect(sequelize.query).not.toHaveBeenCalled();
  });
});

export {};
