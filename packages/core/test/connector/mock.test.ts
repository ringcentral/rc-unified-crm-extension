jest.mock('shortid', () => ({
  generate: jest.fn(() => 'mock-log-id'),
}));

const mockConnector = require('../../connector/mock');
const { UserModel } = require('../../models/userModel');
const { CallLogModel } = require('../../models/callLogModel');

describe('mock connector', () => {
  beforeEach(async () => {
    await CallLogModel.destroy({ where: {} });
    await UserModel.destroy({ where: {} });
  });

  test('creates and deletes the mock user idempotently', async () => {
    const firstUser = await mockConnector.createUser();
    const secondUser = await mockConnector.createUser();

    expect(firstUser.id).toBe('mockUser');
    expect(secondUser.id).toBe('mockUser');
    await expect(UserModel.count({ where: { id: 'mockUser' } })).resolves.toBe(1);

    await expect(mockConnector.deleteUser()).resolves.toBe(true);
    await expect(mockConnector.deleteUser()).resolves.toBe(false);
    await expect(UserModel.findByPk('mockUser')).resolves.toBeNull();
  });

  test('creates a mock call log only once for the same session identity', async () => {
    await mockConnector.createCallLog({
      sessionId: 'session-1',
      extensionNumber: 101,
      hashedExtensionId: 'hash-101',
    });
    await mockConnector.createCallLog({
      sessionId: 'session-1',
      extensionNumber: '101',
      hashedExtensionId: 'hash-101',
    });

    const records = await CallLogModel.findAll({
      where: {
        sessionId: 'session-1',
      },
    });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      id: 'mock-log-id',
      sessionId: 'session-1',
      extensionNumber: '101',
      hashedExtensionId: 'hash-101',
      userId: 'mockUser',
    });
  });

  test('creates and matches mock call logs without extension identifiers', async () => {
    await mockConnector.createCallLog({
      sessionId: 'session-without-extension',
    });

    const records = await CallLogModel.findAll({
      where: {
        sessionId: 'session-without-extension',
      },
    });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      extensionNumber: '',
      hashedExtensionId: '',
    });

    await expect(mockConnector.getCallLog({
      sessionIds: 'session-without-extension',
    })).resolves.toEqual([
      { sessionId: 'session-without-extension', matched: true, logId: 'mockThirdPartyLogId' },
    ]);
  });

  test('returns matched and unmatched call logs in requested session order', async () => {
    await mockConnector.createCallLog({
      sessionId: 'session-1',
      extensionNumber: '101',
      hashedExtensionId: 'hash-101',
    });
    await mockConnector.createCallLog({
      sessionId: 'session-3',
      extensionNumber: '101',
      hashedExtensionId: 'hash-101',
    });

    await expect(mockConnector.getCallLog({
      sessionIds: 'session-1,session-2,session-3',
      extensionNumber: '101',
      hashedExtensionId: 'hash-101',
    })).resolves.toEqual([
      { sessionId: 'session-1', matched: true, logId: 'mockThirdPartyLogId' },
      { sessionId: 'session-2', matched: false },
      { sessionId: 'session-3', matched: true, logId: 'mockThirdPartyLogId' },
    ]);
  });

  test('falls back to legacy extension matching when hashed extension id does not match', async () => {
    await CallLogModel.create({
      id: 'legacy-log-id',
      sessionId: 'session-legacy',
      extensionNumber: '101',
      hashedExtensionId: '',
      userId: 'mockUser',
    });

    await expect(mockConnector.getCallLog({
      sessionIds: 'session-legacy',
      extensionNumber: '101',
      hashedExtensionId: 'new-hash-101',
    })).resolves.toEqual([
      { sessionId: 'session-legacy', matched: true, logId: 'mockThirdPartyLogId' },
    ]);
  });

  test('cleanUpMockLogs removes only mock user call logs', async () => {
    await CallLogModel.bulkCreate([
      {
        id: 'mock-log',
        sessionId: 'mock-session',
        extensionNumber: '',
        hashedExtensionId: '',
        userId: 'mockUser',
      },
      {
        id: 'real-log',
        sessionId: 'real-session',
        extensionNumber: '',
        hashedExtensionId: '',
        userId: 'realUser',
      },
    ]);

    await mockConnector.cleanUpMockLogs();

    await expect(CallLogModel.findOne({
      where: {
        userId: 'mockUser',
      },
    })).resolves.toBeNull();
    const realLog = await CallLogModel.findOne({
      where: {
        userId: 'realUser',
      },
    });
    expect(realLog).toMatchObject({
      id: 'real-log',
      sessionId: 'real-session',
    });
  });
});

export {};
