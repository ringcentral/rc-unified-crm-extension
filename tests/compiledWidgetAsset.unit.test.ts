const fs = require('fs');
const path = require('path');

test('ships the reviewed widget build in both compiled Core distributions', () => {
  const root = path.resolve(__dirname, '..');
  const source = fs.readFileSync(path.join(root, 'packages/core/mcp/ui/dist/index.html'));
  for (const output of ['.ts-build/packages/core', 'packages/core/dist']) {
    const asset = fs.readFileSync(path.join(root, output, 'mcp/ui/dist/index.html'));
    expect(asset.equals(source)).toBe(true);
    expect(asset.toString('utf8')).not.toMatch(/src=["'][^"']*App\/root\.tsx/);
  }
});

export {};
