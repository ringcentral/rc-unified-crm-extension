// @ts-check

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const OUT_DIR = path.join(ROOT_DIR, '.ts-build');
const ASSET_EXTENSIONS = new Set(['.css', '.html', '.json', '.png', '.svg', '.yaml', '.yml']);
const SKIP_DIRS = new Set(['node_modules', 'test', 'tests', 'coverage', 'dist', 'App']);

function shouldSkipDirectory(dirName) {
    return SKIP_DIRS.has(dirName);
}

function copyFile(sourcePath, baseRoot, outputRootName) {
    const relativePath = path.relative(baseRoot, sourcePath);
    const destinationPath = path.join(OUT_DIR, outputRootName, relativePath);
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    fs.copyFileSync(sourcePath, destinationPath);
}

function shouldCopyFile(fileName) {
    return ASSET_EXTENSIONS.has(path.extname(fileName).toLowerCase()) || fileName.endsWith('.d.ts');
}

function copyAssetsFrom(currentPath, baseRoot, outputRootName) {
    if (!fs.existsSync(currentPath)) {
        return;
    }

    const entries = fs.readdirSync(currentPath, { withFileTypes: true });
    for (const entry of entries) {
        const sourcePath = path.join(currentPath, entry.name);
        if (entry.isDirectory()) {
            if (!shouldSkipDirectory(entry.name)) {
                copyAssetsFrom(sourcePath, baseRoot, outputRootName);
            }
            continue;
        }

        if (entry.isFile() && shouldCopyFile(entry.name)) {
            copyFile(sourcePath, baseRoot, outputRootName);
        }
    }
}

function copyDirectory(sourceDir, destinationDir) {
    if (!fs.existsSync(sourceDir)) {
        return;
    }

    fs.rmSync(destinationDir, { recursive: true, force: true });
    fs.mkdirSync(destinationDir, { recursive: true });

    const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
    for (const entry of entries) {
        const sourcePath = path.join(sourceDir, entry.name);
        const destinationPath = path.join(destinationDir, entry.name);
        if (entry.isDirectory()) {
            if (!shouldSkipDirectory(entry.name)) {
                copyDirectory(sourcePath, destinationPath);
            }
            continue;
        }

        if (entry.isFile()) {
            fs.copyFileSync(sourcePath, destinationPath);
        }
    }
}

function updateJsonFile(filePath, updater) {
    if (!fs.existsSync(filePath)) {
        return;
    }

    const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    updater(json);
    fs.writeFileSync(filePath, `${JSON.stringify(json, null, 2)}\n`);
}

function cleanStaleGeneratedArtifacts() {
    fs.rmSync(path.join(OUT_DIR, 'packages', 'core', 'dist'), { recursive: true, force: true });
}

function rewriteCompiledCorePackageJson() {
    const packageJsonPath = path.join(OUT_DIR, 'packages', 'core', 'package.json');
    updateJsonFile(packageJsonPath, (packageJson) => {
        packageJson.main = 'index.js';
        packageJson.types = 'types/index.d.ts';
        packageJson.exports = {
            '.': {
                types: './types/index.d.ts',
                require: './index.js',
                default: './index.js'
            },
            './package.json': './package.json',
            './*': {
                types: './*.d.ts',
                require: './*.js',
                default: './*.js'
            }
        };
    });
}

function syncCoreDistPackage() {
    const compiledCoreDir = path.join(OUT_DIR, 'packages', 'core');
    const coreDistDir = path.join(ROOT_DIR, 'packages', 'core', 'dist');
    copyDirectory(compiledCoreDir, coreDistDir);
    updateJsonFile(path.join(coreDistDir, 'package.json'), (packageJson) => {
        packageJson.main = 'index.js';
        packageJson.types = 'types/index.d.ts';
        packageJson.exports = {
            '.': {
                types: './types/index.d.ts',
                require: './index.js',
                default: './index.js'
            },
            './package.json': './package.json',
            './*': {
                types: './*.d.ts',
                require: './*.js',
                default: './*.js'
            }
        };
    });
}

function main() {
    cleanStaleGeneratedArtifacts();
    copyAssetsFrom(path.join(ROOT_DIR, 'src'), path.join(ROOT_DIR, 'src'), 'src');
    copyAssetsFrom(path.join(ROOT_DIR, 'packages', 'core'), path.join(ROOT_DIR, 'packages', 'core'), 'packages/core');
    rewriteCompiledCorePackageJson();
    syncCoreDistPackage();
}

main();

export {};
