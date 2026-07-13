const { isManifestValid } = require('../../../mcp/lib/validator');

describe('MCP manifest validator', () => {
  test('rejects missing manifest structure and unknown connector platforms', () => {
    expect(isManifestValid({
      connectorManifest: null,
      connectorName: 'testCRM',
    })).toEqual({
      isValid: false,
      errors: ['connectorManifest is required'],
    });

    expect(isManifestValid({
      connectorManifest: {},
      connectorName: 'testCRM',
    })).toEqual({
      isValid: false,
      errors: ['connectorManifest.platforms is required'],
    });

    expect(isManifestValid({
      connectorManifest: { platforms: { otherCRM: {} } },
      connectorName: 'testCRM',
    })).toEqual({
      isValid: false,
      errors: ['Platform "testCRM" not found in manifest'],
    });
  });

  test('reports missing and malformed auth, environment, and optional array fields', () => {
    const result = isManifestValid({
      connectorName: 'testCRM',
      connectorManifest: {
        platforms: {
          testCRM: {
            auth: {
              type: 'oauth',
              oauth: {},
            },
            environment: {
              type: 'selectable',
              selections: [],
            },
            settings: {},
            contactTypes: 'Contact',
            override: {},
          },
        },
      },
    });

    expect(result.isValid).toBe(false);
    expect(result.errors).toEqual([
      'platform.auth.oauth.authUrl is required',
      'platform.auth.oauth.clientId is required',
      'platform.environment.selections is required for selectable environment type',
      'platform.name is required',
      'platform.settings must be an array if specified',
      'platform.contactTypes must be an array if specified',
      'platform.override must be an array if specified',
    ]);
  });

  test('validates oauth, apiKey, and unsupported auth configurations', () => {
    expect(isManifestValid({
      connectorName: 'oauthCRM',
      connectorManifest: {
        platforms: {
          oauthCRM: {
            name: 'OAuth CRM',
            auth: {
              type: 'oauth',
              oauth: {
                authUrl: 'https://crm.example.com/oauth',
                clientId: 'client-id',
              },
            },
            environment: {
              type: 'selectable',
              selections: [{ label: 'Production', value: 'prod' }],
            },
            settings: [],
            contactTypes: [],
            override: [],
          },
        },
      },
    })).toEqual({ isValid: true, errors: [] });

    expect(isManifestValid({
      connectorName: 'apiKeyCRM',
      connectorManifest: {
        platforms: {
          apiKeyCRM: {
            name: 'API Key CRM',
            auth: {
              type: 'apiKey',
            },
          },
        },
      },
    })).toEqual({
      isValid: false,
      errors: ['platform.auth.apiKey configuration is required for apiKey type'],
    });

    expect(isManifestValid({
      connectorName: 'customCRM',
      connectorManifest: {
        platforms: {
          customCRM: {
            name: 'Custom CRM',
            auth: {
              type: 'custom',
            },
          },
        },
      },
    })).toEqual({ isValid: true, errors: [] });
  });
});

export {};
