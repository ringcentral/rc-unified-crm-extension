/**
 * Custom Jest reporter that prints a summary of failed tests at the end
 * This helps when console output makes it hard to find failures
 */
class FailedTestsReporter {
  constructor(globalConfig, options) {
    this._globalConfig = globalConfig;
    this._options = options;
  }

  onRunComplete(contexts, results) {
    const failedTests = [];

    results.testResults.forEach((testFile) => {
      testFile.testResults.forEach((test) => {
        if (test.status === 'failed') {
          failedTests.push({
            file: testFile.testFilePath,
            testName: test.fullName,
            errors: test.failureMessages,
          });
        }
      });
    });

    if (failedTests.length > 0) {
      console.log('\n');
      console.log('╔════════════════════════════════════════════════════════════════════╗');
      console.log('║                      FAILED TESTS SUMMARY                          ║');
      console.log('╚════════════════════════════════════════════════════════════════════╝');
      console.log('');

      failedTests.forEach((failed, index) => {
        const relativePath = failed.file.replace(process.cwd(), '').replace(/\\/g, '/');
        console.log(`  ${index + 1}. ${failed.testName}`);
        console.log(`     File: ${relativePath}`);
        console.log('');
      });

      console.log(`  Total failed: ${failedTests.length}`);
      console.log('');
    }
  }
}

module.exports = FailedTestsReporter;

