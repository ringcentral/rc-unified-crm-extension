const readline = require('readline');

function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

/**
 * Ask a question until the answer passes validation.
 * `validate` returns an error message, or null when the value is acceptable.
 */
function ask(question: string, validate?: (value: string) => string | null, defaultValue = ''): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const suffix = defaultValue ? ` (${defaultValue})` : '';

  return new Promise<string>((resolve) => {
    const next = () => {
      rl.question(`${question}${suffix}: `, (answer) => {
        const value = answer.trim() || defaultValue;
        const error = validate ? validate(value) : null;
        if (error) {
          console.log(`  ${error}\n`);
          next();
          return;
        }
        rl.close();
        resolve(value);
      });
    };
    next();
  });
}

module.exports = { ask, isInteractive };
