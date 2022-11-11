const { rm, echo, cp } = require('shelljs');
const { resolve } = require('path');

const projectPath = resolve(__dirname, '..');
const deployPath = resolve(projectPath, 'serverless-deploy')

echo('clean path...');
rm('-rf', `${deployPath}/*.js`);
rm('-rf', `${deployPath}/*.json`);
rm('-rf', `${deployPath}/adaptiveCardPayloads`);
rm('-rf', `${deployPath}/handlers`);
rm('-rf', `${deployPath}/models`);
rm('-rf', `${deployPath}/node_modules`);
rm('-rf', `${deployPath}/lib`);
echo('building...');
cp('-r', `${projectPath}/src/lambda.js`, `${deployPath}/lambda.js`);
cp('-r', `${projectPath}/src/index.js`, `${deployPath}/index.js`);
cp('-r', `${projectPath}/src/server.js`, `${deployPath}/server.js`);
cp('-r', `${projectPath}/src/dbAccessor.js`, `${deployPath}/dbAccessor.js`);
cp('-r', `${projectPath}/src/taskDueReminder.js`, `${deployPath}/taskDueReminder.js`);
cp('-r', `${projectPath}/src/adaptiveCardPayloads`, `${deployPath}/adaptiveCardPayloads`);
cp('-r', `${projectPath}/src/lib`, `${deployPath}/lib`);
cp('-r', `${projectPath}/src/handlers`, `${deployPath}/handlers`);
cp('-r', `${projectPath}/src/models`, `${deployPath}/models`);
cp(`${projectPath}/package.json`, `${deployPath}/package.json`);
cp(`${projectPath}/package-lock.json`, `${deployPath}/package-lock.json`);

echo('build done');
