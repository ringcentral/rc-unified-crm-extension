const getSessionInfo = require('../../../mcp/tools/getSessionInfo');
const jwt = require('../../../lib/jwt');
const { UserModel } = require('../../../models/userModel');

jest.mock('../../../lib/jwt');
jest.mock('../../../models/userModel');

describe('MCP Tool: getSessionInfo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('tool definition', () => {
    test('should have correct tool definition', () => {
      expect(getSessionInfo.definition).toBeDefined();
      expect(getSessionInfo.definition.name).toBe('getSessionInfo');
      expect(getSessionInfo.definition.description).toContain('session info');
      expect(getSessionInfo.definition.inputSchema).toBeDefined();
      expect(getSessionInfo.definition.inputSchema.properties).toEqual({});
    });
  });

  describe('execute', () => {
    test('should return unauthenticated session info when no CRM jwtToken exists', async () => {
      const result = await getSessionInfo.execute({
        openaiSessionId: 'session-123',
        rcExtensionId: 'ext-456',
        rcAccessToken: 'rc-token'
      });

      expect(result).toEqual({
        success: true,
        data: {
          openaiSessionId: 'session-123',
          rcExtensionId: 'ext-456',
          hasRcAccessToken: true,
          isCrmAuthenticated: false,
          crm: {
            userId: null,
            platform: null,
            hostname: null,
            tokenExpiry: null,
            timezoneName: null,
            timezoneOffset: null,
          }
        }
      });
      expect(jwt.decodeJwt).not.toHaveBeenCalled();
      expect(UserModel.findByPk).not.toHaveBeenCalled();
    });

    test('should return connected CRM session info when jwtToken resolves to a saved user', async () => {
      const tokenExpiry = new Date('2026-04-21T12:00:00.000Z');

      jwt.decodeJwt.mockReturnValue({
        id: 'crm-user-1',
        platform: 'clio'
      });
      UserModel.findByPk.mockResolvedValue({
        id: 'crm-user-1',
        platform: 'clio',
        hostname: 'app.clio.com',
        accessToken: 'crm-access-token',
        tokenExpiry,
        timezoneName: 'America/Los_Angeles',
        timezoneOffset: '-07:00'
      });

      const result = await getSessionInfo.execute({
        openaiSessionId: 'session-123',
        rcExtensionId: 'ext-456',
        rcAccessToken: 'rc-token',
        jwtToken: 'jwt-token'
      });

      expect(jwt.decodeJwt).toHaveBeenCalledWith('jwt-token');
      expect(UserModel.findByPk).toHaveBeenCalledWith('crm-user-1');
      expect(result).toEqual({
        success: true,
        data: {
          openaiSessionId: 'session-123',
          rcExtensionId: 'ext-456',
          hasRcAccessToken: true,
          isCrmAuthenticated: true,
          crm: {
            userId: 'crm-user-1',
            platform: 'clio',
            hostname: 'app.clio.com',
            tokenExpiry,
            timezoneName: 'America/Los_Angeles',
            timezoneOffset: '-07:00',
          }
        }
      });
    });

    test('should report not authenticated when jwtToken is invalid or user is missing', async () => {
      jwt.decodeJwt.mockReturnValue(null);

      const result = await getSessionInfo.execute({
        jwtToken: 'bad-token'
      });

      expect(result).toEqual({
        success: true,
        data: {
          openaiSessionId: null,
          rcExtensionId: null,
          hasRcAccessToken: false,
          isCrmAuthenticated: false,
          crm: {
            userId: null,
            platform: null,
            hostname: null,
            tokenExpiry: null,
            timezoneName: null,
            timezoneOffset: null,
          }
        }
      });
      expect(UserModel.findByPk).not.toHaveBeenCalled();
    });
  });
});
