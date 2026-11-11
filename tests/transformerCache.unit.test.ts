const { getCacheKey } = require('../.ts-build/scripts/jestTsTransformer.js');

test('uses a full SHA-256 cache key while retaining all compilation inputs', () => {
  const options = { config: { mode: 'test' } };
  const key = getCacheKey('const value = 1;', '/source.ts', options);
  expect(key).toMatch(/^[0-9a-f]{64}$/);
  expect(getCacheKey('const value = 1;', '/source.ts', options)).toBe(key);
  expect(getCacheKey('const value = 2;', '/source.ts', options)).not.toBe(key);
  expect(getCacheKey('const value = 1;', '/other.ts', options)).not.toBe(key);
  expect(getCacheKey('const value = 1;', '/source.ts', { config: { mode: 'other' } })).not.toBe(key);
});

export {};
