import type {
    ApiRequestLogOptions,
    ChildLogger,
    DatabaseQueryLogOptions,
    LoggerContext,
    LoggerLevelName,
    LoggerMessage,
    LoggerOptions
} from '../types';

const util = require('util');

const LOG_LEVELS: Record<LoggerLevelName, number> = {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3
};

const COLORS: Record<LoggerLevelName | 'RESET', string> = {
    ERROR: '\x1b[31m',
    WARN: '\x1b[33m',
    INFO: '\x1b[36m',
    DEBUG: '\x1b[90m',
    RESET: '\x1b[0m'
};

class Logger {
    level: number;
    isProd: boolean;
    enableColors: boolean;

    constructor(options: LoggerOptions = {}) {
        this.level = this._getLogLevel(options.level || process.env.LOG_LEVEL || 'INFO');
        this.isProd = process.env.NODE_ENV === 'production';
        this.enableColors = !this.isProd && Boolean(process.stdout.isTTY);
    }

    _getLogLevel(levelName: string): number {
        const upperLevel = levelName.toUpperCase() as LoggerLevelName;
        return LOG_LEVELS[upperLevel] !== undefined ? LOG_LEVELS[upperLevel] : LOG_LEVELS.INFO;
    }

    _shouldLog(level: LoggerLevelName): boolean {
        return LOG_LEVELS[level] <= this.level;
    }

    // Callers occasionally pass an Error or a `{ message, ...context }` object as the message.
    // Without this guard the output becomes the useless literal "[object Object]". Objects
    // without a string `message` are deliberately NOT serialized: dumping an arbitrary object
    // (a user record, an axios response) into the log is how PII and tokens leak.
    _normalizeMessage(message: LoggerMessage, context: LoggerContext = {}): { message: string; context: LoggerContext } {
        if (typeof message === 'string') {
            return { message, context };
        }
        if (message instanceof Error) {
            return {
                message: message.message,
                context: { stack: message.stack, ...context }
            };
        }
        if (message !== null && typeof message === 'object') {
            const { message: innerMessage, ...rest } = message as Record<string, any>;
            if (typeof innerMessage === 'string') {
                return { message: innerMessage, context: { ...rest, ...context } };
            }
            return {
                message: 'Logger called with a non-message object',
                context: { ...context, objectKeys: Object.keys(message) }
            };
        }
        return { message: String(message), context };
    }

    _formatMessage(level: LoggerLevelName, message: string, context: LoggerContext = {}): string {
        const timestamp = new Date().toISOString();

        if (this.isProd) {
            return JSON.stringify({
                timestamp,
                level,
                message,
                ...context
            });
        }

        const color = this.enableColors ? COLORS[level] : '';
        const reset = this.enableColors ? COLORS.RESET : '';
        const contextStr = Object.keys(context).length > 0
            ? '\n' + util.inspect(context, { depth: 4, colors: this.enableColors })
            : '';

        return `${color}[${timestamp}] [${level}]${reset} ${message}${contextStr}`;
    }

    _log(level: LoggerLevelName, message: string, context: LoggerContext = {}): void {
        if (!this._shouldLog(level)) {
            return;
        }

        const formattedMessage = this._formatMessage(level, message, context);

        if (level === 'ERROR' || level === 'WARN') {
            console.error(formattedMessage);
        } else {
            console.log(formattedMessage);
        }
    }

    error(rawMessage: LoggerMessage, rawContext: LoggerContext = {}): void {
        const { message, context } = this._normalizeMessage(rawMessage, rawContext);
        let enrichedContext = context;
        if (context.error instanceof Error) {
            const { error, ...rest } = context;
            const response = (error as any).response;
            enrichedContext = {
                ...rest,
                errorMessage: error.message,
                errorStack: error.stack,
                errorResponse: response?.data,
                errorStatus: response?.status
            };
        }

        this._log('ERROR', message, enrichedContext);
    }

    warn(rawMessage: LoggerMessage, rawContext: LoggerContext = {}): void {
        const { message, context } = this._normalizeMessage(rawMessage, rawContext);
        this._log('WARN', message, context);
    }

    info(rawMessage: LoggerMessage, rawContext: LoggerContext = {}): void {
        const { message, context } = this._normalizeMessage(rawMessage, rawContext);
        this._log('INFO', message, context);
    }

    debug(rawMessage: LoggerMessage, rawContext: LoggerContext = {}): void {
        const { message, context } = this._normalizeMessage(rawMessage, rawContext);
        this._log('DEBUG', message, context);
    }

    child(defaultContext: LoggerContext = {}): ChildLogger {
        return {
            error: (message, context = {}) => this.error(message, { ...defaultContext, ...context }),
            warn: (message, context = {}) => this.warn(message, { ...defaultContext, ...context }),
            info: (message, context = {}) => this.info(message, { ...defaultContext, ...context }),
            debug: (message, context = {}) => this.debug(message, { ...defaultContext, ...context }),
            child: (additionalContext = {}) => this.child({ ...defaultContext, ...additionalContext })
        };
    }

    logApiRequest({ method, url, status, duration, platform, error }: ApiRequestLogOptions): void {
        const context = {
            method,
            url,
            status,
            duration: duration ? `${duration}ms` : undefined,
            platform
        };

        if (error) {
            this.error('API request failed', { ...context, error });
        } else if (status !== undefined && status >= 400) {
            this.warn('API request returned error status', context);
        } else {
            this.debug('API request completed', context);
        }
    }

    logDatabaseQuery({ operation, table, duration, error }: DatabaseQueryLogOptions): void {
        const context = {
            operation,
            table,
            duration: duration ? `${duration}ms` : undefined
        };

        if (error) {
            this.error('Database query failed', { ...context, error });
        } else {
            this.debug('Database query completed', context);
        }
    }
}

const logger = new Logger() as Logger & {
    Logger: typeof Logger;
    LOG_LEVELS: typeof LOG_LEVELS;
};

logger.Logger = Logger;
logger.LOG_LEVELS = LOG_LEVELS;

export = logger;
