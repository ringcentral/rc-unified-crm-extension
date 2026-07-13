#!/usr/bin/env node
// @ts-check
/**
 * Runs root and core package tests, then prints an overall summary.
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

// Parse Jest summary from output (e.g. "Test Suites: 13 passed, 13 total" and "Tests: 616 passed, 616 total")
function parseJestSummary(output) {
    const suitesMatch = output.match(/Test Suites:.*?(\d+) passed.*?(\d+) total/);
    const testsMatch = output.match(/Tests:.*?(\d+) passed.*?(\d+) total/);
    const failedSuitesMatch = output.match(/Test Suites:.*?(\d+) failed/);
    const failedTestsMatch = output.match(/Tests:.*?(\d+) failed/);

    return {
        suitesPassed: suitesMatch ? parseInt(suitesMatch[1], 10) : 0,
        suitesTotal: suitesMatch ? parseInt(suitesMatch[2], 10) : 0,
        suitesFailed: failedSuitesMatch ? parseInt(failedSuitesMatch[1], 10) : 0,
        testsPassed: testsMatch ? parseInt(testsMatch[1], 10) : 0,
        testsTotal: testsMatch ? parseInt(testsMatch[2], 10) : 0,
        testsFailed: failedTestsMatch ? parseInt(failedTestsMatch[1], 10) : 0,
    };
}

function runJest(cwd, npmArgs, jestArgs = [], summaryFilePath = null) {
    return new Promise<any>((resolve, reject) => {
        const env = { ...process.env, NODE_ENV: 'test' };
        const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm';
        const runArgs = [...npmArgs];

        if (jestArgs.length > 0) {
            runArgs.push('--', ...jestArgs);
        }

        const child = spawn(npmExecutable, ['run', ...runArgs], {
            cwd,
            env,
            stdio: 'inherit',
            shell: true,
        });

        child.on('close', (code) => {
            let summary = {
                suitesPassed: 0,
                suitesTotal: 0,
                suitesFailed: 0,
                testsPassed: 0,
                testsTotal: 0,
                testsFailed: 0,
            };

            if (summaryFilePath && fs.existsSync(summaryFilePath)) {
                try {
                    const jestJson = JSON.parse(fs.readFileSync(summaryFilePath, 'utf8'));
                    summary = {
                        suitesPassed: jestJson.numPassedTestSuites || 0,
                        suitesTotal: jestJson.numTotalTestSuites || 0,
                        suitesFailed: jestJson.numFailedTestSuites || 0,
                        testsPassed: jestJson.numPassedTests || 0,
                        testsTotal: jestJson.numTotalTests || 0,
                        testsFailed: jestJson.numFailedTests || 0,
                    };
                } catch (err) {
                    // Fallback to zeroed summary if JSON output cannot be parsed.
                    summary = parseJestSummary('');
                }
            }

            if (summaryFilePath) {
                try {
                    fs.unlinkSync(summaryFilePath);
                } catch (err) {
                    // Ignore temp file cleanup issues.
                }
            }

            resolve({ code, summary });
        });

        child.on('error', reject);
    });
}

async function main() {
    const summaryDir = path.join(ROOT_DIR, '.tmp-test-summaries');
    fs.mkdirSync(summaryDir, { recursive: true });
    const rootSummaryFile = path.join(summaryDir, 'root-jest-summary.json');
    const coreSummaryFile = path.join(summaryDir, 'core-jest-summary.json');

    console.log('\n--- Root tests (server) ---\n');
    const rootResult = await runJest(
        ROOT_DIR,
        ['test:root:raw'],
        ['--json', `--outputFile=${rootSummaryFile}`],
        rootSummaryFile
    );

    console.log('\n--- Core package tests (@app-connect/core) ---\n');
    const coreResult = await runJest(
        ROOT_DIR,
        ['test:raw', '--workspace=@app-connect/core'],
        ['--runInBand', '--forceExit', '--json', `--outputFile=${coreSummaryFile}`],
        coreSummaryFile
    );

    // Overall summary
    const totalSuitesPassed = rootResult.summary.suitesPassed + coreResult.summary.suitesPassed;
    const totalSuitesFailed = rootResult.summary.suitesFailed + coreResult.summary.suitesFailed;
    const totalSuites = rootResult.summary.suitesTotal + coreResult.summary.suitesTotal;
    const totalTestsPassed = rootResult.summary.testsPassed + coreResult.summary.testsPassed;
    const totalTestsFailed = rootResult.summary.testsFailed + coreResult.summary.testsFailed;
    const totalTests = rootResult.summary.testsTotal + coreResult.summary.testsTotal;

    const hasFailed = totalSuitesFailed > 0 || totalTestsFailed > 0;

    const RED = '\x1b[31m';
    const GREEN = '\x1b[32m';
    const BOLD = '\x1b[1m';
    const RESET = '\x1b[0m';

    const statusIcon = hasFailed ? `${RED}${BOLD}FAILED${RESET}` : `${GREEN}${BOLD}PASSED${RESET}`;

    console.log('\n' + '='.repeat(60));
    console.log(`${BOLD}OVERALL TEST SUMMARY${RESET}  ${statusIcon}`);
    console.log('='.repeat(60));

    const rootFailed = rootResult.summary.suitesFailed > 0 || rootResult.summary.testsFailed > 0;
    const coreFailed = coreResult.summary.suitesFailed > 0 || coreResult.summary.testsFailed > 0;

    const rootStatus = rootFailed ? `${RED}${BOLD}[FAILED]${RESET}` : `${GREEN}[OK]${RESET}`;
    const coreStatus = coreFailed ? `${RED}${BOLD}[FAILED]${RESET}` : `${GREEN}[OK]${RESET}`;

    console.log(`Root (server):          ${rootStatus} ${rootResult.summary.suitesPassed} suites, ${rootResult.summary.testsPassed} tests passed` +
        (rootFailed ? `  ${RED}${BOLD}(${rootResult.summary.suitesFailed} suites, ${rootResult.summary.testsFailed} tests FAILED)${RESET}` : ''));
    console.log(`Core (@app-connect/core): ${coreStatus} ${coreResult.summary.suitesPassed} suites, ${coreResult.summary.testsPassed} tests passed` +
        (coreFailed ? `  ${RED}${BOLD}(${coreResult.summary.suitesFailed} suites, ${coreResult.summary.testsFailed} tests FAILED)${RESET}` : ''));

    console.log('-'.repeat(60));
    console.log(`Total:                  ${totalSuitesPassed} suites, ${totalTestsPassed} tests passed`);

    if (hasFailed) {
        console.log('');
        console.log(`${RED}${'='.repeat(60)}${RESET}`);
        console.log(`${RED}${BOLD}  FAILURES: ${totalSuitesFailed} suite(s), ${totalTestsFailed} test(s) failed - see output above${RESET}`);
        console.log(`${RED}${'='.repeat(60)}${RESET}`);
    }

    console.log('='.repeat(60) + '\n');

    const exitCode = rootResult.code !== 0 || coreResult.code !== 0 ? 1 : 0;
    process.exit(exitCode);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});

export {};
