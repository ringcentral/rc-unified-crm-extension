const collectAuthInfo = require('../../../mcp/tools/collectAuthInfo');

describe('MCP Tool: collectAuthInfo', () => {
  describe('tool definition', () => {
    test('should have correct tool definition', () => {
      expect(collectAuthInfo.definition).toBeDefined();
      expect(collectAuthInfo.definition.name).toBe('collectAuthInfo');
      expect(collectAuthInfo.definition.description).toContain('Auth flow step.3');
      expect(collectAuthInfo.definition.inputSchema).toBeDefined();
    });

    test('should require connectorManifest and connectorName parameters', () => {
      expect(collectAuthInfo.definition.inputSchema.required).toContain('connectorManifest');
      expect(collectAuthInfo.definition.inputSchema.required).toContain('connectorName');
    });
  });

  describe('execute', () => {
    test('should handle selectable environment type', async () => {
      // Arrange
      const mockManifest = {
        platforms: {
          salesforce: {
            name: 'salesforce',
            auth: {
              type: 'oauth',
              oauth: {
                authUrl: 'https://login.salesforce.com/services/oauth2/authorize',
                clientId: 'test-client-id'
              }
            },
            environment: {
              type: 'selectable',
              selections: [
                { name: 'Production', const: 'https://login.salesforce.com' },
                { name: 'Sandbox', const: 'https://test.salesforce.com' }
              ]
            }
          }
        }
      };

      // Act
      const result = await collectAuthInfo.execute({
        connectorManifest: mockManifest,
        connectorName: 'salesforce',
        selection: 'Production'
      });

      // Assert
      expect(result).toEqual({
        success: true,
        data: {
          hostname: 'login.salesforce.com',
          message: expect.stringContaining('IMPORTANT')
        }
      });
    });

    test('should handle dynamic environment type', async () => {
      // Arrange
      const mockManifest = {
        platforms: {
          netsuite: {
            name: 'netsuite',
            auth: {
              type: 'oauth',
              oauth: {
                authUrl: 'https://system.netsuite.com/app/login/oauth2/authorize.nl',
                clientId: 'test-client-id'
              }
            },
            environment: {
              type: 'dynamic'
            }
          }
        }
      };

      // Act
      const result = await collectAuthInfo.execute({
        connectorManifest: mockManifest,
        connectorName: 'netsuite',
        hostname: 'https://1234567.app.netsuite.com'
      });

      // Assert
      expect(result).toEqual({
        success: true,
        data: {
          hostname: '1234567.app.netsuite.com',
          message: expect.stringContaining('IMPORTANT')
        }
      });
    });

    test('should handle sandbox selection', async () => {
      // Arrange
      const mockManifest = {
        platforms: {
          salesforce: {
            name: 'salesforce',
            auth: {
              type: 'oauth',
              oauth: {
                authUrl: 'https://login.salesforce.com/services/oauth2/authorize',
                clientId: 'test-client-id'
              }
            },
            environment: {
              type: 'selectable',
              selections: [
                { name: 'Production', const: 'https://login.salesforce.com' },
                { name: 'Sandbox', const: 'https://test.salesforce.com' }
              ]
            }
          }
        }
      };

      // Act
      const result = await collectAuthInfo.execute({
        connectorManifest: mockManifest,
        connectorName: 'salesforce',
        selection: 'Sandbox'
      });

      // Assert
      expect(result.success).toBe(true);
      expect(result.data.hostname).toBe('test.salesforce.com');
    });

    test('should handle invalid hostname URL', async () => {
      // Arrange
      const mockManifest = {
        platforms: {
          netsuite: {
            name: 'netsuite',
            auth: {
              type: 'oauth',
              oauth: {
                authUrl: 'https://system.netsuite.com/app/login/oauth2/authorize.nl',
                clientId: 'test-client-id'
              }
            },
            environment: {
              type: 'dynamic'
            }
          }
        }
      };

      // Act
      const result = await collectAuthInfo.execute({
        connectorManifest: mockManifest,
        connectorName: 'netsuite',
        hostname: 'invalid-url'
      });

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.errorDetails).toBeDefined();
    });

    test('should handle missing selection for selectable type', async () => {
      // Arrange
      const mockManifest = {
        platforms: {
          salesforce: {
            name: 'salesforce',
            auth: {
              type: 'oauth',
              oauth: {
                authUrl: 'https://login.salesforce.com/services/oauth2/authorize',
                clientId: 'test-client-id'
              }
            },
            environment: {
              type: 'selectable',
              selections: [
                { name: 'Production', const: 'https://login.salesforce.com' }
              ]
            }
          }
        }
      };

      // Act
      const result = await collectAuthInfo.execute({
        connectorManifest: mockManifest,
        connectorName: 'salesforce',
        selection: 'NonExistent'
      });

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should handle missing hostname for dynamic type', async () => {
      // Arrange
      const mockManifest = {
        platforms: {
          netsuite: {
            name: 'netsuite',
            auth: {
              type: 'oauth',
              oauth: {
                authUrl: 'https://system.netsuite.com/app/login/oauth2/authorize.nl',
                clientId: 'test-client-id'
              }
            },
            environment: {
              type: 'dynamic'
            }
          }
        }
      };

      // Act
      const result = await collectAuthInfo.execute({
        connectorManifest: mockManifest,
        connectorName: 'netsuite'
        // hostname is missing
      });

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});

