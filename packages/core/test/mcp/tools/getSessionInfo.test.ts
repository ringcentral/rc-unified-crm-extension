const getSessionInfo = require('../../../mcp/tools/getSessionInfo');
const jwt = require('../../../lib/jwt');
const { UserModel } = require('../../../models/userModel');
const { RingCentral } = require('../../../lib/ringcentral');
const {
  invalidSessionArgumentCases,
  invalidSessionFieldTypeCases,
  blankOptionalSessionFieldCases,
  invalidDecodedSessionJwtCases,
  opaqueUserIdCases,
  malformedStoredUserCases,
  platformSelectionCases,
  incompleteRcCredentialCases,
  invalidExtensionResponseCases,
  extensionNameCases,
  userLookupRejectionCases,
} = require('../data/getSessionInfoCases');

jest.mock('../../../lib/jwt');
jest.mock('../../../models/userModel');
jest.mock('../../../lib/ringcentral');

describe('MCP Tool: getSessionInfo', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    process.env.RINGCENTRAL_SERVER = 'https://platform.ringcentral.com';
    process.env.RINGCENTRAL_CLIENT_ID = 'client-id';
    process.env.RINGCENTRAL_CLIENT_SECRET = 'client-secret';
    process.env.APP_SERVER = 'https://app.example.com';
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

    test.each<[any]>(invalidSessionArgumentCases as [any][])('returns a stable error for $label arguments', async ({ args }) => {
      await expect(getSessionInfo.execute(args)).resolves.toMatchObject({
        success: false,
        error: 'Arguments must be an object',
      });
      expect(jwt.decodeJwt).not.toHaveBeenCalled();
      expect(UserModel.findByPk).not.toHaveBeenCalled();
      expect(RingCentral).not.toHaveBeenCalled();
    });

    test.each<[any]>(invalidSessionFieldTypeCases as [any][])('rejects $label before side effects', async ({ field, value }) => {
      await expect(getSessionInfo.execute({ [field]: value })).resolves.toMatchObject({
        success: false,
        error: `${field} must be a string`,
      });
      expect(jwt.decodeJwt).not.toHaveBeenCalled();
      expect(UserModel.findByPk).not.toHaveBeenCalled();
      expect(RingCentral).not.toHaveBeenCalled();
    });

    test.each<[any]>(blankOptionalSessionFieldCases as [any][])('normalizes optional $label to null', async ({ value }) => {
      const result = await getSessionInfo.execute({
        openaiSessionId: value,
        rcExtensionId: value,
        jwtToken: value,
        rcAccessToken: value,
      });

      expect(result).toEqual({
        success: true,
        data: {
          openaiSessionId: null,
          dataToShow: {
            isCrmAuthenticated: false,
            ringcentral: { extensionId: null, name: null },
            crm: { userId: null, platform: null, hostname: null },
          },
        },
      });
      expect(jwt.decodeJwt).not.toHaveBeenCalled();
      expect(RingCentral).not.toHaveBeenCalled();
    });

    test.each<[any]>(invalidDecodedSessionJwtCases as [any][])('treats $label as unauthenticated without querying a user', async ({ decoded }) => {
      jwt.decodeJwt.mockReturnValue(decoded);

      await expect(getSessionInfo.execute({ jwtToken: 'jwt-token' })).resolves.toEqual({
        success: true,
        data: {
          openaiSessionId: null,
          dataToShow: {
            isCrmAuthenticated: false,
            ringcentral: { extensionId: null, name: null },
            crm: { userId: null, platform: null, hostname: null },
          },
        },
      });
      expect(UserModel.findByPk).not.toHaveBeenCalled();
    });

    test.each<[any]>(opaqueUserIdCases as [any][])('preserves a $label for lookup and output', async ({ userId }) => {
      jwt.decodeJwt.mockReturnValue({ id: userId, platform: 'clio' });
      UserModel.findByPk.mockResolvedValue({
        accessToken: 'crm-token',
        platform: 'clio',
        hostname: 'tenant.example.com',
      });

      const result = await getSessionInfo.execute({ jwtToken: 'jwt-token' });

      expect(UserModel.findByPk).toHaveBeenCalledWith(userId);
      expect(result).toMatchObject({
        success: true,
        data: {
          dataToShow: {
            isCrmAuthenticated: true,
            crm: { userId },
          },
        },
      });
    });

    test.each<[any]>(malformedStoredUserCases as [any][])('does not authenticate a malformed $label result', async ({ user }) => {
      jwt.decodeJwt.mockReturnValue({ id: 'crm-user-1', platform: 'decoded-platform' });
      UserModel.findByPk.mockResolvedValue(user);

      await expect(getSessionInfo.execute({ jwtToken: 'jwt-token' })).resolves.toMatchObject({
        success: true,
        data: {
          dataToShow: {
            isCrmAuthenticated: false,
            crm: { userId: 'crm-user-1', platform: 'decoded-platform' },
          },
        },
      });
    });

    test.each<[any]>(platformSelectionCases as [any][])('selects $label deterministically', async ({ decoded, user, expectedPlatform, expectedHostname }) => {
      jwt.decodeJwt.mockReturnValue(decoded);
      UserModel.findByPk.mockResolvedValue(user);

      await expect(getSessionInfo.execute({ jwtToken: 'jwt-token' })).resolves.toMatchObject({
        success: true,
        data: {
          dataToShow: {
            crm: { platform: expectedPlatform, hostname: expectedHostname },
          },
        },
      });
    });

    test.each<[any]>(incompleteRcCredentialCases as [any][])('does not fetch extension data for $label', async ({ args, expectedId }) => {
      await expect(getSessionInfo.execute(args)).resolves.toMatchObject({
        success: true,
        data: { dataToShow: { ringcentral: { extensionId: expectedId, name: null } } },
      });
      expect(RingCentral).not.toHaveBeenCalled();
    });

    test.each<[any]>(invalidExtensionResponseCases as [any][])('normalizes an invalid $label from RingCentral', async ({ response }) => {
      const getExtensionInfo = jest.fn().mockResolvedValue(response);
      RingCentral.mockImplementation(() => ({ getExtensionInfo }));

      await expect(getSessionInfo.execute({
        rcExtensionId: '101',
        rcAccessToken: 'rc-token',
      })).resolves.toMatchObject({
        success: false,
        error: 'RingCentral returned an invalid extension response',
      });
    });

    test.each<[any]>(extensionNameCases as [any][])('maps a $label extension response safely', async ({ extensionInfo, expectedName }) => {
      const getExtensionInfo = jest.fn().mockResolvedValue(extensionInfo);
      RingCentral.mockImplementation(() => ({ getExtensionInfo }));

      await expect(getSessionInfo.execute({
        openaiSessionId: '会话/42',
        rcExtensionId: '٠٠١',
        rcAccessToken: ' rc-token ',
      })).resolves.toMatchObject({
        success: true,
        data: {
          openaiSessionId: '会话/42',
          dataToShow: {
            ringcentral: { extensionId: '٠٠١', name: expectedName },
          },
        },
      });
      expect(getExtensionInfo).toHaveBeenCalledWith('٠٠١', {
        access_token: ' rc-token ',
        token_type: 'Bearer',
      });
    });

    test.each<[any]>(userLookupRejectionCases as [any][])('normalizes a $label from the user lookup', async ({ rejection, expected }) => {
      jwt.decodeJwt.mockReturnValue({ id: 'user-1', platform: 'clio' });
      UserModel.findByPk.mockRejectedValue(rejection);

      await expect(getSessionInfo.execute({ jwtToken: 'jwt-token' })).resolves.toMatchObject({
        success: false,
        error: expected,
      });
    });

    test('keeps consecutive sessions isolated', async () => {
      jwt.decodeJwt
        .mockReturnValueOnce({ id: 'user-a', platform: 'clio' })
        .mockReturnValueOnce({ id: 'user-b', platform: 'bullhorn' });
      UserModel.findByPk
        .mockResolvedValueOnce({ accessToken: 'token-a', hostname: 'a.example.com' })
        .mockResolvedValueOnce({ accessToken: '', hostname: 'b.example.com' });

      const first = await getSessionInfo.execute({ openaiSessionId: 'session-a', jwtToken: 'jwt-a' });
      const second = await getSessionInfo.execute({ openaiSessionId: 'session-b', jwtToken: 'jwt-b' });

      expect(first).toMatchObject({
        data: { openaiSessionId: 'session-a', dataToShow: { isCrmAuthenticated: true, crm: { userId: 'user-a', platform: 'clio' } } },
      });
      expect(second).toMatchObject({
        data: { openaiSessionId: 'session-b', dataToShow: { isCrmAuthenticated: false, crm: { userId: 'user-b', platform: 'bullhorn' } } },
      });
      expect(UserModel.findByPk.mock.calls).toEqual([['user-a'], ['user-b']]);
    });
  });
});

export {};
