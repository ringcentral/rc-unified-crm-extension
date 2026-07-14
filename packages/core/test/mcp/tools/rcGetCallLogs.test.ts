const rcGetCallLogs = require('../../../mcp/tools/rcGetCallLogs');
const jwt = require('../../../lib/jwt');
const { RingCentral } = require('../../../lib/ringcentral');
const {
  missingRcTokenCases,
  invalidCrmJwtTokenCases,
  invalidTimeFromCases,
  invalidTimeToCases,
  validTimeRangeCases,
  invalidCallLogDecodedJwtCases,
  validCallLogUserIdCases,
  invalidCallLogResponseCases,
  validCallLogResponseCases,
  callLogRejectionCases,
} = require('../data/rcGetCallLogsCases');

jest.mock('../../../lib/jwt');
jest.mock('../../../lib/ringcentral', () => ({
  RingCentral: jest.fn()
}));

describe('MCP Tool: rcGetCallLogs', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    process.env.RINGCENTRAL_SERVER = 'https://platform.ringcentral.com';
    process.env.RINGCENTRAL_CLIENT_ID = 'client-id';
    process.env.RINGCENTRAL_CLIENT_SECRET = 'client-secret';
    process.env.APP_SERVER = 'https://app.example.com';
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function arrangeCallLogs(...args) {
    const result = args.length > 0 ? args[0] : { records: [] };
    const decoded = args.length > 1 ? args[1] : { id: 'user-123' };
    jwt.decodeJwt.mockReturnValue(decoded);
    const getCallLogData = jest.fn().mockResolvedValue(result);
    RingCentral.mockImplementation(() => ({ getCallLogData }));
    return getCallLogData;
  }

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

  test.each<[any]>(missingRcTokenCases as [any][])('rejects $label before decoding CRM authentication', async ({ args }) => {
    await expect(rcGetCallLogs.execute(args)).resolves.toEqual({
      success: false,
      error: 'RingCentral access token not found',
    });
    expect(jwt.decodeJwt).not.toHaveBeenCalled();
    expect(RingCentral).not.toHaveBeenCalled();
  });

  test.each<[any]>(invalidCrmJwtTokenCases as [any][])('rejects $label without passing it to the decoder', async ({ jwtToken }) => {
    await expect(rcGetCallLogs.execute({
      jwtToken,
      rcAccessToken: 'rc-token',
    })).resolves.toEqual({ success: false, error: 'Invalid JWT token' });
    expect(jwt.decodeJwt).not.toHaveBeenCalled();
    expect(RingCentral).not.toHaveBeenCalled();
  });

  test.each<[any]>(invalidTimeFromCases as [any][])('rejects $label in timeFrom before making an RC request', async ({ value }) => {
    await expect(rcGetCallLogs.execute({
      jwtToken: 'jwt-token',
      rcAccessToken: 'rc-token',
      timeFrom: value,
    })).resolves.toEqual({
      success: false,
      error: 'timeFrom must be a valid ISO 8601 string',
    });
    expect(jwt.decodeJwt).not.toHaveBeenCalled();
    expect(RingCentral).not.toHaveBeenCalled();
  });

  test.each<[any]>(invalidTimeToCases as [any][])('rejects $label in timeTo before making an RC request', async ({ value }) => {
    await expect(rcGetCallLogs.execute({
      jwtToken: 'jwt-token',
      rcAccessToken: 'rc-token',
      timeTo: value,
    })).resolves.toEqual({
      success: false,
      error: 'timeTo must be a valid ISO 8601 string',
    });
    expect(jwt.decodeJwt).not.toHaveBeenCalled();
    expect(RingCentral).not.toHaveBeenCalled();
  });

  test.each<[any]>(validTimeRangeCases as [any][])('preserves the exact $label strings', async ({ timeFrom, timeTo }) => {
    const getCallLogData = arrangeCallLogs({ records: [] });

    await expect(rcGetCallLogs.execute({
      jwtToken: 'jwt-token',
      rcAccessToken: '  rc-token-with-padding  ',
      timeFrom,
      timeTo,
    })).resolves.toEqual({ records: [] });

    expect(getCallLogData).toHaveBeenCalledWith({
      token: { access_token: '  rc-token-with-padding  ', token_type: 'Bearer' },
      timeFrom,
      timeTo,
    });
  });

  test('rejects a reversed explicit range without constructing the SDK', async () => {
    jwt.decodeJwt.mockReturnValue({ id: 'user-123' });

    await expect(rcGetCallLogs.execute({
      jwtToken: 'jwt-token',
      rcAccessToken: 'rc-token',
      timeFrom: '2026-04-02T00:00:00Z',
      timeTo: '2026-04-01T00:00:00Z',
    })).resolves.toEqual({ success: false, error: 'timeFrom must not be after timeTo' });
    expect(jwt.decodeJwt).not.toHaveBeenCalled();
    expect(RingCentral).not.toHaveBeenCalled();
  });

  test.each<[any]>(invalidCallLogDecodedJwtCases as [any][])('rejects decoded JWT with $label', async ({ decoded }) => {
    jwt.decodeJwt.mockReturnValue(decoded);

    await expect(rcGetCallLogs.execute({
      jwtToken: 'jwt-token',
      rcAccessToken: 'rc-token',
    })).resolves.toEqual({
      success: false,
      error: 'Invalid JWT token: userId not found',
    });
    expect(RingCentral).not.toHaveBeenCalled();
  });

  test.each<[any]>(validCallLogUserIdCases as [any][])('accepts a $label without coercing request data', async ({ userId }) => {
    const getCallLogData = arrangeCallLogs({ records: [] }, { id: userId });

    await expect(rcGetCallLogs.execute({
      jwtToken: 'jwt-token',
      rcAccessToken: 'rc-token',
      timeFrom: '2026-04-01T00:00:00Z',
      timeTo: '2026-04-02T00:00:00Z',
    })).resolves.toEqual({ records: [] });
    expect(getCallLogData).toHaveBeenCalledTimes(1);
  });

  test.each<[any]>(invalidCallLogResponseCases as [any][])('normalizes an invalid $label RC response', async ({ response }) => {
    arrangeCallLogs(response);

    await expect(rcGetCallLogs.execute({
      jwtToken: 'jwt-token',
      rcAccessToken: 'rc-token',
    })).resolves.toEqual({
      success: false,
      error: 'RingCentral returned an invalid call log response',
    });
  });

  test.each<[any]>(validCallLogResponseCases as [any][])('preserves a valid $label response exactly', async ({ records }) => {
    const response = { records, navigation: { nextPage: null } };
    arrangeCallLogs(response);

    await expect(rcGetCallLogs.execute({
      jwtToken: 'jwt-token',
      rcAccessToken: 'rc-token',
    })).resolves.toBe(response);
  });

  test.each<[any]>(callLogRejectionCases as [any][])('normalizes a $label', async ({ rejection, expected }) => {
    jwt.decodeJwt.mockReturnValue({ id: 'user-123' });
    const getCallLogData = jest.fn().mockRejectedValue(rejection);
    RingCentral.mockImplementation(() => ({ getCallLogData }));

    await expect(rcGetCallLogs.execute({
      jwtToken: 'jwt-token',
      rcAccessToken: 'rc-token',
    })).resolves.toEqual({ success: false, error: expected });
  });

  test('defaults only the missing endpoint and rejects a range reversed against now', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-02T12:00:00.000Z'));
    const getCallLogData = arrangeCallLogs({ records: [] });

    await expect(rcGetCallLogs.execute({
      jwtToken: 'jwt-token',
      rcAccessToken: 'rc-token',
      timeFrom: '2026-04-02T00:00:00Z',
    })).resolves.toEqual({ records: [] });
    expect(getCallLogData).toHaveBeenCalledWith(expect.objectContaining({
      timeFrom: '2026-04-02T00:00:00Z',
      timeTo: '2026-04-02T12:00:00.000Z',
    }));

    jest.clearAllMocks();
    await expect(rcGetCallLogs.execute({
      jwtToken: 'jwt-token',
      rcAccessToken: 'rc-token',
      timeFrom: '2026-04-03T00:00:00Z',
    })).resolves.toEqual({ success: false, error: 'timeFrom must not be after timeTo' });
    expect(RingCentral).not.toHaveBeenCalled();
  });
});


export {};
