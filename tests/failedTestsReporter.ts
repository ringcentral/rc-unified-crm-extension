type JestAssertionResult = {
  status: string;
  fullName: string;
  failureMessages: string[];
};

type JestTestFileResult = {
  testFilePath: string;
  testResults: JestAssertionResult[];
};

type JestAggregatedResult = {
  testResults: JestTestFileResult[];
};

class FailedTestsReporter {
  private readonly globalConfig: unknown;
  private readonly options: unknown;

  constructor(globalConfig: unknown, options: unknown) {
    this.globalConfig = globalConfig;
    this.options = options;
  }

  onRunComplete(_contexts: unknown, results: JestAggregatedResult) {
    const failedTests: Array<{
      file: string;
      testName: string;
      errors: string[];
    }> = [];

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

    if (failedTests.length === 0) {
      return;
    }

    console.log('\n');
    console.log('======================================================================');
    console.log('                         FAILED TESTS SUMMARY                         ');
    console.log('======================================================================');
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

module.exports = FailedTestsReporter;

export {};
