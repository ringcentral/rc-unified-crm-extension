jest.mock('node-fetch');

const fetch = require('node-fetch');
const { RingCentral, isRefreshTokenValid, isAccessTokenValid } = require('../../lib/ringcentral');

describe('ringcentral', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('isRefreshTokenValid', () => {
    test('should return true if refresh token is not expired', () => {
      const token = {
        refresh_token_expire_time: Date.now() + 60000 // 1 minute in future
      };

      expect(isRefreshTokenValid(token)).toBe(true);
    });

    test('should return false if refresh token is expired', () => {
      const token = {
        refresh_token_expire_time: Date.now() - 1000 // 1 second ago
      };

      expect(isRefreshTokenValid(token)).toBe(false);
    });

    test('should respect custom handicap', () => {
      const token = {
        refresh_token_expire_time: Date.now() + 5000 // 5 seconds in future
      };

      // With 10s handicap, should be invalid
      expect(isRefreshTokenValid(token, 10000)).toBe(false);

      // With 1s handicap, should be valid
      expect(isRefreshTokenValid(token, 1000)).toBe(true);
    });
  });

  describe('isAccessTokenValid', () => {
    test('should return true if access token is not expired', () => {
      const token = {
        expire_time: Date.now() + 120000 // 2 minutes in future
      };

      expect(isAccessTokenValid(token)).toBe(true);
    });

    test('should return false if access token is expired', () => {
      const token = {
        expire_time: Date.now() - 1000
      };

      expect(isAccessTokenValid(token)).toBe(false);
    });

    test('should respect default 1 minute handicap', () => {
      const token = {
        expire_time: Date.now() + 30000 // 30 seconds in future
      };

      // With default 1 minute handicap, should be invalid
      expect(isAccessTokenValid(token)).toBe(false);
    });
  });

  describe('RingCentral class', () => {
    let rc;
    const options = {
      server: 'https://platform.ringcentral.com',
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      redirectUri: 'https://app.example.com/callback'
    };

    beforeEach(() => {
      rc = new RingCentral(options);
    });

    describe('loginUrl', () => {
      test('should generate login URL with required parameters', () => {
        const url = rc.loginUrl({});

        expect(url).toContain('https://platform.ringcentral.com/restapi/oauth/authorize');
        expect(url).toContain('response_type=code');
        expect(url).toContain(`client_id=${options.clientId}`);
        expect(url).toContain(`redirect_uri=${encodeURIComponent(options.redirectUri)}`);
      });

      test('should include state parameter when provided', () => {
        const url = rc.loginUrl({ state: 'custom-state-123' });

        expect(url).toContain('state=custom-state-123');
      });
    });

    describe('generateToken', () => {
      test('should generate token successfully', async () => {
        const mockResponse = {
          status: 200,
          json: jest.fn().mockResolvedValue({
            access_token: 'new-access-token',
            refresh_token: 'new-refresh-token',
            token_type: 'bearer',
            expires_in: 3600,
            refresh_token_expires_in: 604800,
            scope: 'ReadAccounts',
            endpoint_id: 'endpoint-123'
          })
        };
        fetch.mockResolvedValue(mockResponse);

        const result = await rc.generateToken({ code: 'auth-code-123' });

        expect(fetch).toHaveBeenCalledWith(
          'https://platform.ringcentral.com/restapi/oauth/token',
          expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({
              'Content-Type': 'application/x-www-form-urlencoded'
            })
          })
        );
        expect(result.access_token).toBe('new-access-token');
        expect(result.refresh_token).toBe('new-refresh-token');
        expect(result.expire_time).toBeDefined();
        expect(result.refresh_token_expire_time).toBeDefined();
        // These should not be included
        expect(result.scope).toBeUndefined();
        expect(result.endpoint_id).toBeUndefined();
      });

      test('should throw error on failed token generation', async () => {
        const mockResponse = { status: 401 };
        fetch.mockResolvedValue(mockResponse);

        await expect(rc.generateToken({ code: 'invalid-code' }))
          .rejects.toThrow('Generate Token error');
      });
    });

    describe('refreshToken', () => {
      test('should refresh token successfully', async () => {
        const existingToken = {
          refresh_token: 'old-refresh-token',
          expires_in: 3600,
          refresh_token_expires_in: 604800
        };

        const mockResponse = {
          status: 200,
          json: jest.fn().mockResolvedValue({
            access_token: 'refreshed-access-token',
            refresh_token: 'new-refresh-token',
            token_type: 'bearer',
            expires_in: 3600,
            refresh_token_expires_in: 604800,
            scope: 'ReadAccounts',
            endpoint_id: 'endpoint-456'
          })
        };
        fetch.mockResolvedValue(mockResponse);

        const result = await rc.refreshToken(existingToken);

        expect(result.access_token).toBe('refreshed-access-token');
        expect(result.refresh_token).toBe('new-refresh-token');
        expect(result.expire_time).toBeDefined();
      });

      test('should throw error on failed refresh', async () => {
        const mockResponse = { status: 401 };
        fetch.mockResolvedValue(mockResponse);

        await expect(rc.refreshToken({ refresh_token: 'expired' }))
          .rejects.toThrow('Refresh Token error');
      });
    });

    describe('revokeToken', () => {
      test('should revoke token successfully', async () => {
        const mockResponse = { status: 200 };
        fetch.mockResolvedValue(mockResponse);

        await expect(rc.revokeToken({ access_token: 'token-to-revoke' }))
          .resolves.not.toThrow();

        expect(fetch).toHaveBeenCalledWith(
          'https://platform.ringcentral.com/restapi/oauth/revoke',
          expect.objectContaining({ method: 'POST' })
        );
      });

      test('should throw error on failed revocation', async () => {
        const mockResponse = { status: 500 };
        fetch.mockResolvedValue(mockResponse);

        await expect(rc.revokeToken({ access_token: 'token' }))
          .rejects.toThrow('Revoke Token error');
      });
    });

    describe('request', () => {
      const token = {
        token_type: 'bearer',
        access_token: 'test-access-token'
      };

      test('should make authenticated request', async () => {
        const mockResponse = {
          status: 200,
          json: jest.fn().mockResolvedValue({ data: 'test' })
        };
        fetch.mockResolvedValue(mockResponse);

        const response = await rc.request({
          path: '/restapi/v1.0/account/~',
          method: 'GET'
        }, token);

        expect(fetch).toHaveBeenCalledWith(
          'https://platform.ringcentral.com/restapi/v1.0/account/~',
          expect.objectContaining({
            method: 'GET',
            headers: expect.objectContaining({
              'Authorization': 'bearer test-access-token'
            })
          })
        );
        expect(response).toBe(mockResponse);
      });

      test('should include query parameters', async () => {
        const mockResponse = { status: 200 };
        fetch.mockResolvedValue(mockResponse);

        await rc.request({
          path: '/restapi/v1.0/extension/~/call-log',
          method: 'GET',
          query: { dateFrom: '2024-01-01', dateTo: '2024-01-31' }
        }, token);

        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('dateFrom=2024-01-01'),
          expect.any(Object)
        );
      });

      test('should include JSON body', async () => {
        const mockResponse = { status: 200 };
        fetch.mockResolvedValue(mockResponse);

        await rc.request({
          path: '/restapi/v1.0/subscription',
          method: 'POST',
          body: { eventFilters: ['/restapi/v1.0/account/~/extension/~/presence'] }
        }, token);

        expect(fetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining('eventFilters')
          })
        );
      });

      test('should throw error on failed request', async () => {
        const mockResponse = {
          status: 401,
          text: jest.fn().mockResolvedValue('Unauthorized')
        };
        fetch.mockResolvedValue(mockResponse);

        await expect(rc.request({ path: '/test', method: 'GET' }, token))
          .rejects.toThrow('Unauthorized');
      });

      test('should use custom server if provided', async () => {
        const mockResponse = { status: 200 };
        fetch.mockResolvedValue(mockResponse);

        await rc.request({
          server: 'https://custom-server.com',
          path: '/api/test',
          method: 'GET'
        }, token);

        expect(fetch).toHaveBeenCalledWith(
          'https://custom-server.com/api/test',
          expect.any(Object)
        );
      });
    });

    describe('createSubscription', () => {
      const token = { token_type: 'bearer', access_token: 'token' };

      test('should create webhook subscription', async () => {
        const mockResponse = {
          status: 200,
          json: jest.fn().mockResolvedValue({
            id: 'sub-123',
            expirationTime: '2024-01-20T00:00:00Z',
            uri: 'https://platform.ringcentral.com/subscription/sub-123',
            creationTime: '2024-01-13T00:00:00Z',
            deliveryMode: { transportType: 'WebHook' },
            status: 'Active'
          })
        };
        fetch.mockResolvedValue(mockResponse);

        const result = await rc.createSubscription({
          eventFilters: ['/restapi/v1.0/account/~/extension/~/presence'],
          webhookUri: 'https://app.example.com/webhook'
        }, token);

        expect(result.id).toBe('sub-123');
        // These should not be included in result
        expect(result.uri).toBeUndefined();
        expect(result.creationTime).toBeUndefined();
      });
    });

    describe('getExtensionInfo', () => {
      const token = { token_type: 'bearer', access_token: 'token' };

      test('should get extension info', async () => {
        const extensionInfo = {
          id: 12345,
          name: 'John Doe',
          extensionNumber: '101'
        };
        const mockResponse = {
          status: 200,
          json: jest.fn().mockResolvedValue(extensionInfo)
        };
        fetch.mockResolvedValue(mockResponse);

        const result = await rc.getExtensionInfo('~', token);

        expect(result).toEqual(extensionInfo);
      });
    });

    describe('getAccountInfo', () => {
      const token = { token_type: 'bearer', access_token: 'token' };

      test('should get account info', async () => {
        const accountInfo = {
          id: 'account-123',
          mainNumber: '+1234567890'
        };
        const mockResponse = {
          status: 200,
          json: jest.fn().mockResolvedValue(accountInfo)
        };
        fetch.mockResolvedValue(mockResponse);

        const result = await rc.getAccountInfo(token);

        expect(result).toEqual(accountInfo);
      });
    });

    describe('getCallsAggregationData', () => {
      const token = { token_type: 'bearer', access_token: 'token' };

      test('should get calls aggregation data', async () => {
        const aggregationData = {
          records: [{ callsCount: 100, duration: 36000 }]
        };
        const mockResponse = {
          status: 200,
          json: jest.fn().mockResolvedValue(aggregationData)
        };
        fetch.mockResolvedValue(mockResponse);

        const result = await rc.getCallsAggregationData({
          token,
          timezone: 'America/New_York',
          timeFrom: '2024-01-01',
          timeTo: '2024-01-31',
          groupBy: 'Users'
        });

        expect(result).toEqual(aggregationData);
        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('/analytics/calls/v1/accounts/~/aggregation/fetch'),
          expect.objectContaining({ method: 'POST' })
        );
      });
    });

    describe('getCallLogData', () => {
      const token = { token_type: 'bearer', access_token: 'token' };

      test('should get call log data with pagination', async () => {
        const page1 = {
          records: [{ id: 'call-1' }, { id: 'call-2' }],
          navigation: { nextPage: { uri: 'next-page' } }
        };
        const page2 = {
          records: [{ id: 'call-3' }],
          navigation: {}
        };

        fetch
          .mockResolvedValueOnce({ status: 200, json: () => Promise.resolve(page1) })
          .mockResolvedValueOnce({ status: 200, json: () => Promise.resolve(page2) });

        const result = await rc.getCallLogData({
          token,
          timezone: 'UTC',
          timeFrom: '2024-01-01',
          timeTo: '2024-01-31'
        });

        expect(result.records).toHaveLength(3);
        expect(fetch).toHaveBeenCalledTimes(2);
      });

      test('should handle single page of results', async () => {
        const response = {
          records: [{ id: 'call-1' }],
          navigation: {}
        };
        fetch.mockResolvedValue({ status: 200, json: () => Promise.resolve(response) });

        const result = await rc.getCallLogData({
          extensionId: '12345',
          token,
          timezone: 'UTC',
          timeFrom: '2024-01-01',
          timeTo: '2024-01-31'
        });

        expect(result.records).toHaveLength(1);
        expect(fetch).toHaveBeenCalledTimes(1);
      });
    });

    describe('getSMSData', () => {
      const token = { token_type: 'bearer', access_token: 'token' };

      test('should get SMS data with pagination', async () => {
        const page1 = {
          records: [{ id: 'sms-1' }],
          navigation: { nextPage: { uri: 'next' } }
        };
        const page2 = {
          records: [{ id: 'sms-2' }],
          navigation: {}
        };

        fetch
          .mockResolvedValueOnce({ status: 200, json: () => Promise.resolve(page1) })
          .mockResolvedValueOnce({ status: 200, json: () => Promise.resolve(page2) });

        const result = await rc.getSMSData({
          token,
          timezone: 'UTC',
          timeFrom: '2024-01-01',
          timeTo: '2024-01-31'
        });

        expect(result.records).toHaveLength(2);
      });
    });
  });
});

