describe('analytics', () => {
  let mixpanelInit;
  let peopleSetOnce;
  let track;
  let parseUserAgent;

  function loadAnalytics({
    token,
    modulePath = '../../lib/analytics'
  }: { token?: string; modulePath?: string } = {}) {
    jest.resetModules();
    peopleSetOnce = jest.fn();
    track = jest.fn();
    mixpanelInit = jest.fn(() => ({
      people: {
        set_once: peopleSetOnce
      },
      track
    }));
    parseUserAgent = jest.fn(() => ({
      browser: { name: 'Chrome' },
      os: { name: 'Windows' },
      device: { type: 'desktop' }
    }));

    if (token) {
      process.env.MIXPANEL_TOKEN = token;
    } else {
      delete process.env.MIXPANEL_TOKEN;
    }

    jest.doMock('mixpanel', () => ({
      init: mixpanelInit
    }));
    jest.doMock('ua-parser-js', () => parseUserAgent);
    jest.doMock('../../lib/logger', () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    }));

    return {
      analytics: require(modulePath),
      logger: require('../../lib/logger')
    };
  }

  afterEach(() => {
    delete process.env.MIXPANEL_TOKEN;
    jest.dontMock('mixpanel');
    jest.dontMock('ua-parser-js');
    jest.dontMock('../../lib/logger');
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('does not initialize Mixpanel when token is missing and skips tracking without an initialized client', () => {
    const { analytics } = loadAnalytics();

    analytics.init();
    analytics.track({
      eventName: 'Call Log Created',
      connectorName: 'salesforce',
      extensionId: 'ext-1'
    });

    expect(mixpanelInit).not.toHaveBeenCalled();
    expect(peopleSetOnce).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();
  });

  test('skips tracking when extension id is missing', () => {
    const { analytics } = loadAnalytics({ token: 'mixpanel-token' });

    analytics.init();
    analytics.track({
      eventName: 'Call Log Created',
      connectorName: 'salesforce',
      accountId: 'account-1'
    });

    expect(mixpanelInit).toHaveBeenCalledWith('mixpanel-token');
    expect(peopleSetOnce).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();
  });

  test('tracks event properties, parsed user agent fields, extras, and default source', () => {
    const { analytics, logger } = loadAnalytics({ token: 'mixpanel-token' });

    analytics.init();
    analytics.track({
      eventName: 'Call Log Created',
      interfaceName: 'desktop',
      connectorName: 'salesforce',
      accountId: 'account-1',
      extensionId: 'ext-1',
      success: true,
      requestDuration: 123,
      userAgent: 'Mozilla/5.0',
      ip: '127.0.0.1',
      author: 'unit-test',
      extras: {
        extraKey: 'extra-value'
      }
    });

    expect(peopleSetOnce).toHaveBeenCalledWith('ext-1', {
      version: expect.any(String),
      appName: 'App Connect',
      crmPlatform: 'salesforce'
    });
    expect(parseUserAgent).toHaveBeenCalledWith('Mozilla/5.0');
    expect(track).toHaveBeenCalledWith('Call Log Created', expect.objectContaining({
      distinct_id: 'ext-1',
      interfaceName: 'desktop',
      adapterName: 'salesforce',
      rcAccountId: 'account-1',
      extensionId: 'ext-1',
      success: true,
      requestDuration: 123,
      collectedFrom: 'server',
      appName: 'App Connect',
      eventAddedVia: 'server',
      $browser: 'Chrome',
      $os: 'Windows',
      $device: 'desktop',
      ip: '127.0.0.1',
      author: 'unit-test',
      extraKey: 'extra-value'
    }));
    expect(logger.info).toHaveBeenCalledWith('Event: Call Log Created');
  });

  test('TypeScript implementation tracks event properties through the same public API', () => {
    const { analytics, logger } = loadAnalytics({
      token: 'mixpanel-token',
      modulePath: '../../lib/analytics.ts'
    });

    analytics.init();
    analytics.track({
      eventName: 'Call Log Created',
      interfaceName: 'desktop',
      connectorName: 'salesforce',
      accountId: 'account-1',
      extensionId: 'ext-1',
      success: true,
      requestDuration: 123,
      userAgent: 'Mozilla/5.0',
      ip: '127.0.0.1',
      author: 'unit-test',
      extras: {
        extraKey: 'extra-value'
      }
    });

    expect(mixpanelInit).toHaveBeenCalledWith('mixpanel-token');
    expect(peopleSetOnce).toHaveBeenCalledWith('ext-1', {
      version: expect.any(String),
      appName: 'App Connect',
      crmPlatform: 'salesforce'
    });
    expect(parseUserAgent).toHaveBeenCalledWith('Mozilla/5.0');
    expect(track).toHaveBeenCalledWith('Call Log Created', expect.objectContaining({
      distinct_id: 'ext-1',
      interfaceName: 'desktop',
      adapterName: 'salesforce',
      rcAccountId: 'account-1',
      extensionId: 'ext-1',
      success: true,
      requestDuration: 123,
      collectedFrom: 'server',
      appName: 'App Connect',
      eventAddedVia: 'server',
      $browser: 'Chrome',
      $os: 'Windows',
      $device: 'desktop',
      ip: '127.0.0.1',
      author: 'unit-test',
      extraKey: 'extra-value'
    }));
    expect(logger.info).toHaveBeenCalledWith('Event: Call Log Created');
  });

  test('uses explicit eventAddedVia when provided', () => {
    const { analytics } = loadAnalytics({ token: 'mixpanel-token' });

    analytics.init();
    analytics.track({
      eventName: 'Disposition Saved',
      connectorName: 'hubspot',
      extensionId: 'ext-2',
      eventAddedVia: 'browser'
    });

    expect(track).toHaveBeenCalledWith('Disposition Saved', expect.objectContaining({
      eventAddedVia: 'browser'
    }));
  });
});

export {};
