// @ts-check

const fs = require('fs');
const path = require('path');
const ts = /** @type {any} */ (require('typescript'));

let compilerOptions;

function getProjectRoot() {
    const scriptRoot = path.resolve(__dirname, '..');
    return path.basename(scriptRoot) === '.ts-build' ? path.resolve(scriptRoot, '..') : scriptRoot;
}

function getCompilerOptions() {
    if (compilerOptions) {
        return compilerOptions;
    }

    const rootDir = getProjectRoot();
    const tsconfigPath = path.join(rootDir, 'tsconfig.base.json');
    const rawConfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));
    const parsed = ts.convertCompilerOptionsFromJson(rawConfig.compilerOptions || {}, rootDir);

    compilerOptions = {
        ...parsed.options,
        module: ts.ModuleKind.CommonJS,
        sourceMap: false,
        inlineSourceMap: false,
        inlineSources: false
    };

    return compilerOptions;
}

module.exports = {
    process(sourceText, sourcePath) {
        const output = ts.transpileModule(sourceText, {
            compilerOptions: getCompilerOptions(),
            fileName: sourcePath,
            reportDiagnostics: false
        });

        return { code: output.outputText };
    }
};

export {};
