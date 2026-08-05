// @ts-check

const { exec } = require('child_process');
const { basename, resolve } = require('path');

const scriptRoot = resolve(__dirname, '..');
const projectPath = basename(scriptRoot) === '.ts-build' ? resolve(scriptRoot, '..') : scriptRoot;
const deployPath = resolve(projectPath, 'serverless-deploy-test-beta')

const execAsync = (cmd, options = {
  cwd: deployPath,
}) => {
  return new Promise((resolve, reject) => {
    exec(cmd, options, (error, stdout, stderr) => {
      // Always log output so we can see serverless error details
      if (stdout) console.log(`stdout: ${stdout}`);
      if (stderr) console.error(`stderr: ${stderr}`);
      if (error) {
        return reject(error);
      }
      resolve(stdout);
    })
  });
}

async function run () {
  console.log('start deploy');
  const serverlessDeployCmd = resolve(projectPath, 'node_modules/.bin/sls deploy --force --verbose');
  console.log(`run cmd: ${serverlessDeployCmd}`)
  const serverlessDeployRes = await execAsync(serverlessDeployCmd).catch((e) => console.log(e));
  console.log(serverlessDeployRes);
}

run();

export {};
