import type {
    DebugTraceData,
    RequestWithHeaders,
    TraceActionSummary,
    TraceEntry,
    TraceOptions
} from '../types';

class DebugTracer {
    traces: TraceEntry[];
    startTime: number;
    requestId: string;

    constructor(headers: Record<string, unknown> = {}) {
        this.traces = [];
        this.startTime = Date.now();
        this.requestId = this._generateRequestId();
    }

    _generateRequestId(): string {
        return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }

    _captureStackTrace(skipFrames = 2): string[] {
        const err = new Error();
        const stack = err.stack || '';
        const lines = stack.split('\n').slice(skipFrames);
        return lines.map(line => line.trim()).filter(line => line.startsWith('at '));
    }

    trace(methodName: string, data: unknown = {}, options: TraceOptions = {}): DebugTracer {
        const { includeStack = true, level = 'info' } = options;

        const traceEntry: TraceEntry = {
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

    traceError(methodName: string, error: Error | string, additionalData: Record<string, unknown> = {}): DebugTracer {
        const errorData = {
            message: error instanceof Error ? error.message : String(error),
            errorStack: error instanceof Error ? error.stack : null,
            ...additionalData
        };

        return this.trace(methodName, errorData, { level: 'error' });
    }

    _sanitizeData(data: unknown): unknown {
        if (!data || typeof data !== 'object') {
            return data;
        }

        const sensitiveFields = [
            'accessToken', 'refreshToken', 'apiKey', 'password',
            'secret', 'token', 'authorization', 'auth', 'key',
            'credential', 'credentials', 'privateKey', 'clientSecret'
        ];

        const sanitized = Array.isArray(data) ? [...data] : { ...data };

        const sanitizeRecursive = (obj: any): any => {
            if (!obj || typeof obj !== 'object') {
                return obj;
            }

            for (const key of Object.keys(obj)) {
                const lowerKey = key.toLowerCase();
                if (sensitiveFields.some(field => lowerKey.includes(field.toLowerCase()))) {
                    obj[key] = '[REDACTED]';
                } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                    obj[key] = sanitizeRecursive(
                        Array.isArray(obj[key]) ? [...obj[key]] : { ...obj[key] }
                    );
                }
            }
            return obj;
        };

        return sanitizeRecursive(sanitized);
    }

    _buildActionSummary(): TraceActionSummary[] {
        return this.traces.map((t, i) => ({
            index: i + 1,
            timestamp: t.timestamp,
            level: t.level.toUpperCase(),
            method: t.methodName,
            elapsedMs: t.elapsed
        }));
    }

    getTraceData(): DebugTraceData {
        return {
            sum: this._buildActionSummary(),
            requestId: this.requestId,
            totalDuration: `${Date.now() - this.startTime}ms`,
            traceCount: this.traces.length,
            traces: this.traces
        };
    }

    wrapResponse(response: Record<string, unknown>): Record<string, unknown> {
        const traceData = this.getTraceData();
        if (!traceData) {
            return response;
        }

        return {
            ...response,
            _debug: traceData
        };
    }

    static fromRequest(req: RequestWithHeaders): DebugTracer {
        return new DebugTracer(req.headers || {});
    }
}

export {
    DebugTracer
};
