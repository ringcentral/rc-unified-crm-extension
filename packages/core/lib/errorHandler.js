const logger = require('./logger');
const errorMessage = require('./generalErrorMessage');

/**
 * Centralized error handler for API operations
 * Handles common error patterns (rate limits, auth errors, etc.)
 * 
 * @param {Error} error - The error object
 * @param {string} platform - Platform name (clio, bullhorn, etc.)
 * @param {string} operation - Operation name (createCallLog, findContact, etc.)
 * @param {Object} additionalContext - Additional logging context
 * @returns {Object} Standardized error response
 */
function handleApiError(error, platform, operation, additionalContext = {}) {
  const statusCode = error.response?.status ?? 'unknown';
  
  // Log the error with full context
  logger.error(`${operation} failed for platform ${platform}`, {
    platform,
    operation,
    statusCode,
    errorMessage: error.message,
    errorStack: error.stack,
    errorResponse: error.response?.data,
    ...additionalContext,
  });

  // Rate limit error (429)
  if (statusCode === 429) {
    return {
      successful: false,
      returnMessage: errorMessage.rateLimitErrorMessage({ platform }),
      extraDataTracking: {
        statusCode,
      },
    };
  }

  // Authorization/Authentication errors (400-409)
  if (statusCode >= 400 && statusCode < 410) {
    return {
      successful: false,
      returnMessage: errorMessage.authorizationErrorMessage({ platform }),
      extraDataTracking: {
        statusCode,
      },
    };
  }

  // Get operation-specific error message
  const defaultErrorMessage = getOperationErrorMessage(operation, platform);

  return {
    successful: false,
    returnMessage: defaultErrorMessage,
    extraDataTracking: {
      statusCode,
    },
  };
}

/**
 * Get operation-specific error message
 * @param {string} operation - Operation name
 * @param {string} platform - Platform name
 * @returns {Object} Error message object
 */
function getOperationErrorMessage(operation, platform) {
  const operationMessages = {
    createCallLog: {
      message: 'Error creating call log',
      details: ['Please check if your account has permission to CREATE logs.'],
    },
    updateCallLog: {
      message: 'Error updating call log',
      details: [`Please check if the log entity still exists on ${platform} and your account has permission to EDIT logs.`],
    },
    getCallLog: {
      message: 'Error getting call log',
      details: ['Please check if your account has permission to READ logs.'],
    },
    createMessageLog: {
      message: 'Error creating message log',
      details: ['Please check if your account has permission to CREATE logs.'],
    },
    updateMessageLog: {
      message: 'Error updating message log',
      details: [`Please check if the log entity still exists on ${platform} and your account has permission to EDIT logs.`],
    },
    findContact: {
      message: 'Error finding contact',
      details: ['Please check if your account has permission to GET contacts.'],
    },
    createContact: {
      message: 'Error creating contact',
      details: ['Please check if your account has permission to CREATE contacts.'],
    },
    findContactWithName: {
      message: 'Error searching contacts',
      details: ['Please check if your account has permission to GET contacts.'],
    },
  };

  const operationInfo = operationMessages[operation] || {
    message: `Error performing ${operation}`,
    details: ['Please check if your account has the necessary permissions.'],
  };

  return {
    message: operationInfo.message,
    messageType: 'warning',
    details: [
      {
        title: 'Details',
        items: operationInfo.details.map((detail, index) => ({
          id: index + 1,
          type: 'text',
          text: detail,
        })),
      },
    ],
    ttl: 5000,
  };
}

/**
 * Handle database errors
 * @param {Error} error - The error object
 * @param {string} operation - Database operation name
 * @param {Object} context - Additional context
 */
function handleDatabaseError(error, operation, context = {}) {
  logger.error(`Database operation failed: ${operation}`, {
    operation,
    errorMessage: error.message,
    errorStack: error.stack,
    ...context,
  });

  return {
    successful: false,
    returnMessage: {
      message: 'Database operation failed',
      messageType: 'warning',
      ttl: 5000,
    },
  };
}

/**
 * Wrap async route handlers to catch errors
 * Prevents unhandled promise rejections
 * @param {Function} fn - Async route handler
 * @returns {Function} Wrapped handler
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Express error handling middleware
 * Should be added after all routes
 * @param {Error} err - Error object
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next function (required by Express signature)
 */
function errorMiddleware(err, req, res, next) { // eslint-disable-line no-unused-vars
  const platform = req.platform || req.query?.platform || 'unknown';
  const operation = req.route?.path || 'unknown';

  logger.error('Request failed', {
    platform,
    operation,
    method: req.method,
    path: req.path,
    statusCode: err.statusCode || 500,
    error: err,
    correlationId: req.correlationId,
  });

  // Don't expose internal errors in production
  const message = process.env.NODE_ENV === 'production' 
    ? 'An internal error occurred'
    : err.message;

  res.status(err.statusCode || 500).json({
    successful: false,
    returnMessage: {
      message,
      messageType: 'error',
      ttl: 5000,
    },
  });
}

module.exports = {
  handleApiError,
  handleDatabaseError,
  asyncHandler,
  errorMiddleware,
  getOperationErrorMessage,
};

