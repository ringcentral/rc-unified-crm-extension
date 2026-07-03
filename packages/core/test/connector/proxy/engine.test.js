const path = require('path');

jest.mock('axios', () => jest.fn());
const axios = require('axios');

const {
  renderTemplateString,
  renderDeep,
  joinUrl,
  performRequest,
  mapFindContactResponse,
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
  });

  test('joinUrl joins base and path and preserves absolute urls', () => {
    expect(joinUrl('https://api.example.com', '/v1/items')).toBe('https://api.example.com/v1/items');
    expect(joinUrl('https://api.example.com/', 'v1/items')).toBe('https://api.example.com/v1/items');
    expect(joinUrl('', 'https://full.example.com/x')).toBe('https://full.example.com/x');
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


