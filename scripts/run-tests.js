#!/usr/bin/env node
/**
 * Runs root and core package tests, then prints an overall summary.
 */

const { spawn } = require('child_process');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
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

function runJest(cwd, npmArgs) {
    return new Promise((resolve, reject) => {
        const env = { ...process.env, NODE_ENV: 'test' };

        const child = spawn('npm', ['run', ...npmArgs], {
            cwd,
            env,
            stdio: ['inherit', 'pipe', 'pipe'],
            shell: true, // Required on Windows to find npm
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => {
            const str = data.toString();
            stdout += str;
            process.stdout.write(str);
        });

        child.stderr.on('data', (data) => {
            const str = data.toString();
            stderr += str;
            process.stderr.write(str);
        });

        child.on('close', (code) => {
            const summary = parseJestSummary(stdout + stderr);
            resolve({ code, summary });
        });

        child.on('error', reject);
    });
}

async function main() {
    console.log('\n--- Root tests (server) ---\n');
    const rootResult = await runJest(ROOT_DIR, ['test:root']);

    console.log('\n--- Core package tests (@app-connect/core) ---\n');
    const coreResult = await runJest(ROOT_DIR, ['test', '--workspace=@app-connect/core']);

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

    const statusIcon = hasFailed ? `${RED}${BOLD}✖ FAILED${RESET}` : `${GREEN}${BOLD}✔ PASSED${RESET}`;

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
        console.log(`${RED}${'█'.repeat(60)}${RESET}`);
        console.log(`${RED}${BOLD}  ✖  FAILURES: ${totalSuitesFailed} suite(s), ${totalTestsFailed} test(s) failed — see output above${RESET}`);
        console.log(`${RED}${'█'.repeat(60)}${RESET}`);
    }

    console.log('='.repeat(60) + '\n');

    const exitCode = rootResult.code !== 0 || coreResult.code !== 0 ? 1 : 0;
    process.exit(exitCode);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
