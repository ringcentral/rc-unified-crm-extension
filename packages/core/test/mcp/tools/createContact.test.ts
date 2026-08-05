const createContact = require('../../../mcp/tools/createContact');
const jwt = require('../../../lib/jwt');
const connectorRegistry = require('../../../connector/registry');
const contactCore = require('../../../handlers/contact');
const {
  invalidContactAuthTokenCases,
  invalidContactDecodedJwtCases,
  normalizedAdapterRejectionCases,
  invalidAdapterResponseCases,
} = require('../data/contactToolCases');
const {
  createContactForwardingCases,
  createContactSuccessCases,
  createContactFailureCases,
  invalidCreatePhoneCases,
  invalidCreateNameCases,
  invalidCreateCapabilityCases,
} = require('../data/createContactCases');

jest.mock('../../../lib/jwt');
jest.mock('../../../connector/registry');
jest.mock('../../../handlers/contact');

describe('MCP Tool: createContact', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const arrangeAuthorizedCreate = (...resultArgs) => {
    const createResult = resultArgs.length === 0
      ? {
        successful: true,
        returnMessage: { message: 'Created' },
        contact: { id: 'contact-variation' },
      }
      : resultArgs[0];
    jwt.decodeJwt.mockReturnValue({
      id: 'user-客户-42',
      platform: 'crm-東京',
    });
    connectorRegistry.getConnector.mockReturnValue({
      createContact: jest.fn(),
    });
    contactCore.createContact.mockResolvedValue(createResult);
  };

  test('should have correct tool definition', () => {
    expect(createContact.definition).toBeDefined();
    expect(createContact.definition.name).toBe('createContact');
    expect(createContact.definition.inputSchema.required).toContain('phoneNumber');
    expect(createContact.definition.inputSchema.required).not.toContain('newContactName');
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

  test('should validate authentication and phone inputs before decoding the token', async () => {
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

  test.each<[any]>(createContactForwardingCases as [any][])('creates a contact for $label', async ({ phoneNumber, newContactName, expectedName }) => {
    arrangeAuthorizedCreate();

    const result = await createContact.execute({
      jwtToken: 'jwt-会话-🚀',
      phoneNumber,
      newContactName,
    });

    expect(result).toEqual({
      success: true,
      data: {
        contact: { id: 'contact-variation' },
        message: 'Created',
      },
    });
    expect(contactCore.createContact).toHaveBeenCalledWith({
      platform: 'crm-東京',
      userId: 'user-客户-42',
      phoneNumber,
      newContactName: expectedName,
    });
  });

  test.each<[any]>(createContactSuccessCases as [any][])('preserves $label output data', async ({ createResult, expectedMessage }) => {
    arrangeAuthorizedCreate(createResult);

    await expect(createContact.execute({
      jwtToken: 'jwt-token',
      phoneNumber: '+14155550100',
      newContactName: 'Customer',
    })).resolves.toEqual({
      success: true,
      data: {
        contact: createResult.contact,
        message: expectedMessage,
      },
    });
  });

  test.each<[any]>(createContactFailureCases as [any][])('returns a stable failure for $label', async ({ createResult, expected }) => {
    arrangeAuthorizedCreate(createResult);

    await expect(createContact.execute({
      jwtToken: 'jwt-token',
      phoneNumber: '+14155550100',
      newContactName: 'Customer',
    })).resolves.toEqual({ success: false, error: expected });
  });

  test.each<[any]>(invalidAdapterResponseCases as [any][])('handles an invalid $label handler response without throwing', async ({ result }) => {
    arrangeAuthorizedCreate(result);

    await expect(createContact.execute({
      jwtToken: 'jwt-token',
      phoneNumber: '+14155550100',
      newContactName: 'Customer',
    })).resolves.toMatchObject({
      success: false,
      error: 'Contact creation returned an invalid response',
    });
  });

  test.each<[any]>(normalizedAdapterRejectionCases as [any][])('normalizes a $label into a stable error result', async ({ rejection, expected }) => {
    arrangeAuthorizedCreate();
    contactCore.createContact.mockRejectedValueOnce(rejection);

    await expect(createContact.execute({
      jwtToken: 'jwt-token',
      phoneNumber: '+14155550100',
      newContactName: 'Customer',
    })).resolves.toMatchObject({ success: false, error: expected });
  });

  test.each<[any]>(invalidContactAuthTokenCases as [any][])('rejects $label before decoding authentication', async ({ jwtToken }) => {
    await expect(createContact.execute({
      jwtToken,
      phoneNumber: '+14155550100',
      newContactName: 'Customer',
    })).resolves.toMatchObject({
      success: false,
      error: 'Please go to Settings and authorize CRM platform',
    });
    expect(jwt.decodeJwt).not.toHaveBeenCalled();
  });

  test.each<[any]>(invalidCreatePhoneCases as [any][])('rejects $label before decoding authentication', async ({ phoneNumber, expected }) => {
    await expect(createContact.execute({
      jwtToken: 'jwt-token',
      phoneNumber,
      newContactName: 'Customer',
    })).resolves.toMatchObject({ success: false, error: expected });
    expect(jwt.decodeJwt).not.toHaveBeenCalled();
  });

  test.each<[any]>(invalidCreateNameCases as [any][])('rejects $label before decoding authentication', async ({ newContactName }) => {
    await expect(createContact.execute({
      jwtToken: 'jwt-token',
      phoneNumber: '+14155550100',
      newContactName,
    })).resolves.toMatchObject({
      success: false,
      error: 'Contact name must be a string',
    });
    expect(jwt.decodeJwt).not.toHaveBeenCalled();
  });

  test.each<[any]>(invalidContactDecodedJwtCases as [any][])('rejects decoded JWT with $label', async ({ decoded, expected }) => {
    jwt.decodeJwt.mockReturnValue(decoded);

    await expect(createContact.execute({
      jwtToken: 'jwt-token',
      phoneNumber: '+14155550100',
      newContactName: 'Customer',
    })).resolves.toMatchObject({ success: false, error: expected });
    expect(contactCore.createContact).not.toHaveBeenCalled();
  });

  test.each<[any]>(invalidCreateCapabilityCases as [any][])('rejects connector with $label', async ({ connector }) => {
    jwt.decodeJwt.mockReturnValue({ id: 'user-1', platform: 'testCRM' });
    connectorRegistry.getConnector.mockReturnValue(connector);

    await expect(createContact.execute({
      jwtToken: 'jwt-token',
      phoneNumber: '+14155550100',
      newContactName: 'Customer',
    })).resolves.toMatchObject({
      success: false,
      error: 'createContact is not implemented for platform: testCRM',
    });
    expect(contactCore.createContact).not.toHaveBeenCalled();
  });
});


export {};
