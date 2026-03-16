const getPublicConnectors = require('../../../mcp/tools/getPublicConnectors');
const axios = require('axios');

jest.mock('axios');

describe('MCP Tool: getPublicConnectors', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.APP_SERVER = 'https://test-server.com';
  });

  describe('tool definition', () => {
    test('should have correct tool definition', () => {
      expect(getPublicConnectors.definition).toBeDefined();
      expect(getPublicConnectors.definition.name).toBe('getPublicConnectors');
      expect(getPublicConnectors.definition.description).toContain('connectors');
      expect(getPublicConnectors.definition.inputSchema).toBeDefined();
      expect(getPublicConnectors.definition.inputSchema.type).toBe('object');
    });

    test('should have no required parameters', () => {
      expect(getPublicConnectors.definition.inputSchema.required).toEqual([]);
    });
  });

  describe('execute', () => {
    test('should return structuredContent with server URL when no rcAccessToken', async () => {
      // Act
      const result = await getPublicConnectors.execute({});

      // Assert
      expect(result).toEqual({
        structuredContent: {
          serverUrl: 'https://test-server.com',
          rcExtensionId: null,
          rcAccountId: null,
          openaiSessionId: null,
        }
      });
      expect(axios.get).not.toHaveBeenCalled();
    });

    test('should resolve RC account and extension IDs when rcAccessToken provided', async () => {
      // Arrange
      axios.get.mockResolvedValue({
        data: { id: 'ext-456', account: { id: 'acc-789' } }
      });

      // Act
      const result = await getPublicConnectors.execute({
        rcAccessToken: 'valid-rc-token',
        openaiSessionId: 'session-abc'
      });

      // Assert
      expect(result).toEqual({
        structuredContent: {
          serverUrl: 'https://test-server.com',
          rcExtensionId: 'ext-456',
          rcAccountId: 'acc-789',
          openaiSessionId: 'session-abc',
        }
      });
      expect(axios.get).toHaveBeenCalledWith(
        'https://platform.ringcentral.com/restapi/v1.0/account/~/extension/~',
        { headers: { Authorization: 'Bearer valid-rc-token' } }
      );
    });

    test('should return null RC IDs and continue when RC API call fails', async () => {
      // Arrange — RC API failure is non-fatal: widget only shows public connectors
      axios.get.mockRejectedValue(new Error('RC API unavailable'));

      // Act
      const result = await getPublicConnectors.execute({ rcAccessToken: 'bad-token' });

      // Assert — still returns structuredContent, just without RC IDs
      expect(result).toEqual({
        structuredContent: {
          serverUrl: 'https://test-server.com',
          rcExtensionId: null,
          rcAccountId: null,
          openaiSessionId: null,
        }
      });
    });

    test('should include openaiSessionId when provided', async () => {
      // Act
      const result = await getPublicConnectors.execute({ openaiSessionId: 'my-session' });

      // Assert
      expect(result.structuredContent.openaiSessionId).toBe('my-session');
    });

    test('should use default server URL when APP_SERVER is not set', async () => {
      // Arrange
      delete process.env.APP_SERVER;

      // Act
      const result = await getPublicConnectors.execute({});

      // Assert
      expect(result.structuredContent.serverUrl).toBe('https://localhost:6066');
    });
  });
});
