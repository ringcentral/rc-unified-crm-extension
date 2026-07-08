#!/usr/bin/env node
// @ts-check
/**
 * Runs root and core coverage, then prints both coverage summaries at the end.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function getProjectRoot() {
    const scriptRoot = path.resolve(__dirname, '..');
    return path.basename(scriptRoot) === '.ts-build' ? path.resolve(scriptRoot, '..') : scriptRoot;
}

const ROOT_DIR = getProjectRoot();
const CORE_DIR = path.join(ROOT_DIR, 'packages/core');

const ROOT_SUMMARY_PATH = path.join(ROOT_DIR, 'coverage', 'coverage-summary.json');
const CORE_SUMMARY_PATH = path.join(CORE_DIR, 'coverage', 'coverage-summary.json');

function runCommand(label, args) {
    return new Promise<number>((resolve, reject) => {
        const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm';
        const env = { ...process.env, NODE_ENV: 'test' };

        console.log(`\n--- ${label} ---\n`);
        const child = spawn(npmExecutable, args, {
            cwd: ROOT_DIR,
            env,
            stdio: 'inherit',
            shell: true,
        });

        child.on('close', (code) => resolve(code ?? 1));
        child.on('error', reject);
    });
}

function readCoverageSummary(summaryPath) {
    if (!fs.existsSync(summaryPath)) {
        return null;
    }
    const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
    return summary.total || null;
}

function formatPct(metric) {
    if (!metric || typeof metric.pct !== 'number') {
        return 'n/a';
    }
    return `${metric.pct.toFixed(2)}%`;
}

function printCoverageRow(label, summary) {
    if (!summary) {
        console.log(`${label.padEnd(26)} coverage summary unavailable`);
        return;
    }
    console.log(
        `${label.padEnd(26)} ` +
        `Statements ${formatPct(summary.statements).padStart(8)}  ` +
        `Branches ${formatPct(summary.branches).padStart(8)}  ` +
        `Functions ${formatPct(summary.functions).padStart(8)}  ` +
        `Lines ${formatPct(summary.lines).padStart(8)}`
    );
}

function printFinalCoverageSummary({ rootSummary, coreSummary }) {
    console.log('\n' + '='.repeat(92));
    console.log('FINAL COVERAGE SUMMARY');
    console.log('='.repeat(92));
    printCoverageRow('Application (root/server)', rootSummary);
    printCoverageRow('Core (@app-connect/core)', coreSummary);
    console.log('='.repeat(92) + '\n');
}

async function main() {
    const rootCode = await runCommand('Application coverage (root/server)', [
        'run',
        'test:root:raw',
        '--',
        '--coverage',
        '--runInBand',
        '--coverageReporters=text',
        '--coverageReporters=lcov',
        '--coverageReporters=clover',
        '--coverageReporters=json-summary',
        '--collectCoverageFrom=src/**/*.ts',
    ]);
    const rootSummary = readCoverageSummary(ROOT_SUMMARY_PATH);

    let coreCode = 0;
    let coreSummary = null;
    if (rootCode === 0) {
        coreCode = await runCommand('Core coverage (@app-connect/core)', [
            'run',
            'test:raw',
            '--workspace=@app-connect/core',
            '--',
            '--coverage',
            '--coverageReporters=text',
            '--coverageReporters=lcov',
            '--coverageReporters=html',
            '--coverageReporters=json-summary',
        ]);
        coreSummary = readCoverageSummary(CORE_SUMMARY_PATH);
    }

    printFinalCoverageSummary({ rootSummary, coreSummary });
    process.exitCode = rootCode !== 0 || coreCode !== 0 ? 1 : 0;
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});

export {};
