describe('high traffic mock connector', () => {
  let mockUser;
  let UserModel;
  let CallLogModel;
  let mockConnector;

  beforeEach(() => {
    jest.resetModules();
    mockUser = {
      id: 'mockUser',
      destroy: jest.fn().mockResolvedValue(undefined)
    };
    UserModel = {
      findByPk: jest.fn(),
      create: jest.fn().mockResolvedValue(mockUser)
    };
    CallLogModel = {
      create: jest.fn().mockResolvedValue({}),
      destroy: jest.fn().mockResolvedValue(2),
      findAll: jest.fn(),
      findOne: jest.fn()
    };

    jest.doMock('../../src/models/userModel', () => ({ UserModel }), { virtual: true });
    jest.doMock('../../src/models/callLogModel', () => ({ CallLogModel }), { virtual: true });
    jest.doMock('shortid', () => ({
      generate: jest.fn(() => 'generated-log-id')
    }));

    mockConnector = require('../../src/connectors/mock');
  });

  afterEach(() => {
    jest.dontMock('../../src/models/userModel');
    jest.dontMock('../../src/models/callLogModel');
    jest.dontMock('shortid');
  });

  test('creates a mock user only when it does not already exist', async () => {
    UserModel.findByPk.mockResolvedValueOnce(null);
    await expect(mockConnector.createUser()).resolves.toBe(mockUser);
    expect(UserModel.create).toHaveBeenCalledWith({ id: 'mockUser' });

    UserModel.findByPk.mockResolvedValueOnce(mockUser);
    await expect(mockConnector.createUser()).resolves.toBe(mockUser);
    expect(UserModel.create).toHaveBeenCalledTimes(1);
  });

  test('deletes a mock user when present and returns false when absent', async () => {
    UserModel.findByPk.mockResolvedValueOnce(mockUser);
    await expect(mockConnector.deleteUser()).resolves.toBe(true);
    expect(mockUser.destroy).toHaveBeenCalled();

    UserModel.findByPk.mockResolvedValueOnce(null);
    await expect(mockConnector.deleteUser()).resolves.toBe(false);
  });

  test('returns matched and unmatched call log entries in requested order', async () => {
    CallLogModel.findAll.mockResolvedValue([
      { sessionId: 's2' }
    ]);

    await expect(mockConnector.getCallLog({ sessionIds: 's1,s2' })).resolves.toEqual([
      { sessionId: 's1', matched: false },
      { sessionId: 's2', matched: true, logId: 'mockThirdPartyLogId' }
    ]);
  });

  test('creates a mock call log only when missing', async () => {
    CallLogModel.findOne.mockResolvedValueOnce(null);
    await mockConnector.createCallLog({ sessionId: 'session-new' });
    expect(CallLogModel.create).toHaveBeenCalledWith({
      id: 'generated-log-id',
      sessionId: 'session-new',
      userId: 'mockUser'
    });

    CallLogModel.findOne.mockResolvedValueOnce({ id: 'existing' });
    await mockConnector.createCallLog({ sessionId: 'session-new' });
    expect(CallLogModel.create).toHaveBeenCalledTimes(1);
  });

  test('cleans up mock call logs by mock user id', async () => {
    await mockConnector.cleanUpMockLogs();
    expect(CallLogModel.destroy).toHaveBeenCalledWith({
      where: {
        userId: 'mockUser'
      }
    });
  });
});

export {};
