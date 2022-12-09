const { exec } = require('child_process');
const { resolve } = require('path');

const deployPath = resolve(__dirname, '../serverless-deploy')

const execAsync = (cmd, options = {
  cwd: deployPath,
}) => {
  return new Promise((resolve, reject) => {
    exec(cmd, options, (code, stdout, stderr) => {
      if (stderr) {
        return reject(stderr);
      }
      resolve(stdout);
    })
  });
}

async function run () {
  console.log('start deploy');
  const installCmd = 'npm i --production';
  console.log(`run cmd: ${installCmd}`);
  const installRes = await execAsync(installCmd).catch((e) => console.log(e));
  console.log(installRes);
  const serverlessDeployCmd = resolve(__dirname, '../node_modules/.bin/sls deploy --force --verbose');
  console.log(`run cmd: ${serverlessDeployCmd}`)
  const serverlessDeployRes = await execAsync(serverlessDeployCmd).catch((e) => console.log(`Error: ${e}`));
  console.log(serverlessDeployRes);
  if (!serverlessDeployRes) {
    return console.log('build fails');
  }
  const reg = /(https:\/\/.+\.amazonaws\.com).+\}/;
  const arr = serverlessDeployRes.match(reg);
  if (!arr || !arr[1]) {
    return console.log('build fails');
  }
  const appUri = `${arr[1]}/prod`;
  console.log(`App run in API gate way: ${appUri}`);
}

run();
