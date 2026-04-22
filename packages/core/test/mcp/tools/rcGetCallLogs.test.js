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
});

