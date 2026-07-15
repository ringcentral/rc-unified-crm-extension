import fs from 'node:fs';
import path from 'node:path';
import {
  AppointmentCreateRequestSchema,
  AppointmentPatchRequestSchema,
  AppointmentRangeSchema,
  AppointmentStatusRequestSchema,
  httpApiExamplesToValidate,
  httpApiOperationContracts,
  httpApiContractSchemas,
  ReleaseNotesResponseSchema,
} from '../packages/core/contracts';

const specPath = path.resolve(__dirname, '..', 'docs', 'developers', 'crm-server-openapi.json');

describe('typed HTTP API contracts', () => {
  test.each([
    ['create payload cannot be null', AppointmentCreateRequestSchema, { payload: null }],
    ['create payload requires canonical fields', AppointmentCreateRequestSchema, { payload: { title: 'Meeting' } }],
    ['create request rejects arbitrary objects', AppointmentCreateRequestSchema, { arbitrary: true }],
    ['create request rejects ignored status', AppointmentCreateRequestSchema, {
      payload: {
        title: 'Meeting',
        summary: '',
        startTimeUtc: '2026-07-20T19:00:00.000Z',
        durationMinutes: 30,
        status: 'scheduled',
      },
    }],
    ['contact references require a positive numeric identifier', AppointmentCreateRequestSchema, {
      payload: {
        title: 'Meeting',
        summary: '',
        startTimeUtc: '2026-07-20T19:00:00.000Z',
        durationMinutes: 30,
        contacts: ['contact-1'],
      },
    }],
    ['patch wrapper must contain an object', AppointmentPatchRequestSchema, { patch: 'bad' }],
    ['patch cannot be empty', AppointmentPatchRequestSchema, { patch: {} }],
    ['patch rejects connector-specific fields', AppointmentPatchRequestSchema, { patch: { location: 'Zoom' } }],
    ['patch status uses the dedicated endpoint', AppointmentPatchRequestSchema, { patch: { status: 'tentative' } }],
    ['patch time requires duration', AppointmentPatchRequestSchema, { patch: { startTimeUtc: '2026-07-20T19:00:00.000Z' } }],
    ['patch duration requires time', AppointmentPatchRequestSchema, { patch: { durationMinutes: 30 } }],
    ['status must be a non-empty string', AppointmentStatusRequestSchema, { status: 123 }],
    ['range requires both dates', AppointmentRangeSchema, { startDate: '2026-07-01' }],
    ['range start must precede end', AppointmentRangeSchema, { startDate: '2026-08-01', endDate: '2026-07-01' }],
  ])('rejects malformed appointment contract: %s', (_name, schema, value) => {
    expect(schema.safeParse(value).success).toBe(false);
  });

  test.each([
    ['core', path.resolve(__dirname, '..', 'packages', 'core', 'releaseNotes.json')],
    ['connectors', path.resolve(__dirname, '..', 'src', 'releaseNotes.json')],
  ])('%s release-note data satisfies the transport schema', (_name, releaseNotesPath) => {
    const releaseNotes = JSON.parse(fs.readFileSync(releaseNotesPath, 'utf8'));
    expect(ReleaseNotesResponseSchema.safeParse(releaseNotes).success).toBe(true);
  });

  test.each(httpApiExamplesToValidate)('%s example satisfies its transport schema', (_name, schema, example) => {
    const result = schema.safeParse(example);
    expect(result.success ? [] : result.error.issues).toEqual([]);
  });

  test('publishes every registered request and response example', () => {
    const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));

    for (const contract of httpApiOperationContracts) {
      const operation = spec.paths[contract.path][contract.method];

      if (contract.request) {
        const requestBodyName = operation.requestBody.$ref.split('/').at(-1);
        const mediaTypeName = contract.request.mediaType ?? 'application/json';
        const mediaType = spec.components.requestBodies[requestBodyName].content[mediaTypeName];
        expect(mediaType.schema.$ref).toBe(`#/components/schemas/${contract.request.schema}`);
        expect(mediaType.examples).toEqual(contract.request.examples);
      }

      for (const [statusCode, responseContract] of Object.entries(contract.responses)) {
        const mediaTypeName = responseContract.mediaType ?? 'application/json';
        const mediaType = operation.responses[statusCode].content[mediaTypeName];
        expect(mediaType.schema.$ref).toBe(`#/components/schemas/${responseContract.schema}`);
        expect(mediaType.examples).toEqual(responseContract.examples);
      }
    }
  });

  test('publishes the implemented appointment date-range query', () => {
    const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
    const parameters = spec.paths['/appointments'].get.parameters;
    const generatedParameters = parameters.filter((parameter: Record<string, unknown>) => (
      parameter['x-app-connect-generated-contract'] === true
    ));
    const compatibilityParameters = parameters.filter((parameter: Record<string, unknown>) => (
      parameter['x-app-connect-generated-contract'] !== true
    ));

    expect(generatedParameters.map((parameter: { name: string }) => parameter.name)).toEqual([
      'startDate',
      'endDate',
    ]);
    for (const parameter of generatedParameters) {
      expect(parameter.schema).toEqual(expect.objectContaining({ type: 'string', format: 'date' }));
    }
    expect(compatibilityParameters.map((parameter: { name: string }) => parameter.name)).toEqual([
      'range',
      'mineOnly',
      'forceSync',
    ]);
    for (const parameter of compatibilityParameters) {
      expect(parameter).toEqual(expect.objectContaining({ deprecated: true }));
      expect(parameter.description).toContain('Ignored browser-client compatibility');
    }
  });

  test('records ownership for every generated component and operation field', () => {
    const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
    const manifest = spec['x-app-connect-generated-contracts'];

    expect(manifest).toEqual({
      version: 1,
      schemas: Object.keys(httpApiContractSchemas),
      requestBodies: httpApiOperationContracts.flatMap((contract) => (
        contract.request ? [contract.request.component] : []
      )),
      operations: httpApiOperationContracts.map((contract) => ({
        method: contract.method,
        path: contract.path,
        parameters: (contract.parameters ?? []).map((parameter) => `${parameter.in}:${parameter.name}`),
        requestBody: Boolean(contract.request),
        responses: Object.keys(contract.responses),
      })),
    });

    for (const schemaName of manifest.schemas) {
      expect(spec.components.schemas[schemaName]['x-app-connect-generated-contract']).toBe(true);
    }
    for (const requestBodyName of manifest.requestBodies) {
      expect(spec.components.requestBodies[requestBodyName]['x-app-connect-generated-contract']).toBe(true);
    }
    for (const operationContract of httpApiOperationContracts) {
      const operation = spec.paths[operationContract.path][operationContract.method];
      for (const parameterContract of operationContract.parameters ?? []) {
        const parameter = operation.parameters.find((candidate: { in: string; name: string }) => (
          candidate.in === parameterContract.in && candidate.name === parameterContract.name
        ));
        expect(parameter['x-app-connect-generated-contract']).toBe(true);
      }
      if (operationContract.request) {
        expect(operation.requestBody).toEqual({
          $ref: `#/components/requestBodies/${operationContract.request.component}`,
        });
      }
      for (const statusCode of Object.keys(operationContract.responses)) {
        expect(operation.responses[statusCode]['x-app-connect-generated-contract']).toBe(true);
      }
    }
  });

  test('keeps verified connector id and disposition shapes in the published schemas', () => {
    const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
    const schemas = spec.components.schemas;

    expect(schemas.CallDispositionRequest.properties.dispositions).toEqual(expect.objectContaining({
      type: 'object',
      additionalProperties: true,
    }));
    expect(schemas.ContactInfo.properties.id.anyOf).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'string' }),
      expect.objectContaining({ type: 'number' }),
    ]));
    expect(schemas.CallLogMutationResponse.properties.logId.anyOf).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'string' }),
      expect.objectContaining({ type: 'number' }),
    ]));
    expect(schemas.MessageLogResponse.properties.logIds.items.anyOf).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'string' }),
      expect.objectContaining({ type: 'number' }),
    ]));
  });
});
