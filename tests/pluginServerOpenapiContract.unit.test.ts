const fs = require('fs');
const path = require('path');
const SwaggerParser = require('@apidevtools/swagger-parser');
const ts = require('typescript');

const sourceRoot = path.resolve(__dirname, '..');
const PROJECT_ROOT = path.basename(sourceRoot) === '.ts-build'
  ? path.resolve(sourceRoot, '..')
  : sourceRoot;
const PLUGIN_SPEC_PATH = path.join(
  PROJECT_ROOT,
  'docs',
  'developers',
  'plugin-server-openapi.json',
);
const APP_CONNECT_PUBLIC_SPEC_PATH = path.join(
  PROJECT_ROOT,
  'docs',
  'developers',
  'crm-server-openapi-public.json',
);
const PLUGIN_TEMPLATE_APP_PATH = path.join(
  PROJECT_ROOT,
  'packages',
  'plugin-template',
  'src',
  'app.ts',
);
const PACKAGE_PATH = path.join(PROJECT_ROOT, 'package.json');
const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete']);

function collectExpressOperations(filePath: string): string[] {
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
        && receiver.text === 'app'
        && HTTP_METHODS.has(method)
        && routePath
        && ts.isStringLiteralLike(routePath)
      ) {
        operations.push(`${method.toUpperCase()} ${routePath.text}`);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return operations;
}

function collectPathOperations(spec: any): Array<{ key: string; operation: any }> {
  const operations: Array<{ key: string; operation: any }> = [];
  for (const [routePath, pathItem] of Object.entries(spec.paths) as Array<[string, any]>) {
    for (const method of HTTP_METHODS) {
      if (pathItem[method]) {
        operations.push({
          key: `${method.toUpperCase()} ${routePath}`,
          operation: pathItem[method],
        });
      }
    }
  }
  return operations;
}

function collectCallbackOperations(spec: any): Array<{ key: string; operation: any }> {
  const operations: Array<{ key: string; operation: any }> = [];
  for (const [callbackName, callback] of Object.entries(spec.components.callbacks) as Array<[string, any]>) {
    for (const [expression, pathItem] of Object.entries(callback) as Array<[string, any]>) {
      for (const method of HTTP_METHODS) {
        if (pathItem[method]) {
          operations.push({
            key: `${callbackName} ${method.toUpperCase()} ${expression}`,
            operation: pathItem[method],
          });
        }
      }
    }
  }
  return operations;
}

describe('App Connect plugin-server OpenAPI contract', () => {
  const spec = JSON.parse(fs.readFileSync(PLUGIN_SPEC_PATH, 'utf8'));
  const appConnectPublicSpec = JSON.parse(fs.readFileSync(APP_CONNECT_PUBLIC_SPEC_PATH, 'utf8'));
  const packageJson = JSON.parse(fs.readFileSync(PACKAGE_PATH, 'utf8'));

  test('is a valid standalone OpenAPI 3.0 document', async () => {
    await expect(SwaggerParser.validate(PLUGIN_SPEC_PATH, {
      resolve: {
        http: false,
      },
    })).resolves.toBeDefined();

    expect(spec.openapi).toBe('3.0.3');
    expect(spec.info.version).toBe(packageJson.version);
  });

  test('publishes stable discovery metadata for paths and callbacks', () => {
    const declaredTags = new Set(spec.tags.map((tag: any) => tag.name));
    const operationIds = new Set<string>();
    const operations = [
      ...collectPathOperations(spec),
      ...collectCallbackOperations(spec),
    ];

    expect(spec.info.contact?.url).toBeTruthy();
    expect(spec.info.license?.name).toBeTruthy();
    expect(spec.externalDocs?.url).toBeTruthy();

    for (const tag of spec.tags) {
      expect(tag.description).toEqual(expect.any(String));
      expect(tag.description.length).toBeGreaterThan(0);
    }

    for (const schema of Object.values(spec.components.schemas) as any[]) {
      expect(schema.description).toEqual(expect.any(String));
      expect(schema.description.length).toBeGreaterThan(0);
      for (const property of Object.values(schema.properties || {}) as any[]) {
        if (!property.$ref && !property.allOf) {
          expect(property.description).toEqual(expect.any(String));
          expect(property.description.length).toBeGreaterThan(0);
        }
      }
    }

    for (const section of ['parameters', 'requestBodies', 'securitySchemes', 'headers']) {
      for (const component of Object.values(spec.components[section] || {}) as any[]) {
        expect(component.description).toEqual(expect.any(String));
        expect(component.description.length).toBeGreaterThan(0);
      }
    }

    for (const { key, operation } of operations) {
      expect(operation.summary).toEqual(expect.any(String));
      expect(operation.description).toEqual(expect.any(String));
      expect(operation.operationId).toEqual(expect.any(String));
      expect(operationIds.has(operation.operationId)).toBe(false);
      operationIds.add(operation.operationId);

      expect(operation.tags.length).toBeGreaterThan(0);
      for (const tag of operation.tags) {
        expect(declaredTags.has(tag)).toBe(true);
      }

      expect(operation.security).toBeDefined();
      expect(Object.keys(operation.responses).some((code) => /^[23]\d\d$/.test(code))).toBe(true);
      expect(key).toEqual(expect.any(String));
    }
  });

  test('covers every route supplied by the JavaScript plugin template', () => {
    const templateOperations = collectExpressOperations(PLUGIN_TEMPLATE_APP_PATH).sort();
    const documentedOperations = new Set(
      collectPathOperations(spec).map(({ key }) => key),
    );

    expect(templateOperations).toEqual([
      'GET /authUrl',
      'GET /checkAuth',
      'GET /isAlive',
      'GET /license',
      'POST /admin/register',
      'POST /logout',
      'POST /plugin/async',
      'POST /plugin/sync',
      'POST /token/sync',
    ]);
    expect(templateOperations.filter((operation) => !documentedOperations.has(operation))).toEqual([]);
  });

  test('maps conventional paths to the manifest-selected endpoint sources', () => {
    const endpointSources = new Map([
      ['POST /admin/register', 'userRegisterEndpointUrl'],
      ['POST /token/sync', 'tokenSyncUrl'],
      ['POST /plugin/sync', 'endpointUrl'],
      ['POST /plugin/async', 'endpointUrl'],
      ['GET /license', 'licenseStatusUrl'],
      ['GET /authUrl', 'authorizationUrl'],
      ['GET /checkAuth', 'authStateUrl'],
      ['POST /logout', 'logoutUrl'],
      ['GET /oauth/callback', 'state.redirectTo'],
    ]);

    for (const [key, endpointSource] of endpointSources) {
      const [method, routePath] = key.split(' ', 2);
      const operation = spec.paths[routePath]?.[method.toLowerCase()];

      expect(operation).toBeDefined();
      expect(operation['x-app-connect-endpoint-source']).toBe(endpointSource);
    }
  });

  test('documents the current account registration and plugin bearer boundary', () => {
    const registrationOperation = spec.paths['/admin/register'].post;
    const registrationBodyName = registrationOperation.requestBody.$ref.split('/').at(-1);
    const registrationSchemaName = spec.components.requestBodies[registrationBodyName]
      .content['application/json'].schema.$ref.split('/').at(-1);
    const registrationSchema = spec.components.schemas[registrationSchemaName];

    expect(registrationSchema.required).toEqual(['rcAccessToken', 'rcAccountId']);
    expect(registrationSchema.properties.rcAccessToken).toEqual(expect.objectContaining({
      format: 'password',
      writeOnly: true,
    }));

    for (const [routePath, method] of [
      ['/token/sync', 'post'],
      ['/plugin/sync', 'post'],
      ['/plugin/async', 'post'],
      ['/license', 'get'],
    ]) {
      expect(spec.paths[routePath][method].security).toEqual([{ pluginBearer: [] }]);
      expect(spec.paths[routePath][method].responses['401']).toBeDefined();
      expect(spec.paths[routePath][method].responses['403']).toBeDefined();
    }

    expect(spec.paths['/token/sync'].post.responses['200'].headers['X-Refreshed-JWT-Token'])
      .toEqual({ $ref: '#/components/headers/RefreshedPluginJwt' });
    expect(spec.paths['/plugin/sync'].post.responses['200'].headers['X-Refreshed-JWT-Token'])
      .toEqual({ $ref: '#/components/headers/RefreshedPluginJwt' });
  });

  test('keeps logging data extensible while defining the stable invocation envelopes', () => {
    expect(spec.components.schemas.LoggingPayload).toEqual(expect.objectContaining({
      type: 'object',
      additionalProperties: true,
    }));
    expect(spec.components.schemas.PluginConfig).toEqual(expect.objectContaining({
      type: 'object',
      nullable: true,
      additionalProperties: true,
    }));
    expect(spec.components.schemas.PluginInvocationRequest.required).toEqual(['data']);
    expect(spec.components.schemas.AsyncCallbackInvocationRequest.required).toEqual([
      'data',
      'asyncTaskId',
      'callbackUrl',
    ]);
    expect(spec.components.schemas.AsyncFireAndForgetInvocationRequest.required).toEqual(['data']);
    expect(spec.paths['/plugin/async'].post.callbacks.asyncPluginCompletion).toEqual({
      $ref: '#/components/callbacks/AsyncPluginCompletion',
    });

    const asyncExamples = spec.components.requestBodies.AsyncPluginInvocation
      .content['application/json'].examples;
    expect(Object.keys(asyncExamples)).toEqual([
      'callWithCallback',
      'callUpdateWithCallback',
      'smsFireAndForget',
    ]);
  });

  test('shares the App Connect async callback request and response shapes', () => {
    expect(spec.components.schemas.AsyncPluginCallbackRequest).toEqual(
      appConnectPublicSpec.components.schemas.AsyncPluginCallbackRequest,
    );
    expect(spec.components.schemas.AsyncPluginCallbackResponse).toEqual(
      appConnectPublicSpec.components.schemas.AsyncPluginCallbackResponse,
    );

    const callbackOperation = spec.components.callbacks.AsyncPluginCompletion
      ['{$request.body#/callbackUrl}'].post;
    expect(callbackOperation.requestBody.content['application/json'].schema).toEqual({
      $ref: '#/components/schemas/AsyncPluginCallbackRequest',
    });
    for (const statusCode of ['200', '400', '404', '500']) {
      expect(callbackOperation.responses[statusCode].content['application/json'].schema).toEqual({
        $ref: '#/components/schemas/AsyncPluginCallbackResponse',
      });
    }
  });

  test('keeps browser OAuth examples and shared return messages compatible', () => {
    const authUrl = spec.paths['/authUrl'].get.responses['200']
      .content['application/json'].example.authUrl;
    const state = JSON.parse(new URL(authUrl).searchParams.get('state') ?? '{}');

    expect(state).toEqual(expect.objectContaining({
      from: 'plugin',
      redirectTo: 'https://plugins.example.com/oauth/callback',
    }));
    expect(spec.paths['/oauth/callback'].get.responses['200'].content).toBeUndefined();

    const {
      ['x-app-connect-generated-contract']: _generatedMarker,
      ...appConnectReturnMessage
    } = appConnectPublicSpec.components.schemas.ReturnMessage;
    expect(spec.components.schemas.ReturnMessage).toEqual(appConnectReturnMessage);
  });
});

export {};
