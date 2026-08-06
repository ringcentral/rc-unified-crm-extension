const { createPerMinuteRateLimiter } = require('../src/perMinuteRateLimiter');

describe('createPerMinuteRateLimiter', () => {
  test('spaces concurrent reservations evenly across a minute', async () => {
    const waits = [];
    const limiter = createPerMinuteRateLimiter(60, {
      now: () => 10_000,
      wait: async (ms) => {
        waits.push(ms);
      }
    });

    await Promise.all([limiter(), limiter(), limiter()]);

    expect(waits).toEqual([1000, 2000]);
  });

  test.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid rate %s',
    (ratePerMinute) => {
      expect(() => createPerMinuteRateLimiter(ratePerMinute)).toThrow(
        'ratePerMinute must be a positive number'
      );
    }
  );
});

export {};
