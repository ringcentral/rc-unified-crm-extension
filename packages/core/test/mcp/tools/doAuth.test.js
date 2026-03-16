const doAuth = require('../../../mcp/tools/doAuth');
const { createAuthSession } = require('../../../lib/authSession');

jest.mock('../../../lib/authSession');

describe('MCP Tool: doAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('tool definition', () => {
    test('should have correct tool definition', () => {
      expect(doAuth.definition).toBeDefined();
      expect(doAuth.definition.name).toBe('doAuth');
      expect(doAuth.definition.description).toContain('OAuth session');
      expect(doAuth.definition.inputSchema).toBeDefined();
    });

    test('should require connectorName and have optional hostname', () => {
      expect(doAuth.definition.inputSchema.required).toContain('connectorName');
      expect(doAuth.definition.inputSchema.properties).toHaveProperty('connectorName');
      expect(doAuth.definition.inputSchema.properties).toHaveProperty('hostname');
    });
  });

  describe('execute', () => {
    test('should create auth session successfully', async () => {
      // Arrange
      createAuthSession.mockResolvedValue(undefined);

      // Act
      const result = await doAuth.execute({
        sessionId: 'session-abc',
        connectorName: 'pipedrive',
        hostname: 'mycompany.pipedrive.com'
      });

      // Assert
      expect(result).toEqual({ success: true });
      expect(createAuthSession).toHaveBeenCalledWith('session-abc', {
        platform: 'pipedrive',
        hostname: 'mycompany.pipedrive.com'
      });
    });

    test('should create auth session with empty hostname when not provided', async () => {
      // Arrange
      createAuthSession.mockResolvedValue(undefined);

      // Act
      const result = await doAuth.execute({
        sessionId: 'session-xyz',
        connectorName: 'clio'
      });

      // Assert
      expect(result).toEqual({ success: true });
      expect(createAuthSession).toHaveBeenCalledWith('session-xyz', {
        platform: 'clio',
        hostname: ''
      });
    });

    test('should return error when sessionId is missing', async () => {
      // Act
      const result = await doAuth.execute({ connectorName: 'pipedrive' });

      // Assert
      expect(result).toEqual({
        success: false,
        error: 'Missing required fields: sessionId, connectorName'
      });
      expect(createAuthSession).not.toHaveBeenCalled();
    });

    test('should return error when connectorName is missing', async () => {
      // Act
      const result = await doAuth.execute({ sessionId: 'session-abc' });

      // Assert
      expect(result).toEqual({
        success: false,
        error: 'Missing required fields: sessionId, connectorName'
      });
      expect(createAuthSession).not.toHaveBeenCalled();
    });

    test('should return error when both sessionId and connectorName are missing', async () => {
      // Act
      const result = await doAuth.execute({});

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required fields');
    });

    test('should handle unexpected errors gracefully', async () => {
      // Arrange
      createAuthSession.mockRejectedValue(new Error('DB write failed'));

      // Act
      const result = await doAuth.execute({
        sessionId: 'session-abc',
        connectorName: 'pipedrive'
      });

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('DB write failed');
      expect(result.errorDetails).toBeDefined();
    });
  });
});
