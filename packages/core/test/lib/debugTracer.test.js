const { DebugTracer } = require('../../lib/debugTracer');

describe('DebugTracer', () => {
  let tracer;

  beforeEach(() => {
    tracer = new DebugTracer();
  });

  describe('constructor', () => {
    test('should initialize with empty traces array', () => {
      expect(tracer.traces).toEqual([]);
    });

    test('should set start time', () => {
      expect(tracer.startTime).toBeDefined();
      expect(typeof tracer.startTime).toBe('number');
    });

    test('should generate unique request ID', () => {
      const tracer2 = new DebugTracer();
      expect(tracer.requestId).toBeDefined();
      expect(tracer.requestId).toMatch(/^req_\d+_[a-z0-9]+$/);
      expect(tracer.requestId).not.toBe(tracer2.requestId);
    });

    test('should accept headers parameter', () => {
      const headers = { 'x-request-id': 'custom-id' };
      const tracerWithHeaders = new DebugTracer(headers);
      expect(tracerWithHeaders.requestId).toBeDefined();
    });
  });

  describe('trace', () => {
    test('should add trace entry with method name and data', () => {
      tracer.trace('testMethod', { name: 'value', count: 42 });

      expect(tracer.traces).toHaveLength(1);
      expect(tracer.traces[0].methodName).toBe('testMethod');
      expect(tracer.traces[0].data).toEqual({ name: 'value', count: 42 });
    });

    test('should include timestamp and elapsed time', () => {
      tracer.trace('testMethod', {});

      expect(tracer.traces[0].timestamp).toBeDefined();
      expect(tracer.traces[0].elapsed).toBeGreaterThanOrEqual(0);
    });

    test('should default to info level', () => {
      tracer.trace('testMethod', {});

      expect(tracer.traces[0].level).toBe('info');
    });

    test('should allow custom log level', () => {
      tracer.trace('testMethod', {}, { level: 'warn' });

      expect(tracer.traces[0].level).toBe('warn');
    });

    test('should include stack trace by default', () => {
      tracer.trace('testMethod', {});

      expect(tracer.traces[0].stackTrace).toBeDefined();
      expect(Array.isArray(tracer.traces[0].stackTrace)).toBe(true);
    });

    test('should exclude stack trace when disabled', () => {
      tracer.trace('testMethod', {}, { includeStack: false });

      expect(tracer.traces[0].stackTrace).toBeUndefined();
    });

    test('should return this for chaining', () => {
      const result = tracer.trace('method1', {});
      expect(result).toBe(tracer);

      tracer.trace('method2', {}).trace('method3', {});
      expect(tracer.traces).toHaveLength(3);
    });

    test('should handle empty data object', () => {
      tracer.trace('testMethod');

      expect(tracer.traces[0].data).toEqual({});
    });
  });

  describe('traceError', () => {
    test('should add error trace with Error object', () => {
      const error = new Error('Test error message');
      tracer.traceError('failingMethod', error);

      expect(tracer.traces).toHaveLength(1);
      expect(tracer.traces[0].methodName).toBe('failingMethod');
      expect(tracer.traces[0].level).toBe('error');
      expect(tracer.traces[0].data.message).toBe('Test error message');
      expect(tracer.traces[0].data.errorStack).toContain('Error: Test error message');
    });

    test('should handle string error', () => {
      tracer.traceError('failingMethod', 'Something went wrong');

      expect(tracer.traces[0].data.message).toBe('Something went wrong');
      expect(tracer.traces[0].data.errorStack).toBeNull();
    });

    test('should include additional data', () => {
      const error = new Error('Test error');
      tracer.traceError('failingMethod', error, { userId: 'user-123', action: 'create' });

      expect(tracer.traces[0].data.userId).toBe('user-123');
      expect(tracer.traces[0].data.action).toBe('create');
    });

    test('should return this for chaining', () => {
      const result = tracer.traceError('method', new Error('test'));
      expect(result).toBe(tracer);
    });
  });

  describe('_sanitizeData', () => {
    test('should redact sensitive fields', () => {
      tracer.trace('testMethod', {
        accessToken: 'secret-token',
        refreshToken: 'secret-refresh',
        apiKey: 'api-key-123',
        password: 'secret-password',
        username: 'normal-field'
      });

      const data = tracer.traces[0].data;
      expect(data.accessToken).toBe('[REDACTED]');
      expect(data.refreshToken).toBe('[REDACTED]');
      expect(data.apiKey).toBe('[REDACTED]');
      expect(data.password).toBe('[REDACTED]');
      expect(data.username).toBe('normal-field');
    });

    test('should sanitize nested objects', () => {
      tracer.trace('testMethod', {
        user: {
          name: 'John',
          userPassword: 'secret123',
          userAccessToken: 'token123'
        }
      });

      const data = tracer.traces[0].data;
      expect(data.user.name).toBe('John');
      expect(data.user.userPassword).toBe('[REDACTED]');
      expect(data.user.userAccessToken).toBe('[REDACTED]');
    });

    test('should handle arrays', () => {
      tracer.trace('testMethod', {
        users: [
          { name: 'User1', apiKey: 'key1' },
          { name: 'User2', apiKey: 'key2' }
        ]
      });

      const data = tracer.traces[0].data;
      expect(data.users[0].name).toBe('User1');
      expect(data.users[0].apiKey).toBe('[REDACTED]');
      expect(data.users[1].apiKey).toBe('[REDACTED]');
    });

    test('should handle null and undefined data', () => {
      tracer.trace('testMethod', null);
      tracer.trace('testMethod2');

      expect(tracer.traces[0].data).toBeNull();
      // When undefined is passed, it defaults to {} from the default parameter
      expect(tracer.traces[1].data).toEqual({});
    });

    test('should handle primitive data', () => {
      tracer.trace('testMethod', 'string-value');
      tracer.trace('testMethod2', 42);

      expect(tracer.traces[0].data).toBe('string-value');
      expect(tracer.traces[1].data).toBe(42);
    });

    test('should redact case-insensitive sensitive fields', () => {
      tracer.trace('testMethod', {
        AccessToken: 'secret1',
        APIKEY: 'secret2',
        clientSecret: 'secret3'
      });

      const data = tracer.traces[0].data;
      expect(data.AccessToken).toBe('[REDACTED]');
      expect(data.APIKEY).toBe('[REDACTED]');
      expect(data.clientSecret).toBe('[REDACTED]');
    });

    test('should redact partial matches', () => {
      tracer.trace('testMethod', {
        userAuthToken: 'secret',
        adminCredentials: 'secret',
        myPrivateKey: 'secret'
      });

      const data = tracer.traces[0].data;
      expect(data.userAuthToken).toBe('[REDACTED]');
      expect(data.adminCredentials).toBe('[REDACTED]');
      expect(data.myPrivateKey).toBe('[REDACTED]');
    });
  });

  describe('getTraceData', () => {
    test('should return complete trace data', () => {
      tracer.trace('method1', { step: 1 });
      tracer.trace('method2', { step: 2 });

      const traceData = tracer.getTraceData();

      expect(traceData.requestId).toBe(tracer.requestId);
      expect(traceData.totalDuration).toMatch(/\d+ms$/);
      expect(traceData.traceCount).toBe(2);
      expect(traceData.traces).toHaveLength(2);
    });

    test('should return empty traces for new tracer', () => {
      const traceData = tracer.getTraceData();

      expect(traceData.traceCount).toBe(0);
      expect(traceData.traces).toEqual([]);
    });
  });

  describe('wrapResponse', () => {
    test('should add debug trace to response', () => {
      tracer.trace('processRequest', { action: 'test' });

      const response = { success: true, data: { id: 123 } };
      const wrappedResponse = tracer.wrapResponse(response);

      expect(wrappedResponse.success).toBe(true);
      expect(wrappedResponse.data).toEqual({ id: 123 });
      expect(wrappedResponse._debug).toBeDefined();
      expect(wrappedResponse._debug.requestId).toBe(tracer.requestId);
    });

    test('should preserve original response properties', () => {
      const response = {
        status: 200,
        message: 'OK',
        nested: { key: 'value' }
      };

      const wrapped = tracer.wrapResponse(response);

      expect(wrapped.status).toBe(200);
      expect(wrapped.message).toBe('OK');
      expect(wrapped.nested.key).toBe('value');
    });
  });

  describe('static fromRequest', () => {
    test('should create tracer from Express request', () => {
      const req = {
        headers: {
          'x-request-id': 'req-123',
          'content-type': 'application/json'
        }
      };

      const tracer = DebugTracer.fromRequest(req);

      expect(tracer).toBeInstanceOf(DebugTracer);
      expect(tracer.requestId).toBeDefined();
    });

    test('should handle request without headers', () => {
      const req = {};

      const tracer = DebugTracer.fromRequest(req);

      expect(tracer).toBeInstanceOf(DebugTracer);
    });
  });

  describe('_captureStackTrace', () => {
    test('should return array of stack trace lines', () => {
      tracer.trace('testMethod', {});

      const stackTrace = tracer.traces[0].stackTrace;
      expect(Array.isArray(stackTrace)).toBe(true);
      stackTrace.forEach(line => {
        expect(line).toMatch(/^at /);
      });
    });
  });

  describe('integration', () => {
    test('should track multiple operations', () => {
      tracer
        .trace('startOperation', { userId: 'user-123' })
        .trace('fetchData', { query: 'SELECT *' })
        .trace('processData', { count: 100 })
        .trace('saveResult', { success: true });

      const traceData = tracer.getTraceData();
      expect(traceData.traceCount).toBe(4);

      // Verify elapsed times are increasing
      for (let i = 1; i < tracer.traces.length; i++) {
        expect(tracer.traces[i].elapsed).toBeGreaterThanOrEqual(tracer.traces[i-1].elapsed);
      }
    });

    test('should handle error in the middle of operations', () => {
      tracer
        .trace('startOperation', { step: 1 })
        .traceError('failedOperation', new Error('Database error'), { query: 'INSERT' })
        .trace('cleanupOperation', { step: 3 });

      expect(tracer.traces).toHaveLength(3);
      expect(tracer.traces[1].level).toBe('error');
      expect(tracer.traces[2].level).toBe('info');
    });
  });
});

