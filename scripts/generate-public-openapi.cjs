const fs = require('fs');
const path = require('path');

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace']);
const HIDDEN_TAGS = Object.freeze(['MCP', 'Google Integrations', 'Pipedrive']);
const SOURCE_PATH = path.resolve(__dirname, '..', 'docs', 'developers', 'crm-server-openapi.json');
const OUTPUT_PATH = path.resolve(__dirname, '..', 'docs', 'developers', 'crm-server-openapi-public.json');

function collectComponentReferences(value, sourceComponents, usedComponents) {
    if (Array.isArray(value)) {
        for (const item of value) {
            collectComponentReferences(item, sourceComponents, usedComponents);
        }
        return;
    }
    if (!value || typeof value !== 'object') {
        return;
    }

    if (typeof value.$ref === 'string') {
        const match = value.$ref.match(/^#\/components\/([^/]+)\/([^/]+)$/);
        if (match) {
            const [, section, name] = match;
            const usedNames = usedComponents.get(section) || new Set();
            if (!usedNames.has(name)) {
                usedNames.add(name);
                usedComponents.set(section, usedNames);
                collectComponentReferences(sourceComponents?.[section]?.[name], sourceComponents, usedComponents);
            }
        }
    }

    for (const child of Object.values(value)) {
        collectComponentReferences(child, sourceComponents, usedComponents);
    }
}

function collectSecuritySchemeNames(spec) {
    const names = new Set();
    const collect = (security) => {
        for (const requirement of security || []) {
            for (const name of Object.keys(requirement)) {
                names.add(name);
            }
        }
    };

    collect(spec.security);
    for (const pathItem of Object.values(spec.paths || {})) {
        for (const method of HTTP_METHODS) {
            if (pathItem[method]) {
                collect(pathItem[method].security);
            }
        }
    }
    return names;
}

function pruneComponents(spec, sourceComponents) {
    const usedComponents = new Map();
    collectComponentReferences(spec, sourceComponents, usedComponents);

    const usedSecuritySchemes = collectSecuritySchemeNames(spec);
    if (usedSecuritySchemes.size > 0) {
        usedComponents.set('securitySchemes', usedSecuritySchemes);
    }

    const components = {};
    for (const [section, values] of Object.entries(sourceComponents || {})) {
        const usedNames = usedComponents.get(section);
        if (!usedNames || usedNames.size === 0) {
            continue;
        }
        const keptValues = {};
        for (const [name, value] of Object.entries(values)) {
            if (usedNames.has(name)) {
                keptValues[name] = value;
            }
        }
        if (Object.keys(keptValues).length > 0) {
            components[section] = keptValues;
        }
    }
    spec.components = components;
}

function buildPublicSpec(sourceSpec) {
    const publicSpec = JSON.parse(JSON.stringify(sourceSpec));
    const hiddenTags = new Set(HIDDEN_TAGS);

    publicSpec.info.description = `${sourceSpec.info.description}\n\nThis public reference omits internal and application-specific endpoints.`;
    publicSpec.tags = (publicSpec.tags || []).filter((tag) => !hiddenTags.has(tag.name));

    for (const [routePath, pathItem] of Object.entries(publicSpec.paths || {})) {
        for (const method of HTTP_METHODS) {
            const operation = pathItem[method];
            if (operation && (operation.tags || []).some((tag) => hiddenTags.has(tag))) {
                delete pathItem[method];
            }
        }
        if (![...HTTP_METHODS].some((method) => pathItem[method])) {
            delete publicSpec.paths[routePath];
        }
    }

    const sourceComponents = publicSpec.components;
    delete publicSpec.components;
    pruneComponents(publicSpec, sourceComponents);
    return publicSpec;
}

function serialize(spec) {
    return `${JSON.stringify(spec, null, 2)}\n`;
}

function main() {
    const sourceSpec = JSON.parse(fs.readFileSync(SOURCE_PATH, 'utf8'));
    const generated = serialize(buildPublicSpec(sourceSpec));
    if (process.argv.includes('--check')) {
        const current = fs.existsSync(OUTPUT_PATH) ? fs.readFileSync(OUTPUT_PATH, 'utf8') : '';
        if (current !== generated) {
            console.error('Public OpenAPI specification is stale. Run npm run generate:openapi-public.');
            process.exitCode = 1;
        }
        return;
    }
    fs.writeFileSync(OUTPUT_PATH, generated);
}

if (require.main === module) {
    main();
}

module.exports = {
    HIDDEN_TAGS,
    buildPublicSpec,
    serialize,
};
