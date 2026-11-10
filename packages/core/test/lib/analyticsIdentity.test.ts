import { getRawAnalyticsProperties, normalizeRawId } from '../../lib/analyticsIdentity';
import { getHashValue } from '../../lib/util';

describe('raw analytics identity', () => {
  const env = { ...process.env };
  beforeEach(() => { process.env.HASH_KEY = 'identity-test'; delete process.env.MIXPANEL_RAW_IDS_ENABLED; });
  afterEach(() => { process.env = { ...env }; });
  const identity = () => ({
    accountId: getHashValue('101', 'identity-test'),
    extensionId: getHashValue('202', 'identity-test'),
    rcAccountIdRaw: 101,
    rcExtensionIdRaw: '202'
  });

  test('normalizes raw IDs without losing numeric precision', () => {
    expect(normalizeRawId('9007199254740993')).toBe('9007199254740993');
    for (const value of [Number.MAX_SAFE_INTEGER + 1, {}, [], '', 'undefined', 'null', 'a'.repeat(64), ' 123', 0]) {
      expect(normalizeRawId(value)).toBeUndefined();
    }
  });
  test('only accepts raw values that match the legacy identities', () => {
    expect(getRawAnalyticsProperties(identity())).toEqual({ rcAccountIdRaw: '101', rcExtensionIdRaw: '202', analyticsIdentityStatus: 'complete' });
    expect(getRawAnalyticsProperties({ ...identity(), rcExtensionIdRaw: '303' })).toEqual({ analyticsIdentityStatus: 'mismatch' });
    expect(getRawAnalyticsProperties({ ...identity(), rcAccountIdRaw: ['101'] })).toEqual({ analyticsIdentityStatus: 'invalid' });
  });
  test('keeps legacy clients and the disable switch supported', () => {
    expect(getRawAnalyticsProperties({})).toEqual({ analyticsIdentityStatus: 'missing' });
    expect(getRawAnalyticsProperties({ ...identity(), rcExtensionIdRaw: undefined })).toEqual({ rcAccountIdRaw: '101', analyticsIdentityStatus: 'partial' });
    process.env.MIXPANEL_RAW_IDS_ENABLED = 'false';
    expect(getRawAnalyticsProperties(identity())).toEqual({ analyticsIdentityStatus: 'disabled' });
  });
});
