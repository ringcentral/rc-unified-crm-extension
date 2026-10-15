jest.mock('../lib/migrateMessageLogsSchema', () => ({
  migrateMessageLogsSchema: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../lib/migrateCallLogsSchema', () => ({
  runCallLogsSchemaMigration: jest.fn(),
}));

const { initializeCore } = require('../index');
const { sequelize } = require('../models/sequelize');
const { MessageLogModel } = require('../models/messageLogModel');
const { migrateMessageLogsSchema } = require('../lib/migrateMessageLogsSchema');
const { runCallLogsSchemaMigration } = require('../lib/migrateCallLogsSchema');

describe('initializeCore database setup', () => {
  const originalDisableSync = process.env.DISABLE_SYNC_DB_TABLE;

  afterEach(() => {
    if (originalDisableSync === undefined) {
      delete process.env.DISABLE_SYNC_DB_TABLE;
    }
    else {
      process.env.DISABLE_SYNC_DB_TABLE = originalDisableSync;
    }
  });

  test('runs the messageLogs schema migration after syncing the table', async () => {
    delete process.env.DISABLE_SYNC_DB_TABLE;
    const syncSpy = jest.spyOn(MessageLogModel, 'sync');

    await initializeCore({ skipAnalyticsInit: true });

    expect(migrateMessageLogsSchema).toHaveBeenCalledWith(sequelize);
    expect(syncSpy.mock.invocationCallOrder[0])
      .toBeLessThan(migrateMessageLogsSchema.mock.invocationCallOrder[0]);
    expect(runCallLogsSchemaMigration).toHaveBeenCalledWith(sequelize, expect.anything());
  });

  test('skips schema sync and migrations when DISABLE_SYNC_DB_TABLE is set', async () => {
    process.env.DISABLE_SYNC_DB_TABLE = 'true';

    await initializeCore({ skipAnalyticsInit: true });

    expect(migrateMessageLogsSchema).not.toHaveBeenCalled();
    expect(runCallLogsSchemaMigration).not.toHaveBeenCalled();
  });
});

export {};
