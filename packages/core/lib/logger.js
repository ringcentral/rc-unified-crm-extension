const util = require('util');

/**
 * Logger levels
 */
const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
};

/**
 * Color codes for terminal output
 */
const COLORS = {
  ERROR: '\x1b[31m', // Red
  WARN: '\x1b[33m',  // Yellow
  INFO: '\x1b[36m',  // Cyan
  DEBUG: '\x1b[90m', // Gray
  RESET: '\x1b[0m',
};

class Logger {
  constructor(options = {}) {
    this.level = this._getLogLevel(options.level || process.env.LOG_LEVEL || 'INFO');
    this.isProd = process.env.NODE_ENV === 'production';
    this.enableColors = !this.isProd && process.stdout.isTTY;
  }

  _getLogLevel(levelName) {
    const upperLevel = levelName.toUpperCase();
    return LOG_LEVELS[upperLevel] !== undefined ? LOG_LEVELS[upperLevel] : LOG_LEVELS.INFO;
  }

  _shouldLog(level) {
    return LOG_LEVELS[level] <= this.level;
  }

  _formatMessage(level, message, context = {}) {
    const timestamp = new Date().toISOString();
    
    if (this.isProd) {
      // Production: JSON format for log aggregation tools
      return JSON.stringify({
        timestamp,
        level,
        message,
        ...context,
      });
    } else {
      // Development: Human-readable format with colors
      const color = this.enableColors ? COLORS[level] : '';
      const reset = this.enableColors ? COLORS.RESET : '';
      const contextStr = Object.keys(context).length > 0 
        ? '\n' + util.inspect(context, { depth: 4, colors: this.enableColors })
        : '';
      
      return `${color}[${timestamp}] [${level}]${reset} ${message}${contextStr}`;
    }
  }

  _log(level, message, context = {}) {
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

  /**
   * Log error level messages
   * @param {string} message - Log message
   * @param {Object} context - Additional context (error, stack, platform, etc.)
   */
  error(message, context = {}) {
    // If context has an error object, extract useful information
    let enrichedContext = context;
    if (context.error instanceof Error) {
      const { error, ...rest } = context;
      enrichedContext = {
        ...rest,
        errorMessage: error.message,
        errorStack: error.stack,
        errorResponse: error.response?.data,
        errorStatus: error.response?.status,
      };
    }
    
    this._log('ERROR', message, enrichedContext);
  }

  /**
   * Log warning level messages
   * @param {string} message - Log message
   * @param {Object} context - Additional context
   */
  warn(message, context = {}) {
    this._log('WARN', message, context);
  }

  /**
   * Log info level messages
   * @param {string} message - Log message
   * @param {Object} context - Additional context
   */
  info(message, context = {}) {
    this._log('INFO', message, context);
  }

  /**
   * Log debug level messages
   * @param {string} message - Log message
   * @param {Object} context - Additional context
   */
  debug(message, context = {}) {
    this._log('DEBUG', message, context);
  }

  /**
   * Create a child logger with default context
   * Useful for adding request-specific or module-specific context
   * @param {Object} defaultContext - Context to include in all logs
   * @returns {Object} Child logger with bound context
   */
  child(defaultContext = {}) {
    return {
      error: (message, context = {}) => this.error(message, { ...defaultContext, ...context }),
      warn: (message, context = {}) => this.warn(message, { ...defaultContext, ...context }),
      info: (message, context = {}) => this.info(message, { ...defaultContext, ...context }),
      debug: (message, context = {}) => this.debug(message, { ...defaultContext, ...context }),
      child: (additionalContext) => this.child({ ...defaultContext, ...additionalContext }),
    };
  }

  /**
   * Log API request/response for debugging
   * @param {Object} options - Request details
   */
  logApiRequest({ method, url, status, duration, platform, error }) {
    const context = {
      method,
      url,
      status,
      duration: duration ? `${duration}ms` : undefined,
      platform,
    };

    if (error) {
      this.error('API request failed', { ...context, error });
    } else if (status >= 400) {
      this.warn('API request returned error status', context);
    } else {
      this.debug('API request completed', context);
    }
  }

  /**
   * Log database query for debugging
   * @param {Object} options - Query details
   */
  logDatabaseQuery({ operation, table, duration, error }) {
    const context = {
      operation,
      table,
      duration: duration ? `${duration}ms` : undefined,
    };

    if (error) {
      this.error('Database query failed', { ...context, error });
    } else {
      this.debug('Database query completed', context);
    }
  }
}

// Create singleton instance
const logger = new Logger();

// Export both the class and instance
module.exports = logger;
module.exports.Logger = Logger;
module.exports.LOG_LEVELS = LOG_LEVELS;

