// @ts-check

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const ts = /** @type {any} */ (require('typescript'));

let compilerOptions;
const HOISTED_JEST_METHODS = new Set([
    'mock',
    'unmock',
    'enableAutomock',
    'disableAutomock',
    'deepUnmock'
]);

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

function isStringLiteralStatement(statement) {
    return ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression);
}

function isHoistableJestStatement(statement) {
    if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression)) {
        return false;
    }

    const callExpression = statement.expression;
    const callee = callExpression.expression;
    return ts.isPropertyAccessExpression(callee)
        && ts.isIdentifier(callee.expression)
        && callee.expression.text === 'jest'
        && HOISTED_JEST_METHODS.has(callee.name.text);
}

function hoistJestStatements(sourceText, sourcePath) {
    const sourceFile = ts.createSourceFile(
        sourcePath,
        sourceText,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS
    );

    const directives = [];
    const hoisted = [];
    const rest = [];
    let inDirectivePrologue = true;

    for (const statement of sourceFile.statements) {
        if (inDirectivePrologue && isStringLiteralStatement(statement)) {
            directives.push(statement);
            continue;
        }

        inDirectivePrologue = false;

        if (isHoistableJestStatement(statement)) {
            hoisted.push(statement);
        } else {
            rest.push(statement);
        }
    }

    if (hoisted.length === 0) {
        return sourceText;
    }

    const updatedSourceFile = ts.factory.updateSourceFile(sourceFile, [
        ...directives,
        ...hoisted,
        ...rest
    ]);

    return ts.createPrinter().printFile(updatedSourceFile);
}

module.exports = {
    getCacheKey(sourceText, sourcePath, transformOptions) {
        const transformerSource = fs.readFileSync(__filename, 'utf8');
        return crypto
            .createHash('sha1')
            .update(sourceText)
            .update(sourcePath)
            .update(transformerSource)
            .update(ts.version)
            .update(JSON.stringify(transformOptions.config || {}))
            .digest('hex');
    },

    process(sourceText, sourcePath) {
        const output = ts.transpileModule(hoistJestStatements(sourceText, sourcePath), {
            compilerOptions: getCompilerOptions(),
            fileName: sourcePath,
            reportDiagnostics: false
        });

        return { code: output.outputText };
    }
};

export {};
