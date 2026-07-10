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

  test('should create contact with the default success message', async () => {
    jwt.decodeJwt.mockReturnValue({ id: 'user-123', platform: 'testCRM' });
    connectorRegistry.getConnector.mockReturnValue({ createContact: jest.fn() });
    contactCore.createContact.mockResolvedValue({
      successful: true,
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
        message: 'Contact created successfully'
      }
    });
  });

  test('should validate required inputs before decoding the token', async () => {
    await expect(createContact.execute({
      phoneNumber: '+14155551234',
      newContactName: 'John Doe'
    })).resolves.toMatchObject({
      success: false,
      error: 'Please go to Settings and authorize CRM platform'
    });

    await expect(createContact.execute({
      jwtToken: 'mock-jwt-token',
      newContactName: 'John Doe'
    })).resolves.toMatchObject({
      success: false,
      error: 'Phone number is required'
    });

    await expect(createContact.execute({
      jwtToken: 'mock-jwt-token',
      phoneNumber: '+14155551234'
    })).resolves.toMatchObject({
      success: false,
      error: 'Contact name is required'
    });

    expect(jwt.decodeJwt).not.toHaveBeenCalled();
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

  test('should reject decoded tokens without a user id', async () => {
    jwt.decodeJwt.mockReturnValue({ platform: 'testCRM' });

    await expect(createContact.execute({
      jwtToken: 'mock-jwt-token',
      phoneNumber: '+14155551234',
      newContactName: 'John Doe'
    })).resolves.toMatchObject({
      success: false,
      error: 'Invalid JWT token: userId not found'
    });
  });

  test('should validate connector availability and capability', async () => {
    jwt.decodeJwt.mockReturnValue({ id: 'user-123', platform: 'testCRM' });

    connectorRegistry.getConnector.mockReturnValueOnce(null);
    await expect(createContact.execute({
      jwtToken: 'mock-jwt-token',
      phoneNumber: '+14155551234',
      newContactName: 'John Doe'
    })).resolves.toMatchObject({
      success: false,
      error: 'Platform connector not found for: testCRM'
    });

    connectorRegistry.getConnector.mockReturnValueOnce({});
    await expect(createContact.execute({
      jwtToken: 'mock-jwt-token',
      phoneNumber: '+14155551234',
      newContactName: 'John Doe'
    })).resolves.toMatchObject({
      success: false,
      error: 'createContact is not implemented for platform: testCRM'
    });
  });

  test('should return handler failure messages and defaults', async () => {
    jwt.decodeJwt.mockReturnValue({ id: 'user-123', platform: 'testCRM' });
    connectorRegistry.getConnector.mockReturnValue({ createContact: jest.fn() });

    contactCore.createContact.mockResolvedValueOnce({
      successful: false,
      returnMessage: { message: 'Create failed' }
    });
    await expect(createContact.execute({
      jwtToken: 'mock-jwt-token',
      phoneNumber: '+14155551234',
      newContactName: 'John Doe'
    })).resolves.toMatchObject({
      success: false,
      error: 'Create failed'
    });

    contactCore.createContact.mockResolvedValueOnce({
      successful: false
    });
    await expect(createContact.execute({
      jwtToken: 'mock-jwt-token',
      phoneNumber: '+14155551234',
      newContactName: 'John Doe'
    })).resolves.toMatchObject({
      success: false,
      error: 'Failed to create contact'
    });
  });
});


export {};
