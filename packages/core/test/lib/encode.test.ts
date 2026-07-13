const { decoded, encode } = require('../../lib/encode');
const tsEncode = require('../../lib/encode.ts');

describe('encode', () => {
  const originalSecret = process.env.APP_SERVER_SECRET_KEY;

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.APP_SERVER_SECRET_KEY;
    } else {
      process.env.APP_SERVER_SECRET_KEY = originalSecret;
    }
  });

  test('encodes and decodes a string with a 32-character secret', () => {
    process.env.APP_SERVER_SECRET_KEY = '12345678901234567890123456789012';

    const encrypted = encode('sensitive token value');

    expect(encrypted).toMatch(/^[0-9a-f]+$/);
    expect(encrypted).not.toBe('sensitive token value');
    expect(decoded(encrypted)).toBe('sensitive token value');
  });

  test('keeps TypeScript implementation aligned with compatibility JS entrypoint', () => {
    process.env.APP_SERVER_SECRET_KEY = '12345678901234567890123456789012';

    const jsEncrypted = encode('payload');
    const tsEncrypted = tsEncode.encode('payload');

    expect(tsEncrypted).toBe(jsEncrypted);
    expect(tsEncode.decoded(jsEncrypted)).toBe('payload');
    expect(decoded(tsEncrypted)).toBe('payload');
  });

  test('throws a deterministic error when secret is missing', () => {
    delete process.env.APP_SERVER_SECRET_KEY;

    expect(() => encode('data')).toThrow('APP_SERVER_SECRET_KEY is not defined');
    expect(() => decoded('abcd')).toThrow('APP_SERVER_SECRET_KEY is not defined');
  });

  test('pads short secrets with spaces to 32 bytes', () => {
    process.env.APP_SERVER_SECRET_KEY = 'short-secret';
    const encryptedWithShortSecret = encode('payload');

    process.env.APP_SERVER_SECRET_KEY = 'short-secret'.padEnd(32, ' ');
    const encryptedWithPaddedSecret = encode('payload');

    expect(encryptedWithShortSecret).toBe(encryptedWithPaddedSecret);
    expect(decoded(encryptedWithShortSecret)).toBe('payload');
  });

  test('truncates long secrets to 32 bytes', () => {
    process.env.APP_SERVER_SECRET_KEY = '12345678901234567890123456789012-first-suffix';
    const encryptedWithLongSecret = encode('payload');

    process.env.APP_SERVER_SECRET_KEY = '12345678901234567890123456789012-second-suffix';
    const encryptedWithSamePrefix = encode('payload');

    expect(encryptedWithLongSecret).toBe(encryptedWithSamePrefix);
    expect(decoded(encryptedWithLongSecret)).toBe('payload');
  });

  test('TypeScript implementation handles secret normalization branches', () => {
    process.env.APP_SERVER_SECRET_KEY = 'short-secret';
    const shortSecretEncrypted = tsEncode.encode('payload');

    process.env.APP_SERVER_SECRET_KEY = 'short-secret'.padEnd(32, ' ');
    expect(tsEncode.encode('payload')).toBe(shortSecretEncrypted);
    expect(tsEncode.decoded(shortSecretEncrypted)).toBe('payload');

    process.env.APP_SERVER_SECRET_KEY = '12345678901234567890123456789012-first-suffix';
    const longSecretEncrypted = tsEncode.encode('payload');

    process.env.APP_SERVER_SECRET_KEY = '12345678901234567890123456789012-second-suffix';
    expect(tsEncode.encode('payload')).toBe(longSecretEncrypted);
    expect(tsEncode.decoded(longSecretEncrypted)).toBe('payload');

    delete process.env.APP_SERVER_SECRET_KEY;
    expect(() => tsEncode.encode('payload')).toThrow('APP_SERVER_SECRET_KEY is not defined');
  });

  test('throws when encrypted input is not valid hex ciphertext', () => {
    process.env.APP_SERVER_SECRET_KEY = '12345678901234567890123456789012';

    expect(() => decoded('not-valid-ciphertext')).toThrow();
  });
});


export {};
