// @ts-check

const { rm, echo, cp, mkdir } = /** @type {any} */ (require('shelljs'));
const { basename, resolve } = require('path');
const { exec } = require('child_process');

const scriptRoot = resolve(__dirname, '..');
const projectPath = basename(scriptRoot) === '.ts-build' ? resolve(scriptRoot, '..') : scriptRoot;
const buildPath = resolve(projectPath, '.ts-build');
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
rm('-rf', `${deployPath}/packages`);
rm('-rf', `${deployPath}/node_modules`);
rm('-rf', `${deployPath}/connectors`);
rm('-rf', `${deployPath}/plugins`);
echo('building...');
mkdir(deployPath)
cp(`${projectPath}/package.json`, `${deployPath}/package.json`);
cp(`${projectPath}/package-lock.json`, `${deployPath}/package-lock.json`);
cp(`${buildPath}/src/lambda.js`, `${deployPath}/lambda.js`);
cp(`${buildPath}/src/index.js`, `${deployPath}/index.js`);
cp(`${buildPath}/src/server.js`, `${deployPath}/server.js`);
cp(`${buildPath}/src/dbAccessor.js`, `${deployPath}/dbAccessor.js`);
cp(`${buildPath}/src/releaseNotes.json`, `${deployPath}/releaseNotes.json`);
mkdir(`${deployPath}/packages`);
cp('-r', `${buildPath}/packages/core`, `${deployPath}/packages/core`);
rm('-rf', `${deployPath}/packages/core/mcp/ui/node_modules`);
rm('-rf', `${deployPath}/packages/core/mcp/ui/App`);
cp('-r', `${buildPath}/src/connectors`, `${deployPath}/connectors`);
cp('-r', `${buildPath}/src/plugins`, `${deployPath}/plugins`);
async function run() {
    const installCmd = 'npm i --production';
    console.log(`run cmd: ${installCmd}`);
    const installRes = await execAsync(installCmd).catch((e) => console.log(e));
    console.log(installRes);
    echo('build done');
}

run();

export {};
