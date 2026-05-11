const getSessionInfo = require('../../../mcp/tools/getSessionInfo');
const jwt = require('../../../lib/jwt');
const { UserModel } = require('../../../models/userModel');
const { RingCentral } = require('../../../lib/ringcentral');

jest.mock('../../../lib/jwt');
jest.mock('../../../models/userModel');
jest.mock('../../../lib/ringcentral');

describe('MCP Tool: getSessionInfo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    RingCentral.mockImplementation(() => ({
      getExtensionInfo: jest.fn().mockResolvedValue({ name: 'Demo Extension' })
    }));
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
          dataToShow: {
            isCrmAuthenticated: false,
            ringcentral: {
              extensionId: 'ext-456',
              name: 'Demo Extension',
            },
            crm: {
              userId: null,
              platform: null,
              hostname: null
            }
          }
        }
      });
      expect(jwt.decodeJwt).not.toHaveBeenCalled();
      expect(UserModel.findByPk).not.toHaveBeenCalled();
    });

    test('should return connected CRM session info when jwtToken resolves to a saved user', async () => {
      jwt.decodeJwt.mockReturnValue({
        id: 'crm-user-1',
        platform: 'clio'
      });
      UserModel.findByPk.mockResolvedValue({
        id: 'crm-user-1',
        platform: 'clio',
        hostname: 'app.clio.com',
        accessToken: 'crm-access-token',
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
          dataToShow: {
            isCrmAuthenticated: true,
            ringcentral: {
              extensionId: 'ext-456',
              name: 'Demo Extension',
            },
            crm: {
              userId: 'crm-user-1',
              platform: 'clio',
              hostname: 'app.clio.com'
            }
          }
        }
      });
    });

    test('should report not authenticated when jwtToken is invalid', async () => {
      jwt.decodeJwt.mockReturnValue(null);

      const result = await getSessionInfo.execute({
        jwtToken: 'bad-token'
      });

      expect(result).toEqual({
        success: true,
        data: {
          openaiSessionId: null,
          dataToShow: {
            isCrmAuthenticated: false,
            ringcentral: {
              extensionId: null,
              name: null,
            },
            crm: {
              userId: null,
              platform: null,
              hostname: null
            }
          }
        }
      });
      expect(UserModel.findByPk).not.toHaveBeenCalled();
    });
  });
});
