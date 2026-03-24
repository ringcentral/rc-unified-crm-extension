---
name: testing
description: Use this skill when writing, running, or debugging tests for the RingCentral App Connect project. Covers Jest configuration, test patterns, mocking strategies, and test utilities.
---

# Testing Guide

## Test Structure

```
rc-unified-crm-extension/
├── packages/core/test/           # Core package unit tests
│   ├── handlers/                 # Handler tests
│   ├── lib/                      # Library tests
│   └── models/                   # Model tests
├── tests/                        # Root-level integration tests
│   ├── connectors/               # Connector-specific tests
│   ├── fixtures/                 # Test fixtures
│   └── *.test.js                 # Integration test files
└── jest.config.js                # Root Jest config
```

## Running Tests

```bash
# Run all tests
npm test

# Run only root tests
npm run test:root

# Run only core package tests
npm run test --workspace=@app-connect/core

# Run with coverage
npm run test-coverage

# Run specific test file
npx jest path/to/test.js

# Run in watch mode
npx jest --watch
```

## Jest Configuration

Root `jest.config.js`:
```javascript
module.exports = {
    testEnvironment: 'node',
    testMatch: ['**/tests/**/*.test.js'],
    forceExit: true,
    // ...
};
```

Core package `packages/core/jest.config.js`:
```javascript
module.exports = {
    testEnvironment: 'node',
    testMatch: ['**/test/**/*.test.js'],
    // ...
};
```

## Test Patterns

### Unit Test Example

```javascript
const { describe, it, expect, beforeEach, afterEach, jest } = require('@jest/globals');

describe('FunctionName', () => {
    beforeEach(() => {
        // Setup
    });

    afterEach(() => {
        jest.resetAllMocks();
    });

    it('should do something when condition', () => {
        // Arrange
        const input = { ... };
        
        // Act
        const result = functionUnderTest(input);
        
        // Assert
        expect(result).toEqual(expected);
    });

    it('should handle error case', () => {
        expect(() => functionUnderTest(badInput)).toThrow('Expected error');
    });
});
```

### Mocking with Nock (HTTP requests)

```javascript
const nock = require('nock');

describe('API integration', () => {
    afterEach(() => {
        nock.cleanAll();
    });

    it('should fetch data from API', async () => {
        // Mock the API
        nock('https://api.example.com')
            .get('/endpoint')
            .reply(200, { data: 'response' });

        const result = await fetchData();
        expect(result.data).toBe('response');
    });

    it('should handle API errors', async () => {
        nock('https://api.example.com')
            .get('/endpoint')
            .reply(500, { error: 'Server error' });

        await expect(fetchData()).rejects.toThrow();
    });
});
```

### Mocking Modules

```javascript
// Mock entire module
jest.mock('@app-connect/core/lib/logger', () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
}));

// Mock specific functions
jest.mock('@app-connect/core/models/userModel', () => ({
    UserModel: {
        findByPk: jest.fn()
    }
}));

// Usage in test
const { UserModel } = require('@app-connect/core/models/userModel');
UserModel.findByPk.mockResolvedValue({ id: '123', name: 'Test' });
```

### Testing Handlers

```javascript
const supertest = require('supertest');
const { createCoreApp } = require('@app-connect/core');

describe('Contact Handler', () => {
    let app;
    
    beforeAll(() => {
        app = createCoreApp({ skipDatabaseInit: true });
    });

    it('should find contact by phone', async () => {
        const response = await supertest(app)
            .get('/contact')
            .query({ phoneNumber: '+1234567890' })
            .set('Authorization', 'Bearer token');
        
        expect(response.status).toBe(200);
        expect(response.body.matchedContactInfo).toBeDefined();
    });
});
```

### Testing Connectors

```javascript
const nock = require('nock');
const connector = require('../../src/connectors/pipedrive');

describe('Pipedrive Connector', () => {
    const mockUser = {
        id: '123-pipedrive',
        hostname: 'company.pipedrive.com',
        accessToken: 'mock-token'
    };

    afterEach(() => {
        nock.cleanAll();
    });

    describe('findContact', () => {
        it('should find contacts by phone number', async () => {
            nock('https://company.pipedrive.com')
                .get('/api/v2/persons/search')
                .query({ term: '1234567890', fields: 'phone' })
                .reply(200, {
                    data: {
                        items: [{ item: { id: 1, name: 'Test Contact' } }]
                    }
                });

            const result = await connector.findContact({
                user: mockUser,
                authHeader: 'Bearer mock-token',
                phoneNumber: '+1234567890'
            });

            expect(result.successful).toBe(true);
            expect(result.matchedContactInfo).toHaveLength(2); // 1 contact + create new option
        });
    });
});
```

## Test Utilities

### Setup File (tests/setup.js)

```javascript
// Set test environment
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'sqlite::memory:';

// Global test utilities
global.createMockUser = (overrides = {}) => ({
    id: 'test-user-id',
    accessToken: 'mock-access-token',
    refreshToken: 'mock-refresh-token',
    hostname: 'test.crm.com',
    ...overrides
});
```

### Fixtures (tests/fixtures/)

```javascript
// tests/fixtures/callLog.js
module.exports = {
    basicCallLog: {
        sessionId: 'session-123',
        startTime: Date.now(),
        duration: 120,
        direction: 'Inbound',
        from: { phoneNumber: '+1234567890' },
        to: { phoneNumber: '+0987654321' }
    }
};
```

## Coverage

Run coverage report:
```bash
npm run test-coverage
```

Coverage output in `coverage/` directory:
- `lcov-report/index.html` - HTML report
- `coverage-final.json` - JSON data
- `lcov.info` - LCOV format

## Best Practices

1. **Isolate tests** - Each test should be independent
2. **Mock external APIs** - Use nock for HTTP mocking
3. **Clean up** - Always clean mocks in `afterEach`
4. **Descriptive names** - `it('should return 404 when contact not found')`
5. **Test edge cases** - Empty arrays, null values, error states
6. **Avoid testing implementation** - Test behavior, not internals

