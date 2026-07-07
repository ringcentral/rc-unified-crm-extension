const createContact = require('../../../mcp/tools/createContact');
const jwt = require('../../../lib/jwt');
const connectorRegistry = require('../../../connector/registry');
const contactCore = require('../../../handlers/contact');

jest.mock('../../../lib/jwt');
jest.mock('../../../connector/registry');
jest.mock('../../../handlers/contact');

describe('MCP Tool: createContact', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should have correct tool definition', () => {
    expect(createContact.definition).toBeDefined();
    expect(createContact.definition.name).toBe('createContact');
    expect(createContact.definition.inputSchema.required).toContain('phoneNumber');
  });

  test('should create contact successfully', async () => {
    jwt.decodeJwt.mockReturnValue({ id: 'user-123', platform: 'testCRM' });
    connectorRegistry.getConnector.mockReturnValue({ createContact: jest.fn() });
    contactCore.createContact.mockResolvedValue({
      successful: true,
      returnMessage: { message: 'Created' },
      contact: { id: 'contact-1' }
    });

    const result = await createContact.execute({
      jwtToken: 'mock-jwt-token',
      phoneNumber: '+14155551234',
      newContactName: 'John Doe'
    });

    expect(result).toEqual({
      success: true,
      data: {
        contact: { id: 'contact-1' },
        message: 'Created'
      }
    });
  });

  test('should return error when decodeJwt returns null', async () => {
    jwt.decodeJwt.mockReturnValue(null);

    const result = await createContact.execute({
      jwtToken: 'invalid-jwt',
      phoneNumber: '+14155551234',
      newContactName: 'John Doe'
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid JWT token');
  });
});


export {};
