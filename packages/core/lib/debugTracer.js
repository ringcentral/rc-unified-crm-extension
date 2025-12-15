class DebugTracer {
    /**
     * Creates a new DebugTracer instance
     * @param {Object} headers - Request headers object
     */
    constructor(headers = {}) {
        this.traces = [];
        this.startTime = Date.now();
        this.requestId = this._generateRequestId();
    }

    /**
     * Generates a unique request ID for tracking
     * @returns {string} Unique request ID
     */
    _generateRequestId() {
        return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }

    /**
     * Captures the current stack trace
     * @param {number} skipFrames - Number of frames to skip from the top (default: 2)
     * @returns {string[]} Array of stack trace lines
     */
    _captureStackTrace(skipFrames = 2) {
        const err = new Error();
        const stack = err.stack || '';
        const lines = stack.split('\n').slice(skipFrames);
        return lines.map(line => line.trim()).filter(line => line.startsWith('at '));
    }

    /**
     * Records a trace entry with method name, data, and stack trace
     * @param {string} methodName - Name of the method/function being traced
     * @param {Object} data - Data to record (will be sanitized to remove sensitive info)
     * @param {Object} options - Additional options
     * @param {boolean} options.includeStack - Whether to include stack trace (default: true)
     * @param {string} options.level - Log level: 'info', 'warn', 'error' (default: 'info')
     * @returns {DebugTracer} Returns this for chaining
     */
    trace(methodName, data = {}, options = {}) {
        const { includeStack = true, level = 'info' } = options;
        
        const traceEntry = {
            timestamp: new Date().toISOString(),
            elapsed: Date.now() - this.startTime,
            methodName,
            level,
            data: this._sanitizeData(data)
        };

        if (includeStack) {
            traceEntry.stackTrace = this._captureStackTrace(3);
        }

        this.traces.push(traceEntry);
        return this;
    }

    /**
     * Records an error trace with full stack information
     * @param {string} methodName - Name of the method where error occurred
     * @param {Error|string} error - Error object or message
     * @param {Object} additionalData - Additional context data
     * @returns {DebugTracer} Returns this for chaining
     */
    traceError(methodName, error, additionalData = {}) {
        const errorData = {
            message: error instanceof Error ? error.message : String(error),
            errorStack: error instanceof Error ? error.stack : null,
            ...additionalData
        };

        return this.trace(methodName, errorData, { level: 'error' });
    }

    /**
     * Sanitizes data by removing sensitive fields
     * @param {Object} data - Data to sanitize
     * @returns {Object} Sanitized data
     */
    _sanitizeData(data) {
        if (!data || typeof data !== 'object') {
            return data;
        }

        const sensitiveFields = [
            'accessToken', 'refreshToken', 'apiKey', 'password', 
            'secret', 'token', 'authorization', 'auth', 'key',
            'credential', 'credentials', 'privateKey', 'clientSecret'
        ];

        const sanitized = Array.isArray(data) ? [...data] : { ...data };

        const sanitizeRecursive = (obj) => {
            if (!obj || typeof obj !== 'object') {
                return obj;
            }

            for (const key of Object.keys(obj)) {
                const lowerKey = key.toLowerCase();
                if (sensitiveFields.some(field => lowerKey.includes(field.toLowerCase()))) {
                    // eslint-disable-next-line no-param-reassign
                    obj[key] = '[REDACTED]';
                } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                    // eslint-disable-next-line no-param-reassign
                    obj[key] = sanitizeRecursive(
                        Array.isArray(obj[key]) ? [...obj[key]] : { ...obj[key] }
                    );
                }
            }
            return obj;
        };

        return sanitizeRecursive(sanitized);
    }

    /**
     * Gets the complete trace data for inclusion in response
     * @returns {Object} Trace data object
     */
    getTraceData() {
        return {
            requestId: this.requestId,
            totalDuration: `${Date.now() - this.startTime}ms`,
            traceCount: this.traces.length,
            traces: this.traces
        };
    }

    /**
     * Gets trace data and merges it into a response object
     * @param {Object} response - Original response object
     * @returns {Object} Response with debug trace data appended (if debug mode enabled)
     */
    wrapResponse(response) {
        const traceData = this.getTraceData();
        if (!traceData) {
            return response;
        }

        return {
            ...response,
            _debug: traceData
        };
    }

    /**
     * Static helper to create tracer from Express request
     * @param {Object} req - Express request object
     * @returns {DebugTracer} New tracer instance
     */
    static fromRequest(req) {
        return new DebugTracer(req.headers || {});
    }
}

module.exports = { DebugTracer };

