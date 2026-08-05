const path = require('path');

jest.mock('axios', () => jest.fn());
const axios = require('axios');

const {
  getByPath,
  renderTemplateString,
  renderDeep,
  joinUrl,
  performRequest,
  mapFindContactResponse,
  mapCreateCallLogResponse,
  mapGetCallLogResponse,
} = require('../../../connector/proxy/engine');

describe('proxy engine utilities', () => {
  beforeEach(() => {
    axios.mockReset();
  });

  test('renderTemplateString handles full and partial templates', () => {
    const context = { a: { b: 123 }, name: 'Alice' };
    expect(renderTemplateString('{{a.b}}', context)).toBe(123);
    expect(renderTemplateString('Hello {{name}}', context)).toBe('Hello Alice');
    expect(renderTemplateString('Missing {{x.y}} here', context)).toBe('Missing  here');
    expect(renderTemplateString(123, context)).toBe(123);
    expect(renderTemplateString('{{x.y}}', context)).toBeUndefined();
  });

  test('getByPath handles root, empty, missing, and nested paths', () => {
    const object = { a: { b: 123 } };
    expect(getByPath(object)).toBe(object);
    expect(getByPath(object, '$')).toBe(object);
    expect(getByPath(object, 'a.b')).toBe(123);
    expect(getByPath(object, 'a.missing.value')).toBeUndefined();
  });

  test('renderDeep renders nested objects and arrays', () => {
    const context = { id: 42, name: 'Alice', items: ['x', 'y'] };
    const input = {
      url: '/users/{{id}}',
      body: { name: '{{name}}', tags: ['a', '{{items.1}}'] },
    };
    const out = renderDeep(input, context);
    expect(out.url).toBe('/users/42');
    expect(out.body.name).toBe('Alice');
    expect(out.body.tags).toEqual(['a', 'y']);
    expect(renderDeep(null, context)).toBeNull();
    expect(renderDeep(123, context)).toBe(123);
  });

  test('joinUrl joins base and path and preserves absolute urls', () => {
    expect(joinUrl('https://api.example.com', '/v1/items')).toBe('https://api.example.com/v1/items');
    expect(joinUrl('https://api.example.com/', 'v1/items')).toBe('https://api.example.com/v1/items');
    expect(joinUrl('', 'https://full.example.com/x')).toBe('https://full.example.com/x');
    expect(joinUrl('https://api.example.com', '')).toBe('https://api.example.com');
    expect(joinUrl('https://api.example.com', 'https://full.example.com/x')).toBe('https://full.example.com/x');
  });

  test('performRequest composes url, headers, params, body and auth', async () => {
    axios.mockResolvedValue({ data: { ok: true } });
    const config = {
      secretKey: 'shh-key',
      auth: {
        type: 'apiKey',
        scheme: 'Basic',
        credentialTemplate: '{{apiKey}}',
        encode: 'base64',
        headerName: 'Authorization'
      },
      requestDefaults: {
        baseUrl: 'https://api.example.com',
        timeoutSeconds: 10,
        defaultHeaders: { Accept: 'application/json', 'X-Secret-Key': '{{secretKey}}' }
      },
      operations: {
        createThing: {
          method: 'POST',
          url: '/things/{{thingId}}',
          headers: { 'Content-Type': 'application/json' },
          query: { search: '{{q}}' },
          body: { id: '{{thingId}}', name: '{{name}}' }
        }
      }
    };
    const user = { accessToken: 'token-123' };
    await performRequest({
      config,
      opName: 'createThing',
      inputs: { thingId: 7, name: 'Widget', q: 'alpha' },
      user,
      authHeader: undefined
    });

    expect(axios).toHaveBeenCalledTimes(1);
    const args = axios.mock.calls[0][0];
    expect(args.url).toBe('https://api.example.com/things/7');
    expect(args.method).toBe('POST');
    expect(args.params).toEqual({ search: 'alpha' });
    expect(args.data).toEqual({ id: 7, name: 'Widget' });
    expect(args.timeout).toBe(10000);
    expect(args.headers.Accept).toBe('application/json');
    expect(args.headers['Content-Type']).toBe('application/json');
    expect(args.headers['X-Secret-Key']).toBe('shh-key');
    // Basic base64('token-123')
    expect(args.headers.Authorization).toMatch(/^Basic /);
  });

  test('performRequest returns null for missing operations', async () => {
    await expect(performRequest({
      config: { operations: {} },
      opName: 'missing',
      inputs: {},
      user: null
    })).resolves.toBeNull();
    expect(axios).not.toHaveBeenCalled();
  });

  test('performRequest applies authHeader and OAuth defaults', async () => {
    axios.mockResolvedValue({ data: { ok: true } });

    await performRequest({
      config: {
        requestDefaults: { baseUrl: 'https://api.example.com' },
        operations: {
          ping: { url: '/ping' }
        }
      },
      opName: 'ping',
      inputs: {},
      user: { accessToken: 'token-123' },
      authHeader: 'Bearer provided'
    });

    expect(axios.mock.calls[0][0]).toMatchObject({
      url: 'https://api.example.com/ping',
      method: 'GET',
      timeout: 30000,
      headers: { Authorization: 'Bearer provided' }
    });

    await performRequest({
      config: {
        auth: { type: 'oauth' },
        operations: {
          ping: { url: 'https://api.example.com/ping' }
        }
      },
      opName: 'ping',
      inputs: {},
      user: { accessToken: 'oauth-token' }
    });

    expect(axios.mock.calls[1][0].headers.Authorization).toBe('Bearer oauth-token');
  });

  test('performRequest lets operation auth override connector auth', async () => {
    axios.mockResolvedValue({ data: { ok: true } });
    const config = {
      auth: {
        type: 'oauth'
      },
      operations: {
        createThing: {
          method: 'POST',
          url: 'https://api.example.com/things',
          auth: {
            headerName: 'X-Api-Key',
            credentialTemplate: '{{apiKey}}:{{secretKey}}',
            encode: 'none'
          },
          body: {
            userId: '{{user.id}}',
            hostname: '{{user.hostname}}',
            tokenExpiry: '{{user.tokenExpiry}}'
          }
        }
      },
      secretKey: 'secret-1'
    };

    await performRequest({
      config,
      opName: 'createThing',
      inputs: {},
      user: {
        id: 'u1-test',
        accessToken: 'token-123',
        hostname: 'host.example.com',
        tokenExpiry: '2030-01-01T00:00:00Z'
      }
    });

    const args = axios.mock.calls[0][0];
    expect(args.headers).toEqual({ 'X-Api-Key': 'token-123:secret-1' });
    expect(args.data).toEqual({
      userId: 'u1',
      hostname: 'host.example.com',
      tokenExpiry: '2030-01-01T00:00:00Z'
    });
  });

  test('performRequest uses submitted apiKey during first login before user is saved', async () => {
    axios.mockResolvedValue({ data: { ok: true } });
    const config = {
      auth: {
        type: 'apiKey',
        scheme: 'Basic',
        credentialTemplate: '{{apiKey}}',
        encode: 'base64',
        headerName: 'Authorization'
      },
      requestDefaults: {
        baseUrl: 'https://api.example.com'
      },
      operations: {
        getUserInfo: {
          method: 'GET',
          url: '/authentication'
        }
      }
    };

    await performRequest({
      config,
      opName: 'getUserInfo',
      inputs: { apiKey: 'login-key' },
      user: {},
      authHeader: undefined
    });

    const args = axios.mock.calls[0][0];
    expect(args.headers.Authorization).toBe(`Basic ${Buffer.from('login-key').toString('base64')}`);
  });

  test('mapFindContactResponse maps contact created date', () => {
    const config = {
      operations: {
        findContact: {
          responseMapping: {
            listPath: 'body.contacts',
            item: {
              idPath: 'id',
              namePath: 'name',
              createdDatePath: 'created_at',
              mostRecentActivityDatePath: 'updated_at'
            }
          }
        }
      }
    };
    const response = {
      data: {
        contacts: [
          {
            id: 'c1',
            name: 'Alice',
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-02-01T00:00:00Z'
          }
        ]
      }
    };

    expect(mapFindContactResponse({ config, response })).toEqual([
      expect.objectContaining({
        id: 'c1',
        name: 'Alice',
        createdDate: '2024-01-01T00:00:00Z',
        mostRecentActivityDate: '2024-02-01T00:00:00Z'
      })
    ]);
  });

  test('mapFindContactResponse returns defaults when mappings or fields are absent', () => {
    expect(mapFindContactResponse({
      config: { operations: {} },
      response: { data: {} }
    })).toEqual([]);

    expect(mapFindContactResponse({
      config: {
        operations: {
          findContact: {
            responseMapping: {}
          }
        }
      },
      response: {
        data: [
          { id: 'c1' }
        ]
      }
    })).toEqual([{
      id: 'c1',
      name: '',
      phone: undefined,
      type: 'Contact',
      title: '',
      company: '',
      createdDate: undefined,
      mostRecentActivityDate: undefined,
      additionalInfo: null
    }]);
  });

  test('maps call log response helpers with defaults and configured paths', () => {
    expect(mapCreateCallLogResponse({
      config: { operations: {} },
      response: { data: { id: 'ignored' } }
    })).toEqual({ logId: undefined });

    expect(mapCreateCallLogResponse({
      config: {
        operations: {
          createCallLog: {
            responseMapping: { idPath: 'body.activity.id' }
          }
        }
      },
      response: { data: { activity: { id: 123 } } }
    })).toEqual({ logId: '123' });

    expect(mapGetCallLogResponse({
      config: {
        operations: {
          getCallLog: {
            responseMapping: {
              subjectPath: 'body.activity.subject',
              notePath: 'body.activity.note',
              fullBodyPath: 'body.activity.description'
            }
          }
        }
      },
      response: {
        data: {
          activity: {
            subject: 'Subject',
            note: 'Note',
            description: 'Body'
          }
        }
      }
    })).toEqual({
      callLogInfo: {
        subject: 'Subject',
        note: 'Note',
        fullBody: 'Body',
        fullLogResponse: {
          activity: {
            subject: 'Subject',
            note: 'Note',
            description: 'Body'
          }
        }
      }
    });
  });

  test('mapFindContactResponse can map findContactWithName responses', () => {
    const config = {
      operations: {
        findContact: {
          responseMapping: {
            listPath: 'body.phoneMatches',
            item: {
              idPath: 'id',
              namePath: 'name'
            }
          }
        },
        findContactWithName: {
          responseMapping: {
            listPath: 'body.nameMatches',
            item: {
              idPath: 'personId',
              namePath: 'displayName',
              createdDatePath: 'created'
            }
          }
        }
      }
    };
    const response = {
      data: {
        nameMatches: [
          {
            personId: 'p1',
            displayName: 'Jane Smith',
            created: '2023-05-01T00:00:00Z'
          }
        ]
      }
    };

    expect(mapFindContactResponse({ config, response, opName: 'findContactWithName' })).toEqual([
      expect.objectContaining({
        id: 'p1',
        name: 'Jane Smith',
        createdDate: '2023-05-01T00:00:00Z'
      })
    ]);
  });
});



export {};
