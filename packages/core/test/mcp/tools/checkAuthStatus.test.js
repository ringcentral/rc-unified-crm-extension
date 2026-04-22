const checkAuthStatus = require('../../../mcp/tools/checkAuthStatus');
const { getAuthSession } = require('../../../lib/authSession');
const { LlmSessionModel } = require('../../../models/llmSessionModel');

jest.mock('../../../lib/authSession');
jest.mock('../../../models/llmSessionModel');

describe('MCP Tool: checkAuthStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    LlmSessionModel.upsert.mockResolvedValue([{}, true]);
  });

  test('should return pending when auth session is still waiting', async () => {
    getAuthSession.mockResolvedValue({ status: 'pending' });

    const result = await checkAuthStatus.execute({
      sessionId: 'session-1',
      rcExtensionId: 'rc-ext-1'
    });

    expect(result).toEqual({
      data: {
        status: 'pending'
      }
    });
    expect(LlmSessionModel.upsert).not.toHaveBeenCalled();
  });

  test('should persist completed auth against rcExtensionId', async () => {
    getAuthSession.mockResolvedValue({
      status: 'completed',
      jwtToken: 'jwt-token',
      userInfo: { id: 'user-1', name: 'Casey' }
    });

    const result = await checkAuthStatus.execute({
      sessionId: 'session-1',
      rcExtensionId: 'rc-ext-1'
    });

    expect(LlmSessionModel.upsert).toHaveBeenCalledWith({
      id: 'rc-ext-1',
      jwtToken: 'jwt-token'
    });
    expect(result).toEqual({
      data: {
        status: 'completed',
        jwtToken: 'jwt-token',
        userInfo: { id: 'user-1', name: 'Casey' },
        message: expect.stringContaining('IMPORTANT')
      }
    });
  });

  test('should return expired when the auth session TTL has elapsed', async () => {
    getAuthSession.mockResolvedValue({ status: 'expired' });

    const result = await checkAuthStatus.execute({
      sessionId: 'session-1',
      rcExtensionId: 'rc-ext-1'
    });

    expect(result).toEqual({
      data: {
        status: 'expired',
        errorMessage: 'Authentication session expired. Ask the user to start the auth flow again.'
      }
    });
  });

  test('should return an error when rcExtensionId is missing', async () => {
    const result = await checkAuthStatus.execute({
      sessionId: 'session-1'
    });

    expect(result).toEqual({
      success: false,
      error: 'CRM auth status check error: rcExtensionId is required'
    });
  });
});
