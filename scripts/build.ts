// @ts-check

const { rm, echo, cp, mkdir } = /** @type {any} */ (require('shelljs'));
const { basename, resolve } = require('path');

const scriptRoot = resolve(__dirname, '..');
const projectPath = basename(scriptRoot) === '.ts-build' ? resolve(scriptRoot, '..') : scriptRoot;
const buildPath = resolve(projectPath, '.ts-build');
const deployPath = resolve(projectPath, 'build')

echo('clean path...');
rm('-rf', `${deployPath}/*.js`);
rm('-rf', `${deployPath}/*.json`);
rm('-rf', `${deployPath}/node_modules`);
rm('-rf', `${deployPath}/packages`);
rm('-rf', `${deployPath}/connectors`);
echo('building...');
mkdir(deployPath)
cp(`${projectPath}/package.json`, `${deployPath}/package.json`);
cp(`${projectPath}/package-lock.json`, `${deployPath}/package-lock.json`);
cp(`${buildPath}/src/index.js`, `${deployPath}/index.js`);
cp(`${buildPath}/src/server.js`, `${deployPath}/server.js`);
cp(`${buildPath}/src/dbAccessor.js`, `${deployPath}/dbAccessor.js`);
mkdir(`${deployPath}/packages`);
cp('-r', `${buildPath}/packages/core`, `${deployPath}/packages/core`);
rm('-rf', `${deployPath}/packages/core/mcp/ui/node_modules`);
rm('-rf', `${deployPath}/packages/core/mcp/ui/App`);
cp('-r', `${buildPath}/src/connectors`, `${deployPath}/connectors`);

echo(`build done, output in ${deployPath}`);

export {};
