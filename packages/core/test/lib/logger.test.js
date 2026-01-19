const { Logger, LOG_LEVELS } = require('../../lib/logger');

describe('Logger', () => {
  let originalEnv;
  let consoleSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    originalEnv = process.env.NODE_ENV;
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('Log Levels', () => {
    test('should only log messages at or above the configured level', () => {
      const logger = new Logger({ level: 'WARN' });

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      // Only warn and error should be logged
      expect(consoleSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
    });

    test('should log all messages when level is DEBUG', () => {
      const logger = new Logger({ level: 'DEBUG' });

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      expect(consoleSpy).toHaveBeenCalledTimes(2); // debug and info
      expect(consoleErrorSpy).toHaveBeenCalledTimes(2); // warn and error
    });
  });

  describe('Production vs Development', () => {
    test('should output JSON in production', () => {
      process.env.NODE_ENV = 'production';
      const logger = new Logger({ level: 'INFO' });

      logger.info('test message', { userId: '123' });

      const logOutput = consoleSpy.mock.calls[0][0];
      const parsed = JSON.parse(logOutput);

      expect(parsed).toHaveProperty('timestamp');
      expect(parsed).toHaveProperty('level', 'INFO');
      expect(parsed).toHaveProperty('message', 'test message');
      expect(parsed).toHaveProperty('userId', '123');
    });

    test('should output human-readable format in development', () => {
      process.env.NODE_ENV = 'development';
      const logger = new Logger({ level: 'INFO' });

      logger.info('test message', { userId: '123' });

      const logOutput = consoleSpy.mock.calls[0][0];
      expect(logOutput).toContain('[INFO]');
      expect(logOutput).toContain('test message');
    });
  });

  describe('Error Handling', () => {
    test('should extract error information from Error objects', () => {
      process.env.NODE_ENV = 'production';
      const logger = new Logger({ level: 'ERROR' });
      const error = new Error('Test error');
      error.response = {
        status: 500,
        data: { message: 'Server error' },
      };

      logger.error('Operation failed', { error });

      const logOutput = consoleErrorSpy.mock.calls[0][0];
      const parsed = JSON.parse(logOutput);

      expect(parsed).toHaveProperty('errorMessage', 'Test error');
      expect(parsed).toHaveProperty('errorStack');
      expect(parsed).toHaveProperty('errorStatus', 500);
      expect(parsed).toHaveProperty('errorResponse');
      expect(parsed).not.toHaveProperty('error'); // Should be removed
    });
  });

  describe('Child Logger', () => {
    test('should create child logger with default context', () => {
      process.env.NODE_ENV = 'production';
      const logger = new Logger({ level: 'INFO' });
      const childLogger = logger.child({ platform: 'clio', userId: '123' });

      childLogger.info('test message', { operation: 'createLog' });

      const logOutput = consoleSpy.mock.calls[0][0];
      const parsed = JSON.parse(logOutput);

      expect(parsed).toHaveProperty('platform', 'clio');
      expect(parsed).toHaveProperty('userId', '123');
      expect(parsed).toHaveProperty('operation', 'createLog');
    });

    test('should support nested child loggers', () => {
      process.env.NODE_ENV = 'production';
      const logger = new Logger({ level: 'INFO' });
      const child1 = logger.child({ platform: 'clio' });
      const child2 = child1.child({ userId: '123' });

      child2.info('test message');

      const logOutput = consoleSpy.mock.calls[0][0];
      const parsed = JSON.parse(logOutput);

      expect(parsed).toHaveProperty('platform', 'clio');
      expect(parsed).toHaveProperty('userId', '123');
    });
  });

  describe('API Request Logging', () => {
    test('should log successful API requests at DEBUG level', () => {
      const logger = new Logger({ level: 'DEBUG' });

      logger.logApiRequest({
        method: 'GET',
        url: 'https://api.example.com/users',
        status: 200,
        duration: 150,
        platform: 'clio',
      });

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    test('should log failed API requests at ERROR level', () => {
      const logger = new Logger({ level: 'ERROR' });
      const error = new Error('Request failed');

      logger.logApiRequest({
        method: 'POST',
        url: 'https://api.example.com/logs',
        status: 500,
        duration: 300,
        platform: 'clio',
        error,
      });

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    test('should log 4xx errors at WARN level', () => {
      const logger = new Logger({ level: 'WARN' });

      logger.logApiRequest({
        method: 'GET',
        url: 'https://api.example.com/contact/999',
        status: 404,
        duration: 100,
        platform: 'clio',
      });

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Database Query Logging', () => {
    test('should log successful queries at DEBUG level', () => {
      const logger = new Logger({ level: 'DEBUG' });

      logger.logDatabaseQuery({
        operation: 'SELECT',
        table: 'users',
        duration: 50,
      });

      expect(consoleSpy).toHaveBeenCalledTimes(1);
    });

    test('should log failed queries at ERROR level', () => {
      const logger = new Logger({ level: 'ERROR' });
      const error = new Error('Constraint violation');

      logger.logDatabaseQuery({
        operation: 'INSERT',
        table: 'call_logs',
        duration: 20,
        error,
      });

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });
  });
});

