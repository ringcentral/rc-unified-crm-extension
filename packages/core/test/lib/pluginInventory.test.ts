export {};
const { buildPluginInventory } = require('../../lib/pluginInventory');
const { getHashValue } = require('../../lib/util');

test('installation inventory filters unrelated records and excludes credentials, config and raw IDs', () => {
  const result = buildPluginInventory([
    { rcAccountId: '900', platformName: 'plugin-1', dataKey: 'pluginData', data: { version: '1.0', jwtToken: 'secret', config: { password: 'secret' } } },
    { rcAccountId: '900', platformName: 'crm', dataKey: 'contact-123', data: {} },
  ], 'key', '2026-11-10T00:00:00.000Z');
  expect(result.installations).toEqual([expect.objectContaining({ pluginId: 'plugin-1', pluginVersion: '1.0', rcAccountId: getHashValue('900', 'key') })]);
  expect(JSON.stringify(result)).not.toContain('secret');
  expect(JSON.stringify(result)).not.toContain('900');
  expect(() => buildPluginInventory([], '')).toThrow('HASH_KEY');
});
