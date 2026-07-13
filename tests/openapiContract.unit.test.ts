const fs = require('fs');
const path = require('path');
const SwaggerParser = require('@apidevtools/swagger-parser');
const ts = require('typescript');

const sourceRoot = path.resolve(__dirname, '..');
const PROJECT_ROOT = path.basename(sourceRoot) === '.ts-build'
    ? path.resolve(sourceRoot, '..')
    : sourceRoot;
const SPEC_PATH = path.join(PROJECT_ROOT, 'docs', 'developers', 'crm-server-openapi.json');
const PUBLIC_SPEC_PATH = path.join(PROJECT_ROOT, 'docs', 'developers', 'crm-server-openapi-public.json');
const PACKAGE_PATH = path.join(PROJECT_ROOT, 'package.json');
const ROUTE_FILES = [
    path.join(PROJECT_ROOT, 'packages', 'core', 'index.ts'),
    path.join(PROJECT_ROOT, 'src', 'index.ts'),
];
const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete']);
const { HIDDEN_TAGS, buildPublicSpec } = require(path.join(
    PROJECT_ROOT,
    'scripts',
    'generate-public-openapi.cjs',
));
const INTENTIONALLY_UNPUBLISHED_DIRECT_PARAMETERS = [
    // The route cannot match without the path id, so the query fallback is unreachable compatibility code.
    'DELETE /calldown/{id} -> query:id',
];

function normalizeExpressPath(routePath: string) {
    return routePath.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

function isDevelopmentOnly(node: any, sourceFile: any) {
    let current = node.parent;
    while (current) {
        if (ts.isIfStatement(current)) {
            const condition = current.expression.getText(sourceFile).replace(/\s+/g, '');
            if (/process\.env\.IS_PROD===['"]false['"]/.test(condition)) {
                return true;
            }
        }
        current = current.parent;
    }
    return false;
}

function collectSourceOperations(filePath: string) {
    const sourceText = fs.readFileSync(filePath, 'utf8');
    const sourceFile = ts.createSourceFile(
        filePath,
        sourceText,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
    );
    const operations: string[] = [];

    function visit(node: any) {
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
            const receiver = node.expression.expression;
            const method = node.expression.name.text.toLowerCase();
            const routePath = node.arguments[0];
            if (
                ts.isIdentifier(receiver)
                && (receiver.text === 'router' || receiver.text === 'app')
                && HTTP_METHODS.has(method)
                && routePath
                && ts.isStringLiteralLike(routePath)
                && !isDevelopmentOnly(node, sourceFile)
            ) {
                operations.push(`${method.toUpperCase()} ${normalizeExpressPath(routePath.text)}`);
            }
        }
        ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return operations;
}

function collectLiteralResponseStatuses(filePath: string) {
    const sourceText = fs.readFileSync(filePath, 'utf8');
    const sourceFile = ts.createSourceFile(
        filePath,
        sourceText,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
    );
    const statusesByOperation = new Map<string, Set<string>>();

    function collectHandlerStatuses(node: any, statuses: Set<string>) {
        if (
            ts.isCallExpression(node)
            && ts.isPropertyAccessExpression(node.expression)
            && ts.isIdentifier(node.expression.expression)
            && node.expression.expression.text === 'res'
            && node.expression.name.text === 'status'
            && node.arguments[0]
            && ts.isNumericLiteral(node.arguments[0])
        ) {
            statuses.add(node.arguments[0].text);
        }
        ts.forEachChild(node, (child: any) => collectHandlerStatuses(child, statuses));
    }

    function visit(node: any) {
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
            const receiver = node.expression.expression;
            const method = node.expression.name.text.toLowerCase();
            const routePath = node.arguments[0];
            if (
                ts.isIdentifier(receiver)
                && (receiver.text === 'router' || receiver.text === 'app')
                && HTTP_METHODS.has(method)
                && routePath
                && ts.isStringLiteralLike(routePath)
                && !isDevelopmentOnly(node, sourceFile)
            ) {
                const operation = `${method.toUpperCase()} ${normalizeExpressPath(routePath.text)}`;
                const statuses = new Set<string>();
                for (const handler of node.arguments.slice(1)) {
                    collectHandlerStatuses(handler, statuses);
                }
                statusesByOperation.set(operation, statuses);
            }
        }
        ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return statusesByOperation;
}

function collectDirectRouteParameters(filePath: string) {
    const sourceText = fs.readFileSync(filePath, 'utf8');
    const sourceFile = ts.createSourceFile(
        filePath,
        sourceText,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
    );
    const parametersByOperation = new Map<string, Set<string>>();

    function isRequestCollection(node: any, collection: 'query' | 'params') {
        return ts.isPropertyAccessExpression(node)
            && ts.isIdentifier(node.expression)
            && node.expression.text === 'req'
            && node.name.text === collection;
    }

    function collectHandlerParameters(node: any, parameters: Set<string>) {
        for (const collection of ['query', 'params'] as const) {
            const location = collection === 'params' ? 'path' : collection;
            if (ts.isPropertyAccessExpression(node) && isRequestCollection(node.expression, collection)) {
                parameters.add(`${location}:${node.name.text}`);
            }
            if (
                ts.isElementAccessExpression(node)
                && isRequestCollection(node.expression, collection)
                && node.argumentExpression
                && ts.isStringLiteralLike(node.argumentExpression)
            ) {
                parameters.add(`${location}:${node.argumentExpression.text}`);
            }
            if (
                ts.isVariableDeclaration(node)
                && ts.isObjectBindingPattern(node.name)
                && node.initializer
                && isRequestCollection(node.initializer, collection)
            ) {
                for (const element of node.name.elements) {
                    const parameterName = element.propertyName || element.name;
                    if (ts.isIdentifier(parameterName) || ts.isStringLiteralLike(parameterName)) {
                        parameters.add(`${location}:${parameterName.text}`);
                    }
                }
            }
        }
        ts.forEachChild(node, (child: any) => collectHandlerParameters(child, parameters));
    }

    function visit(node: any) {
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
            const receiver = node.expression.expression;
            const method = node.expression.name.text.toLowerCase();
            const routePath = node.arguments[0];
            if (
                ts.isIdentifier(receiver)
                && (receiver.text === 'router' || receiver.text === 'app')
                && HTTP_METHODS.has(method)
                && routePath
                && ts.isStringLiteralLike(routePath)
                && !isDevelopmentOnly(node, sourceFile)
            ) {
                const operation = `${method.toUpperCase()} ${normalizeExpressPath(routePath.text)}`;
                const parameters = new Set<string>();
                for (const handler of node.arguments.slice(1)) {
                    collectHandlerParameters(handler, parameters);
                }
                parametersByOperation.set(operation, parameters);
            }
        }
        ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return parametersByOperation;
}

function collectSpecOperations(spec: any) {
    const operations: string[] = [];
    for (const [routePath, pathItem] of Object.entries(spec.paths) as Array<[string, any]>) {
        for (const method of HTTP_METHODS) {
            if (pathItem[method]) {
                operations.push(`${method.toUpperCase()} ${routePath}`);
            }
        }
    }
    return operations;
}

describe('App Connect OpenAPI contract', () => {
    const spec = JSON.parse(fs.readFileSync(SPEC_PATH, 'utf8'));
    const publicSpec = JSON.parse(fs.readFileSync(PUBLIC_SPEC_PATH, 'utf8'));
    const packageJson = JSON.parse(fs.readFileSync(PACKAGE_PATH, 'utf8'));

    test('is a valid OpenAPI document with only local references', async () => {
        await expect(SwaggerParser.validate(SPEC_PATH, {
            resolve: {
                http: false,
            },
        })).resolves.toBeDefined();
    });

    test('matches the server package version', () => {
        expect(spec.info.version).toBe(packageJson.version);
    });

    test('publishes a current OpenAPI subset without non-public tag groups', async () => {
        await expect(SwaggerParser.validate(PUBLIC_SPEC_PATH, {
            resolve: {
                http: false,
            },
        })).resolves.toBeDefined();

        expect(publicSpec).toEqual(buildPublicSpec(spec));
        expect(publicSpec.info.version).toBe(packageJson.version);

        const publishedTags = new Set(publicSpec.tags.map((tag: any) => tag.name));
        for (const hiddenTag of HIDDEN_TAGS) {
            expect(publishedTags.has(hiddenTag)).toBe(false);
        }

        for (const pathItem of Object.values(publicSpec.paths) as any[]) {
            for (const method of HTTP_METHODS) {
                const operation = pathItem[method];
                if (operation) {
                    expect(operation.tags.some((tag: string) => HIDDEN_TAGS.includes(tag))).toBe(false);
                }
            }
        }
        expect(publicSpec.paths['/plugin/licenseStatus/{pluginId}']).toBeUndefined();
        expect(publicSpec.paths['/plugin/{pluginId}']).toBeUndefined();
        expect(Object.keys(publicSpec.components.securitySchemes || {})).not.toEqual(expect.arrayContaining([
            'mcpBearer',
            'widgetSessionToken',
            'filePickerJwt',
            'pipedriveBasicAuth',
        ]));
        expect(collectSpecOperations(publicSpec).length).toBeLessThan(collectSpecOperations(spec).length);
    });

    test('publishes an actionable API-key login contract', () => {
        const operation = spec.paths['/apiKeyLogin'].post;
        const requestBodyName = operation.requestBody.$ref.split('/').pop();
        const requestBody = spec.components.requestBodies[requestBodyName];
        const schemaName = requestBody.content['application/json'].schema.$ref.split('/').pop();
        const schema = spec.components.schemas[schemaName];

        expect(requestBody.required).toBe(true);
        expect(schema.required).toContain('platform');
        expect(schema.properties.apiKey.writeOnly).toBe(true);
        expect(schema.properties.additionalInfo.additionalProperties).toBe(true);
        expect(schema.additionalProperties).toBe(false);
    });

    test('documents every production Express operation exactly once', () => {
        const sourceOperations = ROUTE_FILES.flatMap(collectSourceOperations).sort();
        const specOperations = collectSpecOperations(spec).sort();

        expect(new Set(sourceOperations).size).toBe(sourceOperations.length);
        expect(new Set(specOperations).size).toBe(specOperations.length);
        expect(specOperations).toEqual(sourceOperations);
    });

    test('documents every literal HTTP status returned by route handlers', () => {
        const statusesByOperation = new Map<string, Set<string>>();
        const missingResponses: string[] = [];
        for (const routeFile of ROUTE_FILES) {
            for (const [operation, statuses] of collectLiteralResponseStatuses(routeFile)) {
                statusesByOperation.set(operation, statuses);
            }
        }

        for (const [operation, statuses] of statusesByOperation) {
            const [method, routePath] = operation.split(' ', 2);
            const documentedResponses = spec.paths[routePath][method.toLowerCase()].responses;
            for (const status of statuses) {
                if (!documentedResponses[status]) {
                    missingResponses.push(`${operation} -> ${status}`);
                }
            }
        }

        expect(missingResponses).toEqual([]);
    });

    test('documents query and path parameters read directly by route handlers', () => {
        const parametersByOperation = new Map<string, Set<string>>();
        const missingParameters: string[] = [];
        for (const routeFile of ROUTE_FILES) {
            for (const [operation, parameters] of collectDirectRouteParameters(routeFile)) {
                parametersByOperation.set(operation, parameters);
            }
        }

        for (const [operation, sourceParameters] of parametersByOperation) {
            const [method, routePath] = operation.split(' ', 2);
            const pathItem = spec.paths[routePath];
            const specOperation = pathItem[method.toLowerCase()];
            const documentedParameters = new Set<string>();
            for (const parameter of [...(pathItem.parameters || []), ...(specOperation.parameters || [])]) {
                const resolvedParameter = parameter.$ref
                    ? spec.components.parameters[parameter.$ref.split('/').pop()]
                    : parameter;
                documentedParameters.add(`${resolvedParameter.in}:${resolvedParameter.name}`);
            }

            for (const requirement of specOperation.security || spec.security || []) {
                for (const schemeName of Object.keys(requirement)) {
                    const scheme = spec.components.securitySchemes[schemeName];
                    if (scheme?.type === 'apiKey' && (scheme.in === 'query' || scheme.in === 'path')) {
                        documentedParameters.add(`${scheme.in}:${scheme.name}`);
                    }
                }
            }

            for (const parameter of sourceParameters) {
                if (!documentedParameters.has(parameter)) {
                    missingParameters.push(`${operation} -> ${parameter}`);
                }
            }
        }

        expect(missingParameters.sort()).toEqual(INTENTIONALLY_UNPUBLISHED_DIRECT_PARAMETERS.sort());
    });

    test('provides stable discovery metadata for every operation', () => {
        const operationIds = new Set<string>();
        const declaredTags = new Set(spec.tags.map((tag: any) => tag.name));

        expect(spec.info.contact?.url).toBeTruthy();
        expect(spec.info.license?.name).toBeTruthy();
        expect(spec.externalDocs?.url).toBeTruthy();
        expect(spec.security).toBeDefined();

        for (const tag of spec.tags) {
            expect(tag.description).toEqual(expect.any(String));
            expect(tag.description.length).toBeGreaterThan(0);
        }

        for (const pathItem of Object.values(spec.paths) as any[]) {
            for (const method of HTTP_METHODS) {
                const operation = pathItem[method];
                if (!operation) {
                    continue;
                }

                expect(operation.summary).toEqual(expect.any(String));
                expect(operation.operationId).toEqual(expect.any(String));
                expect(operationIds.has(operation.operationId)).toBe(false);
                operationIds.add(operation.operationId);

                expect(operation.tags.length).toBeGreaterThan(0);
                for (const tag of operation.tags) {
                    expect(declaredTags.has(tag)).toBe(true);
                }

                const responseCodes = Object.keys(operation.responses);
                expect(responseCodes.some((code) => /^[23]\d\d$/.test(code))).toBe(true);
            }
        }
    });
});

export {};
