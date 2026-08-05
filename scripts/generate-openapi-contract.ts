import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import {
  httpApiContractRegistry,
  httpApiContractSchemas,
  httpApiOperationContracts,
  type HttpApiSchemaName,
  type OpenApiExample,
} from '../packages/core/contracts';

const scriptParentDirectory = path.resolve(__dirname, '..');
const rootDirectory = path.basename(scriptParentDirectory) === '.ts-build'
  ? path.resolve(scriptParentDirectory, '..')
  : scriptParentDirectory;
const specPath = path.join(rootDirectory, 'docs', 'developers', 'crm-server-openapi.json');
const checkOnly = process.argv.includes('--check');
const generatedMarker = 'x-app-connect-generated-contract';
const generatedManifestKey = 'x-app-connect-generated-contracts';

type JsonObject = Record<string, any>;

interface GeneratedOperationManifest {
  method: string;
  path: string;
  parameters: string[];
  requestBody: boolean;
  responses: string[];
}

interface GeneratedContractManifest {
  version: 1;
  schemas: string[];
  requestBodies: string[];
  operations: GeneratedOperationManifest[];
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeGeneratedSchema(value: unknown, schemaNames: ReadonlySet<string>): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeGeneratedSchema(item, schemaNames));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }

  const normalized: JsonObject = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === '$schema' || key === 'definitions') {
      continue;
    }
    if (key === '$ref' && typeof child === 'string') {
      const definitionName = child.startsWith('#/definitions/')
        ? child.slice('#/definitions/'.length)
        : child;
      normalized[key] = schemaNames.has(definitionName)
        ? `#/components/schemas/${definitionName}`
        : child;
      continue;
    }
    if (
      key === 'additionalProperties'
      && child
      && typeof child === 'object'
      && !Array.isArray(child)
      && Object.keys(child).length === 0
    ) {
      normalized[key] = true;
      continue;
    }
    normalized[key] = normalizeGeneratedSchema(child, schemaNames);
  }
  return normalized;
}

function generateComponentSchemas(): Record<HttpApiSchemaName, JsonObject> {
  const generated = z.toJSONSchema(httpApiContractRegistry, {
    target: 'openapi-3.0',
    io: 'input',
  }) as { schemas: Record<string, JsonObject> };
  const schemaNames = new Set(Object.keys(httpApiContractSchemas));
  const components = {} as Record<HttpApiSchemaName, JsonObject>;

  for (const schemaName of schemaNames) {
    const schema = generated.schemas[schemaName];
    if (!schema) {
      throw new Error(`Zod did not generate the ${schemaName} schema.`);
    }
    components[schemaName as HttpApiSchemaName] = normalizeGeneratedSchema(
      schema,
      schemaNames,
    ) as JsonObject;
  }
  return components;
}

function buildExamples(examples: Readonly<Record<string, OpenApiExample>>): JsonObject {
  return Object.fromEntries(
    Object.entries(examples).map(([name, example]) => [name, clone(example)]),
  );
}

function parameterKey(parameter: { in: string; name: string }): string {
  return `${parameter.in}:${parameter.name}`;
}

function generateInlineSchema(schema: z.ZodType): JsonObject {
  const generated = z.toJSONSchema(schema, {
    target: 'openapi-3.0',
    io: 'input',
  });
  return normalizeGeneratedSchema(
    generated,
    new Set(Object.keys(httpApiContractSchemas)),
  ) as JsonObject;
}

function readGeneratedManifest(spec: JsonObject): GeneratedContractManifest | undefined {
  const manifest = spec[generatedManifestKey];
  if (!manifest || manifest.version !== 1) {
    return undefined;
  }
  return manifest as GeneratedContractManifest;
}

function removePreviouslyGeneratedContracts(
  spec: JsonObject,
  nextManifest: GeneratedContractManifest,
): void {
  const previousManifest = readGeneratedManifest(spec);

  for (const section of ['schemas', 'requestBodies'] as const) {
    const components = spec.components?.[section];
    if (!components) {
      continue;
    }

    const nextNames = new Set(nextManifest[section]);
    for (const [name, component] of Object.entries(components)) {
      if ((component as JsonObject)?.[generatedMarker] === true && !nextNames.has(name)) {
        delete components[name];
      }
    }

    for (const name of previousManifest?.[section] ?? []) {
      if (!nextNames.has(name)) {
        delete components[name];
      }
    }
  }

  const nextOperations = new Map(
    nextManifest.operations.map((operation) => [
      `${operation.method} ${operation.path}`,
      operation,
    ]),
  );
  for (const generatedOperation of previousManifest?.operations ?? []) {
    const operation = spec.paths?.[generatedOperation.path]?.[generatedOperation.method];
    if (!operation) {
      continue;
    }
    const nextOperation = nextOperations.get(
      `${generatedOperation.method} ${generatedOperation.path}`,
    );
    if (generatedOperation.requestBody && !nextOperation?.requestBody) {
      delete operation.requestBody;
    }
    const nextParameterKeys = new Set(nextOperation?.parameters ?? []);
    if (generatedOperation.parameters?.some((key) => !nextParameterKeys.has(key))) {
      operation.parameters = (operation.parameters ?? []).filter((parameter: JsonObject) => {
        if (parameter?.[generatedMarker] !== true || !parameter.in || !parameter.name) {
          return true;
        }
        return nextParameterKeys.has(parameterKey(parameter as { in: string; name: string }));
      });
      if (operation.parameters.length === 0) {
        delete operation.parameters;
      }
    }
    for (const statusCode of generatedOperation.responses) {
      if (!nextOperation?.responses.includes(statusCode)) {
        delete operation.responses?.[statusCode];
      }
    }
  }

  delete spec[generatedManifestKey];
}

function buildGeneratedManifest(): GeneratedContractManifest {
  return {
    version: 1,
    schemas: Object.keys(httpApiContractSchemas),
    requestBodies: httpApiOperationContracts.flatMap((contract) => (
      contract.request ? [contract.request.component] : []
    )),
    operations: httpApiOperationContracts.map((contract) => ({
      method: contract.method,
      path: contract.path,
      parameters: (contract.parameters ?? []).map(parameterKey),
      requestBody: Boolean(contract.request),
      responses: Object.keys(contract.responses),
    })),
  };
}

function applyContracts(spec: JsonObject): JsonObject {
  const generatedSpec = clone(spec);
  const componentSchemas = generateComponentSchemas();
  const generatedManifest = buildGeneratedManifest();

  removePreviouslyGeneratedContracts(generatedSpec, generatedManifest);

  generatedSpec.components ??= {};
  generatedSpec.components.schemas ??= {};
  generatedSpec.components.requestBodies ??= {};

  for (const [schemaName, schema] of Object.entries(componentSchemas)) {
    generatedSpec.components.schemas[schemaName] = {
      ...schema,
      [generatedMarker]: true,
    };
  }

  for (const operationContract of httpApiOperationContracts) {
    const operation = generatedSpec.paths?.[operationContract.path]?.[operationContract.method];
    if (!operation) {
      throw new Error(
        `OpenAPI operation ${operationContract.method.toUpperCase()} ${operationContract.path} was not found.`,
      );
    }

    if (operationContract.parameters) {
      const generatedParameterKeys = new Set(operationContract.parameters.map(parameterKey));
      const preservedParameters = (operation.parameters ?? []).filter((parameter: JsonObject) => {
        if (parameter?.[generatedMarker] === true) {
          return false;
        }
        if (!parameter?.in || !parameter?.name) {
          return true;
        }
        return !generatedParameterKeys.has(parameterKey(parameter as { in: string; name: string }));
      });
      const generatedParameters = operationContract.parameters.map((parameterContract) => {
        if (parameterContract.example !== undefined) {
          const parsedExample = parameterContract.schema.safeParse(parameterContract.example);
          if (!parsedExample.success) {
            throw new Error(
              `Invalid example for ${operationContract.method.toUpperCase()} ${operationContract.path} `
              + `${parameterContract.in} parameter ${parameterContract.name}: ${parsedExample.error.message}`,
            );
          }
        }
        return {
          [generatedMarker]: true,
          name: parameterContract.name,
          in: parameterContract.in,
          required: parameterContract.required,
          ...(parameterContract.deprecated ? { deprecated: true } : {}),
          description: parameterContract.description,
          schema: generateInlineSchema(parameterContract.schema),
          ...(parameterContract.example !== undefined ? { example: clone(parameterContract.example) } : {}),
        };
      });
      operation.parameters = [...preservedParameters, ...generatedParameters];
    }

    if (operationContract.request) {
      const requestContract = operationContract.request;
      const mediaType = requestContract.mediaType ?? 'application/json';
      generatedSpec.components.requestBodies[requestContract.component] = {
        [generatedMarker]: true,
        required: requestContract.required,
        description: requestContract.description,
        content: {
          [mediaType]: {
            schema: {
              $ref: `#/components/schemas/${requestContract.schema}`,
            },
            examples: buildExamples(requestContract.examples),
          },
        },
      };
      operation.requestBody = {
        $ref: `#/components/requestBodies/${requestContract.component}`,
      };
    }

    for (const [statusCode, responseContract] of Object.entries(operationContract.responses)) {
      const previousResponse = operation.responses?.[statusCode];
      const mediaType = responseContract.mediaType ?? 'application/json';
      const headers = responseContract.includeRefreshedJwtHeader
        ? {
            'X-Refreshed-JWT-Token': {
              $ref: '#/components/headers/RefreshedUserJwt',
            },
          }
        : previousResponse && !previousResponse.$ref
          ? previousResponse.headers
          : undefined;

      operation.responses[statusCode] = {
        [generatedMarker]: true,
        description: responseContract.description,
        ...(headers ? { headers } : {}),
        content: {
          [mediaType]: {
            schema: {
              $ref: `#/components/schemas/${responseContract.schema}`,
            },
            examples: buildExamples(responseContract.examples),
          },
        },
      };
    }
  }

  generatedSpec[generatedManifestKey] = generatedManifest;

  return generatedSpec;
}

const currentSource = fs.readFileSync(specPath, 'utf8');
const currentSpec = JSON.parse(currentSource) as JsonObject;
const generatedSource = `${JSON.stringify(applyContracts(currentSpec), null, 2)}\n`;

if (checkOnly) {
  if (currentSource.replace(/\r\n/g, '\n') !== generatedSource) {
    console.error('The canonical OpenAPI contract is stale. Run npm run generate:openapi.');
    process.exitCode = 1;
  } else {
    console.log('The canonical OpenAPI contract matches the TypeScript transport contracts.');
  }
} else {
  fs.writeFileSync(specPath, generatedSource);
  console.log(`Generated typed OpenAPI schemas and examples in ${path.relative(rootDirectory, specPath)}.`);
}
