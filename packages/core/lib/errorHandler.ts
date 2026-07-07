import type {
    AsyncRouteHandler,
    ErrorStatusCode,
    ExpressLikeNext,
    ExpressLikeRequest,
    ExpressLikeResponse,
    LoggerContext,
    OperationFailureResult,
    OperationMessageMap,
    ProviderError,
    ReturnMessage
} from '../types';

const logger = require('./logger');
const errorMessage = require('./generalErrorMessage') as {
    rateLimitErrorMessage(params: { platform?: string }): ReturnMessage;
    authorizationErrorMessage(params: { platform?: string }): ReturnMessage;
};

function handleApiError(
    error: ProviderError,
    platform: string,
    operation: string,
    additionalContext: LoggerContext = {}
): OperationFailureResult {
    const response = error.response;
    const statusCode: ErrorStatusCode = response?.status ?? 'unknown';

    logger.error(`${operation} failed for platform ${platform}`, {
        platform,
        operation,
        statusCode,
        errorMessage: error.message,
        errorStack: error.stack,
        errorResponse: response?.data,
        ...additionalContext
    });

    if (statusCode === 429) {
        return {
            successful: false,
            returnMessage: errorMessage.rateLimitErrorMessage({ platform }),
            extraDataTracking: {
                statusCode
            }
        };
    }

    const numericStatusCode = Number(statusCode);
    if (numericStatusCode >= 400 && numericStatusCode < 410) {
        return {
            successful: false,
            returnMessage: errorMessage.authorizationErrorMessage({ platform }),
            extraDataTracking: {
                statusCode
            }
        };
    }

    const defaultErrorMessage = getOperationErrorMessage(operation, platform);

    return {
        successful: false,
        returnMessage: defaultErrorMessage,
        extraDataTracking: {
            statusCode
        }
    };
}

function getOperationErrorMessage(operation: string, platform: string): ReturnMessage {
    const operationMessages: OperationMessageMap = {
        createCallLog: {
            message: 'Error creating call log',
            details: ['Please check if your account has permission to CREATE logs.']
        },
        updateCallLog: {
            message: 'Error updating call log',
            details: [`Please check if the log entity still exists on ${platform} and your account has permission to EDIT logs.`]
        },
        getCallLog: {
            message: 'Error getting call log',
            details: ['Please check if your account has permission to READ logs.']
        },
        createMessageLog: {
            message: 'Error creating message log',
            details: ['Please check if your account has permission to CREATE logs.']
        },
        updateMessageLog: {
            message: 'Error updating message log',
            details: [`Please check if the log entity still exists on ${platform} and your account has permission to EDIT logs.`]
        },
        findContact: {
            message: 'Error finding contact',
            details: ['Please check if your account has permission to GET contacts.']
        },
        createContact: {
            message: 'Error creating contact',
            details: ['Please check if your account has permission to CREATE contacts.']
        },
        findContactWithName: {
            message: 'Error searching contacts',
            details: ['Please check if your account has permission to GET contacts.']
        },
        createAppointment: {
            message: 'Error creating appointment',
            details: ['Please check if your account has permission to CREATE appointments. or All attendees have email address.']
        },
        updateAppointment: {
            message: 'Error updating appointment',
            details: [`Please check if the appointment entity still exists on ${platform} and your account has permission to EDIT appointments. or All attendees have email address.`]
        },
        getAppointment: {
            message: 'Error getting appointment',
            details: ['Please check if your account has permission to GET appointments.']
        }
    };

    const operationInfo = operationMessages[operation] || {
        message: `Error performing ${operation}`,
        details: ['Please check if your account has the necessary permissions.']
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
                    text: detail
                }))
            }
        ],
        ttl: 5000
    };
}

function handleDatabaseError(
    error: ProviderError,
    operation: string,
    context: LoggerContext = {}
): OperationFailureResult {
    logger.error(`Database operation failed: ${operation}`, {
        operation,
        errorMessage: error.message,
        errorStack: error.stack,
        ...context
    });

    return {
        successful: false,
        returnMessage: {
            message: 'Database operation failed',
            messageType: 'warning',
            ttl: 5000
        }
    };
}

function asyncHandler(fn: AsyncRouteHandler): AsyncRouteHandler {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

function errorMiddleware(
    err: ProviderError,
    req: ExpressLikeRequest,
    res: ExpressLikeResponse,
    next: ExpressLikeNext
): void {
    const platform = req.platform || req.query?.platform || 'unknown';
    const operation = req.route?.path || 'unknown';

    logger.error('Request failed', {
        platform,
        operation,
        method: req.method,
        path: req.path,
        statusCode: err.statusCode || 500,
        error: err,
        correlationId: req.correlationId
    });

    const message = process.env.NODE_ENV === 'production'
        ? 'An internal error occurred'
        : err.message;

    res.status(err.statusCode || 500).json({
        successful: false,
        returnMessage: {
            message,
            messageType: 'error',
            ttl: 5000
        }
    });
}

export {
    handleApiError,
    handleDatabaseError,
    asyncHandler,
    errorMiddleware,
    getOperationErrorMessage
};
