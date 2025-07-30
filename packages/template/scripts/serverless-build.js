const { rm, echo, cp, mkdir } = require('shelljs');
const { resolve } = require('path');
const { exec } = require('child_process');

const projectPath = resolve(__dirname, '..');
const deployPath = resolve(projectPath, 'serverless-deploy')

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

echo('clean path...');
rm('-rf', `${deployPath}/*.js`);
rm('-rf', `${deployPath}/*.json`);
rm('-rf', `${deployPath}/node_modules`);
rm('-rf', `${deployPath}/adapters`);
echo('building...');
mkdir(deployPath)
cp(`${projectPath}/package.json`, `${deployPath}/package.json`);
cp(`${projectPath}/package-lock.json`, `${deployPath}/package-lock.json`);
cp('-r', `${projectPath}/src/*`, `${deployPath}/`);

async function run() {
    const installCmd = 'npm i --production';
    console.log(`run cmd: ${installCmd}`);
    const installRes = await execAsync(installCmd).catch((e) => console.log(e));
    console.log(installRes);
    echo('build done');
}

run();