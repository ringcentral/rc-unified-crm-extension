const { rm, echo, cp, mkdir } = require('shelljs');
const { resolve } = require('path');
const { exec } = require('child_process');
const { existsSync } = require('fs');

const projectPath = resolve(__dirname, '..', '..');
const deployPath = resolve(projectPath, 'serverless-deploy');
const compiledSourcePath = resolve(projectPath, 'dist', 'src');

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
rm('-rf', `${deployPath}/connectors`);
echo('building...');
mkdir(deployPath);
cp(`${projectPath}/package.json`, `${deployPath}/package.json`);
const lockPath = resolve(projectPath, 'package-lock.json');
if (existsSync(lockPath)) {
    cp(lockPath, `${deployPath}/package-lock.json`);
}
cp('-r', `${compiledSourcePath}/*`, `${deployPath}/`);

async function run() {
    const installCmd = 'npm i --production';
    console.log(`run cmd: ${installCmd}`);
    const installRes = await execAsync(installCmd);
    console.log(installRes);
    echo('build done');
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
