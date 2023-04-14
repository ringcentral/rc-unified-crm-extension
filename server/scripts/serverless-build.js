const { rm, echo, cp } = require('shelljs');
const { resolve } = require('path');

const projectPath = resolve(__dirname, '..');
const deployPath = resolve(projectPath, 'serverless-deploy')

echo('clean path...');
rm('-rf', `${deployPath}/*.js`);
rm('-rf', `${deployPath}/*.json`);
rm('-rf', `${deployPath}/models`);
rm('-rf', `${deployPath}/node_modules`);
rm('-rf', `${deployPath}/lib`);
rm('-rf', `${deployPath}/core`);
rm('-rf', `${deployPath}/platformModules`);
rm('-rf', `${deployPath}/pipedriveRedirect`);
echo('building...');
cp(`${projectPath}/package.json`, `${deployPath}/package.json`);
cp(`${projectPath}/package-lock.json`, `${deployPath}/package-lock.json`);
cp(`${projectPath}/src/lambda.js`, `${deployPath}/lambda.js`);
cp(`${projectPath}/src/index.js`, `${deployPath}/index.js`);
cp(`${projectPath}/src/server.js`, `${deployPath}/server.js`);
cp(`${projectPath}/src/dbAccessor.js`, `${deployPath}/dbAccessor.js`);
cp('-r', `${projectPath}/src/core`, `${deployPath}/core`);
cp('-r', `${projectPath}/src/lib`, `${deployPath}/lib`);
cp('-r', `${projectPath}/src/platformModules`, `${deployPath}/platformModules`);
cp('-r', `${projectPath}/src/pipedriveRedirect`, `${deployPath}/pipedriveRedirect`);
cp('-r', `${projectPath}/src/models`, `${deployPath}/models`);

echo('build done');
