const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// This file is copied into a new project outside the repository before execution.
// No live database, cloud credentials or provider APIs are needed for a package smoke test.
process.env.NODE_ENV = 'test';
process.env.AC_DATABASE_URL = 'postgres://consumer@127.0.0.1:1/package_smoke';
process.env.DISABLE_SYNC_DB_TABLE = 'true';
process.env.AWS_EC2_METADATA_DISABLED = 'true';

async function main() {
    const entry = fs.realpathSync(require.resolve('@app-connect/core'));
    const modules = fs.realpathSync(path.join(__dirname, 'node_modules'));
    const relative = path.relative(modules, entry);
    assert.ok(!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`),
        'Core must resolve from this consumer installation, not the workspace');
    const core = require('@app-connect/core');
    for (const name of ['createCoreApp', 'createCoreRouter', 'createCoreMiddleware', 'initializeCore']) {
        assert.equal(typeof core[name], 'function', `Missing public export: ${name}`);
    }
    const esm = await import('@app-connect/core');
    assert.equal(esm.default.createCoreApp, core.createCoreApp);
    const app = core.createCoreApp({ skipDatabaseInit: true, skipAnalyticsInit: true });
    app.get('/package-consumer-check', (_req, res) => res.json({ successful: true }));
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => {
        server.once('listening', resolve);
        server.once('error', reject);
    });
    try {
        const base = `http://127.0.0.1:${server.address().port}`;
        const health = await fetch(`${base}/isAlive`, { signal: AbortSignal.timeout(5_000) });
        assert.equal(health.status, 200);
        assert.equal(await health.text(), 'OK');
        const custom = await fetch(`${base}/package-consumer-check`, { signal: AbortSignal.timeout(5_000) });
        assert.equal(custom.status, 200);
        assert.deepEqual(await custom.json(), { successful: true });
        const pluginHttp = require('@app-connect/core/lib/pluginHttp');
        process.env.NODE_ENV = 'production';
        await assert.rejects(pluginHttp.get(`${base}/package-consumer-check`), { code: 'ERR_PLUGIN_NETWORK_POLICY' });
        process.env.NODE_ENV = 'development';
        const pluginResponse = await pluginHttp.get(`${base}/package-consumer-check`);
        assert.deepEqual(pluginResponse.data, { successful: true });
    } finally {
        process.env.NODE_ENV = 'test';
        await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
    const manifest = require('@app-connect/core/package.json');
    fs.writeFileSync(path.join(__dirname, 'smoke-result.json'), JSON.stringify({
        name: manifest.name, version: manifest.version, node: process.version,
        commonjs: true, esm: true, health: true, customRoute: true,
        productionPluginPolicy: true, developmentHttpPlugin: true,
    }, null, 2) + '\n');
    console.log(`Independent Core consumer passed: ${manifest.name}@${manifest.version}`);
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
