describe('Connector TypeScript module parity', () => {
  test('registry.ts registers, composes, and unregisters connectors', () => {
    jest.resetModules();
    const registry = require('../../connector/registry.ts');
    const connector = {
      createCallLog: jest.fn(),
      updateCallLog: jest.fn(),
      getAuthType: jest.fn().mockResolvedValue('oauth')
    };
    const interfaceFn = jest.fn();

    registry.registerConnector('tsTestConnector', connector);
    registry.registerConnectorInterface('tsTestConnector', 'findContact', interfaceFn);

    const composed = registry.getConnector('tsTestConnector');
    expect(Object.getPrototypeOf(composed)).toBe(connector);
    expect(composed.findContact).toBe(interfaceFn);
    expect(registry.hasPlatformInterface('tsTestConnector', 'findContact')).toBe(true);

    registry.unregisterConnector('tsTestConnector');
    expect(() => registry.getOriginalConnector('tsTestConnector')).toThrow('Connector not found for platform: tsTestConnector');
  });

  test('proxy engine.ts renders and maps responses like the compatibility entrypoint', () => {
    const jsEngine = require('../../connector/proxy/engine');
    const tsEngine = require('../../connector/proxy/engine.ts');
    const config = {
      operations: {
        createCallLog: {
          responseMapping: {
            idPath: 'body.data.id'
          }
        },
        getCallLog: {
          responseMapping: {
            subjectPath: 'body.subject',
            notePath: 'body.note',
            fullBodyPath: 'body.full'
          }
        }
      }
    };

    expect(tsEngine.renderTemplateString('Hello {{ user.name }}', { user: { name: 'Ada' } }))
      .toBe(jsEngine.renderTemplateString('Hello {{ user.name }}', { user: { name: 'Ada' } }));
    expect(tsEngine.joinUrl('https://api.example.com/', '/v1/items')).toBe('https://api.example.com/v1/items');
    expect(tsEngine.mapCreateCallLogResponse({
      config,
      response: { data: { data: { id: 123 } } }
    })).toEqual({ logId: '123' });
    expect(tsEngine.mapGetCallLogResponse({
      config,
      response: { data: { subject: 'Subject', note: 'Note', full: 'Full body' } }
    })).toEqual({
      callLogInfo: {
        subject: 'Subject',
        note: 'Note',
        fullBody: 'Full body',
        fullLogResponse: { subject: 'Subject', note: 'Note', full: 'Full body' }
      }
    });
  });

  test('developerPortal.ts, mock.ts, and proxy index.ts expose expected connector functions', () => {
    const developerPortal = require('../../connector/developerPortal.ts');
    const mockConnector = require('../../connector/mock.ts');
    const proxyConnector = require('../../connector/proxy/index.ts');

    expect(developerPortal.getPublicConnectorList).toEqual(expect.any(Function));
    expect(developerPortal.getConnectorManifest).toEqual(expect.any(Function));
    expect(mockConnector.createUser).toEqual(expect.any(Function));
    expect(mockConnector.getCallLog).toEqual(expect.any(Function));
    expect(proxyConnector.getAuthType).toEqual(expect.any(Function));
    expect(proxyConnector.createCallLog).toEqual(expect.any(Function));
  });
});
