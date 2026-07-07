// @ts-check

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const OUT_DIR = path.join(ROOT_DIR, '.ts-build');
const ASSET_EXTENSIONS = new Set(['.css', '.html', '.json', '.png', '.svg', '.yaml', '.yml']);
const SKIP_DIRS = new Set(['node_modules', 'test', 'tests', 'coverage', 'App']);

function shouldSkipDirectory(dirName) {
    return SKIP_DIRS.has(dirName);
}

function copyFile(sourcePath, baseRoot, outputRootName) {
    const relativePath = path.relative(baseRoot, sourcePath);
    const destinationPath = path.join(OUT_DIR, outputRootName, relativePath);
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    fs.copyFileSync(sourcePath, destinationPath);
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

        if (entry.isFile() && ASSET_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
            copyFile(sourcePath, baseRoot, outputRootName);
        }
    }
}

function main() {
    copyAssetsFrom(path.join(ROOT_DIR, 'src'), path.join(ROOT_DIR, 'src'), 'src');
    copyAssetsFrom(path.join(ROOT_DIR, 'packages', 'core'), path.join(ROOT_DIR, 'packages', 'core'), 'packages/core');
}

main();

export {};
