const fs = require('fs');
const os = require('os');
const path = require('path');
const tar = require('tar');
const nock = require('nock');
const { spawnSync } = require('child_process');
const { init } = require('../packages/cli/src/lib/init');

test.each(['default', 'plugin'])('generates a %s project without copying the template development lock', async (template: string) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'appconnect-cli-security-'));
  const templateDir = template === 'default' ? 'template' : 'plugin-template';
  const source = path.join(temp, 'archive', 'rc-unified-crm-extension-main', 'packages', templateDir);
  const destination = path.join(temp, 'generated');
  const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'packages', templateDir, 'package.json'), 'utf8'));
  try {
    fs.mkdirSync(path.join(source, 'src'), { recursive: true });
    fs.writeFileSync(path.join(source, 'package.json'), JSON.stringify(manifest));
    fs.copyFileSync(path.resolve(__dirname, '..', 'packages', templateDir, '.gitignore'), path.join(source, '.gitignore'));
    fs.writeFileSync(path.join(source, 'package-lock.json'), JSON.stringify({ name: 'old-template', version: '1.7.38' }));
    fs.writeFileSync(path.join(source, 'src', 'app.ts'), "connectorRegistry.registerConnector('myCRM', {});\n");
    const archive = path.join(temp, 'fixture.tar.gz');
    await tar.c({ cwd: path.join(temp, 'archive'), gzip: true, file: archive }, ['rc-unified-crm-extension-main']);
    const download = nock('https://github.com')
      .get('/ringcentral/rc-unified-crm-extension/archive/refs/heads/main.tar.gz')
      .replyWithFile(200, archive, { 'Content-Type': 'application/gzip' });
    await init(destination, { template, id: 'vendor.demo', install: false, env: false });
    expect(download.isDone()).toBe(true);
    const generated = JSON.parse(fs.readFileSync(path.join(destination, 'package.json'), 'utf8'));
    expect(generated.name).toBe('generated');
    expect(generated.dependencies).toEqual(manifest.dependencies);
    expect(generated.overrides).toEqual(manifest.overrides);
    expect(fs.existsSync(path.join(destination, 'package-lock.json'))).toBe(false);
    fs.writeFileSync(path.join(destination, 'package-lock.json'), '{}');
    expect(spawnSync('git', ['init', '--quiet', destination]).status).toBe(0);
    expect(spawnSync('git', ['-C', destination, 'check-ignore', '--no-index', '--', 'package-lock.json']).status).toBe(1);
    if (template === 'default') {
      expect(fs.readFileSync(path.join(destination, 'src', 'app.ts'), 'utf8'))
        .toContain("registerConnector('vendor.demo'");
    }
  } finally {
    nock.cleanAll();
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

export {};
