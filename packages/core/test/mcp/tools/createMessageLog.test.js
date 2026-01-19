const createMessageLog = require('../../../mcp/tools/createMessageLog');
const jwt = require('../../../lib/jwt');
const connectorRegistry = require('../../../connector/registry');
const logCore = require('../../../handlers/log');

// Mock dependencies
jest.mock('../../../lib/jwt');
jest.mock('../../../connector/registry');
jest.mock('../../../handlers/log');

describe('MCP Tool: createMessageLog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('tool definition', () => {
    test('should have correct tool definition', () => {
      expect(createMessageLog.definition).toBeDefined();
      expect(createMessageLog.definition.name).toBe('createMessageLog');
      expect(createMessageLog.definition.description).toContain('REQUIRES AUTHENTICATION');
      expect(createMessageLog.definition.inputSchema).toBeDefined();
    });

    test('should require jwtToken and incomingData parameters', () => {
      expect(createMessageLog.definition.inputSchema.required).toContain('jwtToken');
      expect(createMessageLog.definition.inputSchema.required).toContain('incomingData');
    });

    test('should have detailed inputSchema for incomingData', () => {
      const incomingDataSchema = createMessageLog.definition.inputSchema.properties.incomingData;
      expect(incomingDataSchema.properties).toHaveProperty('conversation');
      expect(incomingDataSchema.properties).toHaveProperty('contactId');
      expect(incomingDataSchema.properties).toHaveProperty('contactName');
      expect(incomingDataSchema.required).toContain('conversation');
      expect(incomingDataSchema.required).toContain('contactId');
      expect(incomingDataSchema.required).toContain('contactName');
    });
  });

  describe('execute', () => {
    test('should create message log successfully', async () => {
      // Arrange
      const mockIncomingData = {
        conversation: {
          conversationId: 'conv-123',
          conversationLogId: 'conv-log-123',
          type: 'SMS',
          messages: [
            {
              id: 'msg-123',
              conversationId: 'conv-123',
              phoneNumber: '+1234567890',
              direction: 'Inbound',
              creationTime: 1704110400000,
              subject: 'Hello',
              from: { phoneNumber: '+1234567890', name: 'John Doe' },
              to: [{ phoneNumber: '+0987654321' }]
            }
          ],
          correspondents: [
            { phoneNumber: '+1234567890' }
          ]
        },
        contactId: 'contact-123',
        contactName: 'John Doe',
        contactType: 'Contact'
      };

      jwt.decodeJwt.mockReturnValue({
        id: 'user-123',
        platform: 'testCRM'
      });

      const mockConnector = {
        createMessageLog: jest.fn()
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      logCore.createMessageLog.mockResolvedValue({
        successful: true,
        logIds: ['crm-msg-log-123'],
        returnMessage: { message: 'Message logs created successfully' }
      });

      // Act
      const result = await createMessageLog.execute({
        jwtToken: 'mock-jwt-token',
        incomingData: mockIncomingData
      });

      // Assert
      expect(result).toEqual({
        success: true,
        data: {
          logIds: ['crm-msg-log-123'],
          message: 'Message logs created successfully'
        }
      });
      expect(jwt.decodeJwt).toHaveBeenCalledWith('mock-jwt-token');
      expect(logCore.createMessageLog).toHaveBeenCalledWith({
        platform: 'testCRM',
        userId: 'user-123',
        incomingData: expect.objectContaining({
          contactId: 'contact-123',
          contactName: 'John Doe',
          logInfo: mockIncomingData.conversation
        })
      });
    });

    test('should create message log with multiple messages', async () => {
      // Arrange
      const mockIncomingData = {
        conversation: {
          conversationId: 'conv-456',
          conversationLogId: 'conv-log-456',
          type: 'SMS',
          messages: [
            {
              id: 'msg-456-1',
              conversationId: 'conv-456',
              phoneNumber: '+1234567890',
              direction: 'Outbound',
              from: { phoneNumber: '+0987654321' },
              to: [{ phoneNumber: '+1234567890' }]
            },
            {
              id: 'msg-456-2',
              conversationId: 'conv-456',
              phoneNumber: '+1234567890',
              direction: 'Inbound',
              from: { phoneNumber: '+1234567890' },
              to: [{ phoneNumber: '+0987654321' }]
            }
          ],
          correspondents: [
            { phoneNumber: '+1234567890' }
          ]
        },
        contactId: 'contact-456',
        contactName: 'Jane Smith'
      };

      jwt.decodeJwt.mockReturnValue({
        id: 'user-123',
        platform: 'testCRM'
      });

      const mockConnector = {
        createMessageLog: jest.fn()
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      logCore.createMessageLog.mockResolvedValue({
        successful: true,
        logIds: ['crm-msg-log-456-1', 'crm-msg-log-456-2']
      });

      // Act
      const result = await createMessageLog.execute({
        jwtToken: 'mock-jwt-token',
        incomingData: mockIncomingData
      });

      // Assert
      expect(result.success).toBe(true);
      expect(result.data.logIds).toHaveLength(2);
    });

    test('should create message log with attachments', async () => {
      // Arrange
      const mockIncomingData = {
        conversation: {
          conversationId: 'conv-789',
          conversationLogId: 'conv-log-789',
          type: 'MMS',
          messages: [
            {
              id: 'msg-789',
              conversationId: 'conv-789',
              phoneNumber: '+1234567890',
              direction: 'Inbound',
              from: { phoneNumber: '+1234567890' },
              to: [{ phoneNumber: '+0987654321' }],
              attachments: [
                {
                  type: 'image',
                  link: 'https://example.com/image.jpg',
                  contentType: 'image/jpeg'
                }
              ]
            }
          ],
          correspondents: [
            { phoneNumber: '+1234567890' }
          ]
        },
        contactId: 'contact-789',
        contactName: 'Bob Johnson'
      };

      jwt.decodeJwt.mockReturnValue({
        id: 'user-123',
        platform: 'testCRM'
      });

      const mockConnector = {
        createMessageLog: jest.fn()
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      logCore.createMessageLog.mockResolvedValue({
        successful: true,
        logIds: ['crm-msg-log-789']
      });

      // Act
      const result = await createMessageLog.execute({
        jwtToken: 'mock-jwt-token',
        incomingData: mockIncomingData
      });

      // Assert
      expect(result.success).toBe(true);
    });

    test('should create fax message log', async () => {
      // Arrange
      const mockIncomingData = {
        conversation: {
          conversationId: 'conv-fax',
          conversationLogId: 'conv-log-fax',
          type: 'Fax',
          messages: [
            {
              id: 'msg-fax',
              conversationId: 'conv-fax',
              phoneNumber: '+1234567890',
              direction: 'Inbound',
              messageStatus: 'Received',
              faxPageCount: 5,
              from: { phoneNumber: '+1234567890' },
              to: [{ phoneNumber: '+0987654321' }]
            }
          ],
          correspondents: [
            { phoneNumber: '+1234567890' }
          ]
        },
        contactId: 'contact-fax',
        contactName: 'Fax Sender'
      };

      jwt.decodeJwt.mockReturnValue({
        id: 'user-123',
        platform: 'testCRM'
      });

      const mockConnector = {
        createMessageLog: jest.fn()
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      logCore.createMessageLog.mockResolvedValue({
        successful: true,
        logIds: ['crm-msg-log-fax']
      });

      // Act
      const result = await createMessageLog.execute({
        jwtToken: 'mock-jwt-token',
        incomingData: mockIncomingData
      });

      // Assert
      expect(result.success).toBe(true);
    });

    test('should create message log with additional submission', async () => {
      // Arrange
      const mockIncomingData = {
        conversation: {
          conversationId: 'conv-submit',
          conversationLogId: 'conv-log-submit',
          messages: [
            {
              id: 'msg-submit',
              conversationId: 'conv-submit',
              phoneNumber: '+1234567890',
              direction: 'Inbound',
              from: { phoneNumber: '+1234567890' },
              to: [{ phoneNumber: '+0987654321' }]
            }
          ],
          correspondents: [
            { phoneNumber: '+1234567890' }
          ]
        },
        contactId: 'contact-submit',
        contactName: 'Test User',
        additionalSubmission: {
          isAssignedToUser: true
        }
      };

      jwt.decodeJwt.mockReturnValue({
        id: 'user-123',
        platform: 'testCRM'
      });

      const mockConnector = {
        createMessageLog: jest.fn()
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      logCore.createMessageLog.mockResolvedValue({
        successful: true,
        logIds: ['crm-msg-log-submit']
      });

      // Act
      const result = await createMessageLog.execute({
        jwtToken: 'mock-jwt-token',
        incomingData: mockIncomingData
      });

      // Assert
      expect(result.success).toBe(true);
    });

    test('should handle logInfo alias for conversation', async () => {
      // Arrange
      const mockIncomingData = {
        logInfo: {
          conversationId: 'conv-alias',
          conversationLogId: 'conv-log-alias',
          messages: [
            {
              id: 'msg-alias',
              conversationId: 'conv-alias',
              phoneNumber: '+1234567890',
              direction: 'Inbound',
              from: { phoneNumber: '+1234567890' },
              to: [{ phoneNumber: '+0987654321' }]
            }
          ],
          correspondents: [
            { phoneNumber: '+1234567890' }
          ]
        },
        contactId: 'contact-alias',
        contactName: 'Alias Test'
      };

      jwt.decodeJwt.mockReturnValue({
        id: 'user-123',
        platform: 'testCRM'
      });

      const mockConnector = {
        createMessageLog: jest.fn()
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      logCore.createMessageLog.mockResolvedValue({
        successful: true,
        logIds: ['crm-msg-log-alias']
      });

      // Act
      const result = await createMessageLog.execute({
        jwtToken: 'mock-jwt-token',
        incomingData: mockIncomingData
      });

      // Assert
      expect(result.success).toBe(true);
    });

    test('should return error when jwtToken is missing', async () => {
      // Act
      const result = await createMessageLog.execute({
        incomingData: { conversation: {}, contactId: 'test', contactName: 'Test' }
      });

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('authorize CRM platform');
    });

    test('should return error when incomingData is missing', async () => {
      // Act
      const result = await createMessageLog.execute({
        jwtToken: 'mock-jwt-token'
      });

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('Incoming data must be provided');
    });

    test('should return error when JWT is invalid', async () => {
      // Arrange
      const mockIncomingData = {
        conversation: {
          conversationLogId: 'conv-123',
          messages: [],
          correspondents: []
        },
        contactId: 'contact-123',
        contactName: 'Test'
      };

      jwt.decodeJwt.mockReturnValue({
        platform: 'testCRM'
        // id is missing
      });

      // Act
      const result = await createMessageLog.execute({
        jwtToken: 'invalid-token',
        incomingData: mockIncomingData
      });

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid JWT token');
    });

    test('should return error when platform connector not found', async () => {
      // Arrange
      const mockIncomingData = {
        conversation: {
          conversationLogId: 'conv-123',
          messages: [],
          correspondents: []
        },
        contactId: 'contact-123',
        contactName: 'Test'
      };

      jwt.decodeJwt.mockReturnValue({
        id: 'user-123',
        platform: 'unknownCRM'
      });

      connectorRegistry.getConnector.mockReturnValue(null);

      // Act
      const result = await createMessageLog.execute({
        jwtToken: 'mock-jwt-token',
        incomingData: mockIncomingData
      });

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('Platform connector not found');
    });

    test('should return error when createMessageLog is not implemented', async () => {
      // Arrange
      const mockIncomingData = {
        conversation: {
          conversationLogId: 'conv-123',
          messages: [],
          correspondents: []
        },
        contactId: 'contact-123',
        contactName: 'Test'
      };

      jwt.decodeJwt.mockReturnValue({
        id: 'user-123',
        platform: 'testCRM'
      });

      const mockConnector = {}; // No createMessageLog method
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      // Act
      const result = await createMessageLog.execute({
        jwtToken: 'mock-jwt-token',
        incomingData: mockIncomingData
      });

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('not implemented');
    });

    test('should return error when creation fails', async () => {
      // Arrange
      const mockIncomingData = {
        conversation: {
          conversationId: 'conv-fail',
          conversationLogId: 'conv-log-fail',
          messages: [
            {
              id: 'msg-fail',
              conversationId: 'conv-fail',
              phoneNumber: '+1234567890',
              direction: 'Inbound',
              from: { phoneNumber: '+1234567890' },
              to: [{ phoneNumber: '+0987654321' }]
            }
          ],
          correspondents: [
            { phoneNumber: '+1234567890' }
          ]
        },
        contactId: 'contact-fail',
        contactName: 'Fail Test'
      };

      jwt.decodeJwt.mockReturnValue({
        id: 'user-123',
        platform: 'testCRM'
      });

      const mockConnector = {
        createMessageLog: jest.fn()
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      logCore.createMessageLog.mockResolvedValue({
        successful: false,
        returnMessage: { message: 'Failed to create message logs in CRM' }
      });

      // Act
      const result = await createMessageLog.execute({
        jwtToken: 'mock-jwt-token',
        incomingData: mockIncomingData
      });

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to create message logs in CRM');
    });

    test('should handle unexpected errors gracefully', async () => {
      // Arrange
      const mockIncomingData = {
        conversation: {
          conversationLogId: 'conv-error',
          messages: [],
          correspondents: []
        },
        contactId: 'contact-error',
        contactName: 'Error Test'
      };

      jwt.decodeJwt.mockReturnValue({
        id: 'user-123',
        platform: 'testCRM'
      });

      const mockConnector = {
        createMessageLog: jest.fn()
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      logCore.createMessageLog.mockRejectedValue(
        new Error('Network timeout')
      );

      // Act
      const result = await createMessageLog.execute({
        jwtToken: 'mock-jwt-token',
        incomingData: mockIncomingData
      });

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Network timeout');
      expect(result.errorDetails).toBeDefined();
    });
  });
});

