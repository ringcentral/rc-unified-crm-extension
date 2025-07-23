const { rm, echo, cp, mkdir } = require('shelljs');
const { resolve } = require('path');

const projectPath = resolve(__dirname, '..');
const deployPath = resolve(projectPath, 'build')

echo('clean path...');
rm('-rf', `${deployPath}/*.js`);
rm('-rf', `${deployPath}/*.json`);
rm('-rf', `${deployPath}/node_modules`);
rm('-rf', `${deployPath}/packages`);
rm('-rf', `${deployPath}/adapters`);
echo('building...');
mkdir(deployPath)
cp(`${projectPath}/package.json`, `${deployPath}/package.json`);
cp(`${projectPath}/package-lock.json`, `${deployPath}/package-lock.json`);
cp(`${projectPath}/src/index.js`, `${deployPath}/index.js`);
cp(`${projectPath}/src/server.js`, `${deployPath}/server.js`);
cp(`${projectPath}/src/dbAccessor.js`, `${deployPath}/dbAccessor.js`);
mkdir(`${deployPath}/packages`);
cp('-r', `${projectPath}/packages/core`, `${deployPath}/packages/core`);
cp('-r', `${projectPath}/src/adapters`, `${deployPath}/adapters`);

echo(`build done, output in ${deployPath}`);
