const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Use npm's JS entrypoint so Windows paths never pass through a shell.
function main() {
    const args = process.argv.slice(2);
    if (args.length && (args.length !== 2 || args[0] !== '--output-dir' || !args[1])) {
        throw new Error('Usage: npm run test:package -- [--output-dir <directory>]');
    }
    const npmCli = process.env.npm_execpath;
    if (!npmCli || !fs.existsSync(npmCli)) {
        throw new Error('Run this check with npm run test:package.');
    }
    const root = path.resolve(__dirname, '..');
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'app-connect-core-package-'));
    const output = args.length ? path.resolve(args[1]) : path.join(temporary, 'verified');
    const verifiedTarball = path.join(output, 'core.tgz');
    if (fs.existsSync(verifiedTarball) || fs.existsSync(path.join(output, 'verification.json'))) {
        throw new Error('Use a fresh output directory; refusing to reuse a verified package.');
    }
    const packed = path.join(temporary, 'packed');
    const consumer = path.join(temporary, 'consumer');
    fs.mkdirSync(packed);
    fs.mkdirSync(consumer);
    const env = { ...process.env };
    // Do not let workspace preloads or module search paths hide missing dependencies.
    delete env.NODE_PATH;
    delete env.NODE_OPTIONS;
    const runNpm = (npmArgs, cwd, timeout) => execFileSync(process.execPath, [npmCli, ...npmArgs], {
        cwd, env, timeout, stdio: 'inherit',
    });

    console.log(`Checking Core in an isolated npm consumer: ${temporary}`);
    runNpm(['pack', '--workspace=@app-connect/core', '--pack-destination', packed, '--loglevel=error'], root, 120_000);
    const archives = fs.readdirSync(packed).filter(name => name.endsWith('.tgz'));
    assert.equal(archives.length, 1, 'npm pack must produce exactly one Core tarball');
    const tarball = path.join(packed, archives[0]);
    const sha256 = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    const packedHash = sha256(tarball);
    fs.writeFileSync(path.join(consumer, 'package.json'), JSON.stringify({
        name: 'app-connect-core-package-consumer', version: '1.0.0', private: true,
        dependencies: { '@app-connect/core': `file:../packed/${archives[0]}` },
    }, null, 2) + '\n');
    fs.copyFileSync(path.join(__dirname, 'fixtures', 'core-package-consumer.cjs'), path.join(consumer, 'smoke.cjs'));
    runNpm(['install', '--omit=dev', '--legacy-peer-deps=false', '--no-audit', '--no-fund'], consumer, 300_000);
    runNpm(['ls', '--omit=dev', '--all'], consumer, 30_000);
    execFileSync(process.execPath, ['smoke.cjs'], { cwd: consumer, env, timeout: 30_000, stdio: 'inherit' });

    const result = JSON.parse(fs.readFileSync(path.join(consumer, 'smoke-result.json'), 'utf8'));
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'packages/core/package.json'), 'utf8'));
    assert.equal(result.name, manifest.name);
    assert.equal(result.version, manifest.version, 'The installed tarball must have the release version');
    assert.equal(sha256(tarball), packedHash, 'The tested tarball must not change during verification');
    // Publish this exact archive, rather than rebuild/re-resolve a different package.
    fs.mkdirSync(output, { recursive: true });
    fs.copyFileSync(tarball, verifiedTarball);
    assert.equal(sha256(verifiedTarball), packedHash);
    fs.writeFileSync(path.join(output, 'verification.json'), JSON.stringify({
        ...result, sha256: packedHash, tarball: verifiedTarball,
    }, null, 2) + '\n');
    console.log(`Core package verification passed: ${verifiedTarball} (sha256 ${packedHash})`);
}

try {
    main();
} catch (error) {
    console.error('Core package verification failed:', error.message);
    process.exitCode = 1;
}
