const { exec } = require('child_process');
const { resolve } = require('path');

const deployPath = resolve(__dirname, '../serverless-deploy')

const execAsync = (cmd, options = {
  cwd: deployPath,
}) => {
  return new Promise((resolve, reject) => {
    exec(cmd, options, (error, stdout, stderr) => {
      if (error) {
        return reject(error);
      }
      console.log(`stdout: ${stdout}`);
      console.error(`stderr: ${stderr}`);
      resolve(stdout);
    })
  });
}

async function run () {
  console.log('start deploy');
  const serverlessDeployCmd = resolve(__dirname, '../node_modules/.bin/sls deploy --force --verbose');
  console.log(`run cmd: ${serverlessDeployCmd}`)
  const serverlessDeployRes = await execAsync(serverlessDeployCmd).catch((e) => console.log(e));
  console.log(serverlessDeployRes);
}

run();
