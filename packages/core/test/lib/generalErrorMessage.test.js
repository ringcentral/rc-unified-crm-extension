const {
  authorizationErrorMessage,
  rateLimitErrorMessage,
} = require('../../lib/generalErrorMessage');
const tsGeneralErrorMessage = require('../../lib/generalErrorMessage.ts');

describe('generalErrorMessage', () => {
  test('keeps TypeScript implementation aligned with compatibility JS entrypoint', () => {
    expect(tsGeneralErrorMessage.rateLimitErrorMessage({ platform: 'Clio' }))
      .toEqual(rateLimitErrorMessage({ platform: 'Clio' }));
    expect(tsGeneralErrorMessage.authorizationErrorMessage({ platform: 'Bullhorn' }))
      .toEqual(authorizationErrorMessage({ platform: 'Bullhorn' }));
  });

  describe('rateLimitErrorMessage', () => {
    test('builds the standard rate limit warning message', () => {
      const result = rateLimitErrorMessage({ platform: 'Clio' });

      expect(result).toEqual({
        message: 'Rate limit exceeded',
        messageType: 'warning',
        details: [
          {
            title: 'Details',
            items: [
              {
                id: '1',
                type: 'text',
                text: 'You have exceeded the maximum number of requests allowed by Clio. Please try again in the next minute. If the problem persists please contact support.',
              },
            ],
          },
        ],
        ttl: 5000,
      });
    });

    test('keeps current interpolation behavior for empty platform input', () => {
      const result = rateLimitErrorMessage({ platform: '' });

      expect(result.details[0].items[0].text).toContain('allowed by .');
      expect(result.ttl).toBe(5000);
    });

    test('keeps current interpolation behavior for missing platform input', () => {
      const result = rateLimitErrorMessage({});

      expect(result.details[0].items[0].text).toContain('allowed by undefined.');
    });
  });

  describe('authorizationErrorMessage', () => {
    test('builds the standard authorization warning message', () => {
      const result = authorizationErrorMessage({ platform: 'Bullhorn' });

      expect(result).toEqual({
        message: 'Authorization error',
        messageType: 'warning',
        details: [
          {
            title: 'Details',
            items: [
              {
                id: '1',
                type: 'text',
                text: "It seems like there's something wrong with your authorization of Bullhorn. Please Logout and then Connect your Bullhorn account within this extension.",
              },
            ],
          },
        ],
        ttl: 5000,
      });
    });

    test('keeps current interpolation behavior for empty platform input', () => {
      const result = authorizationErrorMessage({ platform: '' });

      expect(result.details[0].items[0].text).toContain('authorization of .');
      expect(result.details[0].items[0].text).toContain('Connect your  account');
    });

    test('keeps current interpolation behavior for missing platform input', () => {
      const result = authorizationErrorMessage({});

      expect(result.details[0].items[0].text).toContain('authorization of undefined.');
      expect(result.details[0].items[0].text).toContain('Connect your undefined account');
    });
  });
});

