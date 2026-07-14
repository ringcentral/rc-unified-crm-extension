const { isManifestValid } = require('../../../mcp/lib/validator');
const {
  invalidManifestStructureCases,
  exactConnectorNameCases,
  missingAuthCases,
  missingAuthTypeCases,
  oauthTypeCasingCases,
  missingOAuthConfigCases,
  oauthCredentialCases,
  apiKeyTypeCasingCases,
  missingApiKeyConfigCases,
  validEnvironmentCases,
  invalidEnvironmentTypeCases,
  missingSelectableSelectionCases,
  validCollectionCases,
  invalidCollectionCases,
  missingPlatformNameCases,
} = require('../data/validatorCases');

const manifestWithPlatform = (platform = {}, connectorName = 'testCRM') => ({
  platforms: {
    [connectorName]: {
      name: 'Test CRM',
      auth: { type: 'custom' },
      ...platform,
    },
  },
});

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

  describe('top-level manifest and connector-name variations', () => {
    test.each<[any]>(invalidManifestStructureCases as [any][])('returns one structural error for $label', ({ connectorManifest, error }) => {
      expect(isManifestValid({ connectorManifest, connectorName: 'testCRM' })).toEqual({
        isValid: false,
        errors: [error],
      });
    });

    test.each<[any]>(exactConnectorNameCases as [any][])('looks up the exact practical connector key %s', (connectorName) => {
      expect(isManifestValid({
        connectorManifest: manifestWithPlatform({}, connectorName),
        connectorName,
      })).toEqual({ isValid: true, errors: [] });
    });
  });

  describe('auth configuration variations', () => {
    test.each<[any]>(missingAuthCases as [any][])('rejects $label', ({ auth }) => {
      expect(isManifestValid({
        connectorManifest: manifestWithPlatform({ auth }),
        connectorName: 'testCRM',
      })).toEqual({
        isValid: false,
        errors: ['platform.auth is required'],
      });
    });

    test.each<[any]>(missingAuthTypeCases as [any][])('rejects auth with $label', ({ auth }) => {
      expect(isManifestValid({
        connectorManifest: manifestWithPlatform({ auth }),
        connectorName: 'testCRM',
      })).toEqual({
        isValid: false,
        errors: ['platform.auth.type is required'],
      });
    });

    test.each<[any]>(oauthTypeCasingCases as [any][])('accepts case-insensitive OAuth type %s with complete credentials', (type) => {
      expect(isManifestValid({
        connectorManifest: manifestWithPlatform({
          auth: {
            type,
            oauth: {
              authUrl: 'https://crm.example.com/oauth?audience=app%20connect',
              clientId: 'client-客户-42',
            },
          },
        }),
        connectorName: 'testCRM',
      })).toEqual({ isValid: true, errors: [] });
    });

    test.each<[any]>(missingOAuthConfigCases as [any][])('rejects OAuth with $label', ({ oauth }) => {
      expect(isManifestValid({
        connectorManifest: manifestWithPlatform({ auth: { type: 'oauth', oauth } }),
        connectorName: 'testCRM',
      })).toEqual({
        isValid: false,
        errors: ['platform.auth.oauth configuration is required for oauth type'],
      });
    });

    test.each<[any]>(oauthCredentialCases as [any][])('reports $label without hiding sibling validation errors', ({ oauth, errors }) => {
      expect(isManifestValid({
        connectorManifest: manifestWithPlatform({ auth: { type: 'oauth', oauth } }),
        connectorName: 'testCRM',
      })).toEqual({ isValid: false, errors });
    });

    test.each<[any]>(apiKeyTypeCasingCases as [any][])('accepts case-insensitive API-key type %s with a configuration object', (type) => {
      expect(isManifestValid({
        connectorManifest: manifestWithPlatform({ auth: { type, apiKey: {} } }),
        connectorName: 'testCRM',
      })).toEqual({ isValid: true, errors: [] });
    });

    test.each<[any]>(missingApiKeyConfigCases as [any][])('rejects API-key auth with $label', ({ apiKey }) => {
      expect(isManifestValid({
        connectorManifest: manifestWithPlatform({ auth: { type: 'apiKey', apiKey } }),
        connectorName: 'testCRM',
      })).toEqual({
        isValid: false,
        errors: ['platform.auth.apiKey configuration is required for apiKey type'],
      });
    });
  });

  describe('environment and collection variations', () => {
    test.each<[any]>(validEnvironmentCases as [any][])('accepts a valid $label', ({ environment }) => {
      expect(isManifestValid({
        connectorManifest: manifestWithPlatform({ environment }),
        connectorName: 'testCRM',
      })).toEqual({ isValid: true, errors: [] });
    });

    test.each<[any]>(invalidEnvironmentTypeCases as [any][])('rejects $label', ({ environment }) => {
      expect(isManifestValid({
        connectorManifest: manifestWithPlatform({ environment }),
        connectorName: 'testCRM',
      })).toEqual({
        isValid: false,
        errors: ['platform.environment.type is required when environment is specified'],
      });
    });

    test.each<[any]>(missingSelectableSelectionCases as [any][])('rejects selectable environment with $label', ({ selections }) => {
      expect(isManifestValid({
        connectorManifest: manifestWithPlatform({
          environment: { type: 'selectable', selections },
        }),
        connectorName: 'testCRM',
      })).toEqual({
        isValid: false,
        errors: ['platform.environment.selections is required for selectable environment type'],
      });
    });

    test.each<[any]>(validCollectionCases as [any][])('accepts $label', ({ settings, contactTypes, override }) => {
      expect(isManifestValid({
        connectorManifest: manifestWithPlatform({ settings, contactTypes, override }),
        connectorName: 'testCRM',
      })).toEqual({ isValid: true, errors: [] });
    });

    test.each<[any]>(invalidCollectionCases as [any][])('rejects truthy non-array $field value $value', ({ field, value, error }) => {
      expect(isManifestValid({
        connectorManifest: manifestWithPlatform({ [field]: value }),
        connectorName: 'testCRM',
      })).toEqual({ isValid: false, errors: [error] });
    });

    test.each<[any]>(missingPlatformNameCases as [any][])('requires a truthy platform name: %p', (name) => {
      expect(isManifestValid({
        connectorManifest: manifestWithPlatform({ name }),
        connectorName: 'testCRM',
      })).toEqual({
        isValid: false,
        errors: ['platform.name is required'],
      });
    });
  });
});

export {};
