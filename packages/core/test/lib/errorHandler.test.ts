jest.mock('../../lib/logger', () => ({
  error: jest.fn(),
}));

const logger = require('../../lib/logger');
const tsErrorHandler = require('../../lib/errorHandler.ts');
const {
  asyncHandler,
  errorMiddleware,
  getOperationErrorMessage,
  handleApiError,
  handleDatabaseError,
} = require('../../lib/errorHandler');

describe('errorHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('handleApiError', () => {
    test('maps rate limit responses to the platform rate limit message', () => {
      const error = new Error('too many requests');
      error.response = {
        status: 429,
        data: { message: 'rate limited' },
      };

      const result = handleApiError(error, 'Clio', 'createCallLog', { accountId: 'account-1' });

      expect(logger.error).toHaveBeenCalledWith('createCallLog failed for platform Clio', expect.objectContaining({
        platform: 'Clio',
        operation: 'createCallLog',
        statusCode: 429,
        accountId: 'account-1',
      }));
      expect(result).toMatchObject({
        successful: false,
        extraDataTracking: { statusCode: 429 },
      });
      expect(result.returnMessage.message).toBe('Rate limit exceeded');
      expect(result.returnMessage.details[0].items[0].text).toContain('Clio');
    });

    test('maps 400-409 responses to authorization messages', () => {
      const error = new Error('unauthorized');
      error.response = {
        status: 401,
        data: { message: 'unauthorized' },
      };

      const result = handleApiError(error, 'Bullhorn', 'findContact');

      expect(result.successful).toBe(false);
      expect(result.extraDataTracking).toEqual({ statusCode: 401 });
      expect(result.returnMessage.message).toBe('Authorization error');
      expect(result.returnMessage.details[0].items[0].text).toContain('Bullhorn');
    });

    test('maps non-auth provider errors to operation-specific messages', () => {
      const error = new Error('provider unavailable');
      error.response = {
        status: 500,
        data: { message: 'unavailable' },
      };

      const result = handleApiError(error, 'Salesforce', 'updateCallLog');

      expect(result).toEqual({
        successful: false,
        returnMessage: {
          message: 'Error updating call log',
          messageType: 'warning',
          details: [
            {
              title: 'Details',
              items: [
                {
                  id: 1,
                  type: 'text',
                  text: 'Please check if the log entity still exists on Salesforce and your account has permission to EDIT logs.',
                },
              ],
            },
          ],
          ttl: 5000,
        },
        extraDataTracking: {
          statusCode: 500,
        },
      });
    });

    test('uses unknown status when the error has no response status', () => {
      const result = handleApiError(new Error('network down'), 'Pipedrive', 'createContact');

      expect(result.extraDataTracking).toEqual({ statusCode: 'unknown' });
      expect(result.returnMessage.message).toBe('Error creating contact');
    });

    test('TypeScript implementation keeps API error mapping aligned with compatibility JS entrypoint', () => {
      const jsError = new Error('provider unavailable');
      jsError.response = {
        status: 500,
        data: { message: 'unavailable' },
      };
      const tsError = new Error('provider unavailable');
      tsError.response = {
        status: 500,
        data: { message: 'unavailable' },
      };

      expect(tsErrorHandler.handleApiError(tsError, 'Salesforce', 'updateCallLog')).toEqual(
        handleApiError(jsError, 'Salesforce', 'updateCallLog')
      );
    });
  });

  describe('getOperationErrorMessage', () => {
    test('returns configured appointment messages with platform interpolation', () => {
      const result = getOperationErrorMessage('updateAppointment', 'Google');

      expect(result.message).toBe('Error updating appointment');
      expect(result.details[0].items[0].text).toContain('exists on Google');
      expect(result.details[0].items[0].id).toBe(1);
    });

    test('returns a generic message for unknown operations', () => {
      const result = getOperationErrorMessage('syncCustomObject', 'CRM');

      expect(result).toEqual({
        message: 'Error performing syncCustomObject',
        messageType: 'warning',
        details: [
          {
            title: 'Details',
            items: [
              {
                id: 1,
                type: 'text',
                text: 'Please check if your account has the necessary permissions.',
              },
            ],
          },
        ],
        ttl: 5000,
      });
    });

    test('TypeScript implementation keeps operation messages aligned', () => {
      expect(tsErrorHandler.getOperationErrorMessage('updateAppointment', 'Google')).toEqual(
        getOperationErrorMessage('updateAppointment', 'Google')
      );
    });
  });

  describe('handleDatabaseError', () => {
    test('logs context and returns the database warning response', () => {
      const error = new Error('connection lost');

      const result = handleDatabaseError(error, 'saveUser', { userId: 'user-1' });

      expect(logger.error).toHaveBeenCalledWith('Database operation failed: saveUser', expect.objectContaining({
        operation: 'saveUser',
        errorMessage: 'connection lost',
        userId: 'user-1',
      }));
      expect(result).toEqual({
        successful: false,
        returnMessage: {
          message: 'Database operation failed',
          messageType: 'warning',
          ttl: 5000,
        },
      });
    });
  });

  describe('asyncHandler', () => {
    test('passes through successful async handlers', async () => {
      const req = {};
      const res = {};
      const next = jest.fn();
      const handler = jest.fn().mockResolvedValue('done');

      asyncHandler(handler)(req, res, next);
      await Promise.resolve();

      expect(handler).toHaveBeenCalledWith(req, res, next);
      expect(next).not.toHaveBeenCalled();
    });

    test('forwards rejected async handlers to next', async () => {
      const req = {};
      const res = {};
      const next = jest.fn();
      const error = new Error('failed');

      asyncHandler(jest.fn().mockRejectedValue(error))(req, res, next);
      await Promise.resolve();

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('errorMiddleware', () => {
    const originalNodeEnv = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = originalNodeEnv;
    });

    test('responds with development error details and request status code', () => {
      process.env.NODE_ENV = 'test';
      const err = new Error('visible error');
      err.statusCode = 418;
      const req = {
        platform: 'Clio',
        method: 'POST',
        path: '/test',
        route: { path: '/test' },
        correlationId: 'correlation-1',
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      errorMiddleware(err, req, res, jest.fn());

      expect(logger.error).toHaveBeenCalledWith('Request failed', expect.objectContaining({
        platform: 'Clio',
        operation: '/test',
        method: 'POST',
        path: '/test',
        statusCode: 418,
        correlationId: 'correlation-1',
      }));
      expect(res.status).toHaveBeenCalledWith(418);
      expect(res.json).toHaveBeenCalledWith({
        successful: false,
        returnMessage: {
          message: 'visible error',
          messageType: 'error',
          ttl: 5000,
        },
      });
    });

    test('hides internal error details in production', () => {
      process.env.NODE_ENV = 'production';
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      errorMiddleware(new Error('secret detail'), { query: { platform: 'CRM' } }, res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        successful: false,
        returnMessage: {
          message: 'An internal error occurred',
          messageType: 'error',
          ttl: 5000,
        },
      });
    });
  });
});


export {};
