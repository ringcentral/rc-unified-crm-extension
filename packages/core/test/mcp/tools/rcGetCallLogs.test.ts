const rcGetCallLogs = require('../../../mcp/tools/rcGetCallLogs');
const jwt = require('../../../lib/jwt');
const { RingCentral } = require('../../../lib/ringcentral');

jest.mock('../../../lib/jwt');
jest.mock('../../../lib/ringcentral', () => ({
  RingCentral: jest.fn()
}));

describe('MCP Tool: rcGetCallLogs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.RINGCENTRAL_SERVER = 'https://platform.ringcentral.com';
    process.env.RINGCENTRAL_CLIENT_ID = 'client-id';
    process.env.RINGCENTRAL_CLIENT_SECRET = 'client-secret';
    process.env.APP_SERVER = 'https://app.example.com';
  });

  test('should have correct tool definition', () => {
    expect(rcGetCallLogs.definition).toBeDefined();
    expect(rcGetCallLogs.definition.name).toBe('rcGetCallLogs');
  });

  test('should return call logs successfully', async () => {
    jwt.decodeJwt.mockReturnValue({ id: 'user-123' });
    const getCallLogData = jest.fn().mockResolvedValue({ records: [{ id: '1' }] });
    RingCentral.mockImplementation(() => ({ getCallLogData }));

    const result = await rcGetCallLogs.execute({
      jwtToken: 'mock-jwt',
      rcAccessToken: 'rc-token',
      timeFrom: '2026-04-01T00:00:00.000Z',
      timeTo: '2026-04-02T00:00:00.000Z'
    });

    expect(result).toEqual({ records: [{ id: '1' }] });
    expect(getCallLogData).toHaveBeenCalledWith({
      token: { access_token: 'rc-token', token_type: 'Bearer' },
      timeFrom: '2026-04-01T00:00:00.000Z',
      timeTo: '2026-04-02T00:00:00.000Z'
    });
  });

  test('should return error when decodeJwt returns null', async () => {
    jwt.decodeJwt.mockReturnValue(null);

    const result = await rcGetCallLogs.execute({
      jwtToken: 'bad-jwt',
      rcAccessToken: 'rc-token'
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid JWT token');
  });

  test('should return error when RingCentral access token is missing', async () => {
    const result = await rcGetCallLogs.execute({
      jwtToken: 'mock-jwt'
    });

    expect(result).toEqual({
      success: false,
      error: 'RingCentral access token not found'
    });
    expect(jwt.decodeJwt).not.toHaveBeenCalled();
  });

  test('should return error when decoded JWT has no user id', async () => {
    jwt.decodeJwt.mockReturnValue({ sub: 'user-123' });

    const result = await rcGetCallLogs.execute({
      jwtToken: 'mock-jwt',
      rcAccessToken: 'rc-token'
    });

    expect(result).toEqual({
      success: false,
      error: 'Invalid JWT token: userId not found'
    });
    expect(RingCentral).not.toHaveBeenCalled();
  });

  test('should use default time range when time arguments are omitted', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-02T12:00:00.000Z'));
    jwt.decodeJwt.mockReturnValue({ id: 'user-123' });
    const getCallLogData = jest.fn().mockResolvedValue({ records: [] });
    RingCentral.mockImplementation(() => ({ getCallLogData }));

    const result = await rcGetCallLogs.execute({
      jwtToken: 'mock-jwt',
      rcAccessToken: 'rc-token'
    });

    expect(result).toEqual({ records: [] });
    expect(getCallLogData).toHaveBeenCalledWith({
      token: { access_token: 'rc-token', token_type: 'Bearer' },
      timeFrom: '2026-04-01T12:00:00.000Z',
      timeTo: '2026-04-02T12:00:00.000Z'
    });
    jest.useRealTimers();
  });

  test('should return RingCentral errors as tool errors', async () => {
    jwt.decodeJwt.mockReturnValue({ id: 'user-123' });
    const getCallLogData = jest.fn().mockRejectedValue(new Error('RC unavailable'));
    RingCentral.mockImplementation(() => ({ getCallLogData }));

    const result = await rcGetCallLogs.execute({
      jwtToken: 'mock-jwt',
      rcAccessToken: 'rc-token'
    });

    expect(result).toEqual({
      success: false,
      error: 'RC unavailable'
    });
  });
});


export {};
