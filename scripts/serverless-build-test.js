const { rm, echo, cp, mkdir } = require('shelljs');
const { resolve } = require('path');
const { exec } = require('child_process');

const projectPath = resolve(__dirname, '..');
const deployPath = resolve(projectPath, 'serverless-deploy-test')

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
rm('-rf', `${deployPath}/models`);
rm('-rf', `${deployPath}/node_modules`);
rm('-rf', `${deployPath}/lib`);
rm('-rf', `${deployPath}/core`);
rm('-rf', `${deployPath}/adapters`);
echo('building...');
mkdir(deployPath)
cp(`${projectPath}/package.json`, `${deployPath}/package.json`);
cp(`${projectPath}/package-lock.json`, `${deployPath}/package-lock.json`);
cp(`${projectPath}/src/lambda.js`, `${deployPath}/lambda.js`);
cp(`${projectPath}/src/index.js`, `${deployPath}/index.js`);
cp(`${projectPath}/src/server.js`, `${deployPath}/server.js`);
cp(`${projectPath}/src/dbAccessor.js`, `${deployPath}/dbAccessor.js`);
cp(`${projectPath}/src/releaseNotes.json`, `${deployPath}/releaseNotes.json`);
cp('-r', `${projectPath}/src/core`, `${deployPath}/core`);
cp('-r', `${projectPath}/src/lib`, `${deployPath}/lib`);
cp('-r', `${projectPath}/src/adapters`, `${deployPath}/adapters`);
cp('-r', `${projectPath}/src/models`, `${deployPath}/models`);

const manifestPath = resolve(projectPath, 'serverless-deploy-test/adapters/manifest.json');
const manifest = require(manifestPath);
manifest.serverUrl = 'https://unified-crm-extension-test.labs.ringcentral.com';
for (var k of Object.keys(manifest.platforms)) {
    if (manifest.platforms[k].serverSideLogging) {
        manifest.platforms[k].serverSideLogging.url = "https://crm-logging-test.labs.ringcentral.com";
    }
}
const fs = require('fs');
fs.writeFile(manifestPath, JSON.stringify(manifest), function writeJSON(err) {
    if (err) return console.log(err);
});

async function run() {
    const installCmd = 'npm i --production';
    console.log(`run cmd: ${installCmd}`);
    const installRes = await execAsync(installCmd).catch((e) => console.log(e));
    console.log(installRes);
    echo('build done');
}

run();

