const axios = require('axios');
const nock = require('nock');
const { Op } = require('sequelize');
const { getServer } = require('../../src/index');
const jwt = require('@app-connect/core/lib/jwt');
const { UserModel } = require('@app-connect/core/models/userModel');
const { CallLogModel } = require('@app-connect/core/models/callLogModel');
const { MessageLogModel } = require('@app-connect/core/models/messageLogModel');
const { AccountDataModel } = require('@app-connect/core/models/accountDataModel');

describe('App Connect Server E2E smoke', () => {
  const platform = 'pipedrive';
  const userId = '12345-pipedrive-e2e';
  const rcAccountId = 'e2e-rc-account';
  const hostname = 'test.pipedrive.com';
  const phoneNumber = '+14155551234';
  const sessionId = 'e2e-session-1';
  const telephonySessionId = 'e2e-telephony-session-1';
  const extensionNumber = '101';
  const providerBaseUrl = `https://${hostname}`;
  const rateLimitHeaders = {
    'x-ratelimit-remaining': '99',
    'x-ratelimit-limit': '100',
    'x-ratelimit-reset': '60',
  };
  const bullhornPlatform = 'bullhorn';
  const bullhornUserId = '456-bullhorn-e2e';
  const bullhornRcAccountId = 'e2e-rc-account-bullhorn';
  const bullhornPhoneNumber = '+14155552345';
  const bullhornSessionId = 'e2e-bullhorn-session-1';
  const bullhornTelephonySessionId = 'e2e-bullhorn-telephony-session-1';
  const bullhornExtensionNumber = '102';
  const bullhornRestBaseUrl = 'https://rest.bullhorn.com';
  const bullhornRestPath = '/rest-services/e2e';
  const bullhornRestUrl = `${bullhornRestBaseUrl}${bullhornRestPath}/`;
  const bullhornRateLimitHeaders = {
    'ratelimit-remaining': '99',
    'ratelimit-limit': '100',
    'ratelimit-reset': '60',
  };
  const clioPlatform = 'clio';
  const clioUserId = '67890-clio-e2e';
  const clioRcAccountId = 'e2e-rc-account-clio';
  const clioHostname = 'app.clio.com';
  const clioPhoneNumber = '+14155553456';
  const clioSessionId = 'e2e-clio-session-1';
  const clioTelephonySessionId = 'e2e-clio-telephony-session-1';
  const clioExtensionNumber = '103';
  const clioProviderBaseUrl = `https://${clioHostname}`;
  const e2eUserIds = [userId, bullhornUserId, clioUserId];
  const e2eRcAccountIds = [rcAccountId, bullhornRcAccountId, clioRcAccountId];

  let server;
  let client;
  let jwtToken;
  let bullhornJwtToken;
  let clioJwtToken;

  function providerActivityResponse(overrides = {}) {
    return {
      data: {
        id: 401,
        subject: 'E2E call subject',
        note: '<b>Agent notes</b>E2E agent note<b>Call details</b><br>Call metadata',
        deal_id: 201,
        lead_id: null,
        ...overrides,
      },
      related_objects: {
        person: {
          101: { name: 'John Doe' },
        },
      },
    };
  }

  async function seedPipedriveUser() {
    await UserModel.create({
      id: userId,
      platform,
      hostname,
      rcAccountId,
      rcUserNumber: '+14155550001',
      accessToken: 'e2e-access-token',
      refreshToken: 'e2e-refresh-token',
      tokenExpiry: new Date(Date.now() + 60 * 60 * 1000),
      timezoneOffset: '+00:00',
      platformAdditionalInfo: {},
      userSettings: {},
      hashedRcExtensionId: 'e2e-hashed-extension',
    });
    jwtToken = jwt.generateJwt({
      id: userId,
      platform,
      rcUserNumber: '+14155550001',
    });
  }

  async function seedBullhornUser() {
    await UserModel.create({
      id: bullhornUserId,
      platform: bullhornPlatform,
      hostname: 'rest.bullhorn.com',
      rcAccountId: bullhornRcAccountId,
      rcUserNumber: '+14155550002',
      accessToken: 'e2e-bullhorn-access-token',
      refreshToken: 'e2e-bullhorn-refresh-token',
      tokenExpiry: new Date(Date.now() + 60 * 60 * 1000),
      timezoneOffset: 0,
      platformAdditionalInfo: {
        id: 123,
        tokenUrl: 'https://auth.bullhornstaffing.com/oauth/token',
        restUrl: bullhornRestUrl,
        loginUrl: 'https://rest.bullhorn.com',
        bhRestToken: 'e2e-bh-rest-token',
      },
      userSettings: {},
      hashedRcExtensionId: 'e2e-bullhorn-hashed-extension',
    });
    bullhornJwtToken = jwt.generateJwt({
      id: bullhornUserId,
      platform: bullhornPlatform,
      rcUserNumber: '+14155550002',
    });
  }

  async function seedClioUser() {
    await UserModel.create({
      id: clioUserId,
      platform: clioPlatform,
      hostname: clioHostname,
      rcAccountId: clioRcAccountId,
      rcUserNumber: '+14155550003',
      accessToken: 'e2e-clio-access-token',
      refreshToken: 'e2e-clio-refresh-token',
      tokenExpiry: new Date(Date.now() + 60 * 60 * 1000),
      timezoneOffset: '+00:00',
      platformAdditionalInfo: {
        id: 67890,
      },
      userSettings: {
        clioTimeEntriesEnabled: { value: false },
      },
      hashedRcExtensionId: 'e2e-clio-hashed-extension',
    });
    clioJwtToken = jwt.generateJwt({
      id: clioUserId,
      platform: clioPlatform,
      rcUserNumber: '+14155550003',
    });
  }

  async function seedUsers() {
    await seedPipedriveUser();
    await seedBullhornUser();
    await seedClioUser();
  }

  async function cleanE2EData() {
    await CallLogModel.destroy({ where: { userId: { [Op.in]: e2eUserIds } } });
    await MessageLogModel.destroy({ where: { userId: { [Op.in]: e2eUserIds } } });
    await AccountDataModel.destroy({ where: { rcAccountId: { [Op.in]: e2eRcAccountIds } } });
    await UserModel.destroy({ where: { id: { [Op.in]: e2eUserIds } } });
  }

  beforeAll(async () => {
    await AccountDataModel.sync();
    server = getServer().listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const { port } = server.address();
    client = axios.create({
      baseURL: `http://127.0.0.1:${port}`,
      validateStatus: () => true,
      proxy: false,
    });
  });

  afterAll(async () => {
    await cleanE2EData();
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
  });

  beforeEach(async () => {
    nock.cleanAll();
    await cleanE2EData();
    await seedUsers();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  test('serves metadata and completes a Pipedrive contact-to-call-log HTTP flow', async () => {
    const health = await client.get('/isAlive');
    expect(health.status).toBe(200);
    expect(health.data).toBe('OK');

    const manifest = await client.get('/crmManifest', { params: { platformName: 'default' } });
    expect(manifest.status).toBe(200);
    expect(manifest.data.author.name).toBeTruthy();
    expect(manifest.data.platforms.pipedrive).toBeDefined();

    const interfaces = await client.get('/implementedInterfaces', { params: { platform } });
    expect(interfaces.status).toBe(200);
    expect(interfaces.data).toMatchObject({
      getAuthType: true,
      getOauthInfo: true,
      findContact: true,
      createCallLog: true,
      updateCallLog: true,
      getCallLog: true,
    });

    const contactSearchScope = nock(providerBaseUrl)
      .get('/api/v2/persons/search')
      .query({ term: '4155551234', fields: 'phone' })
      .reply(200, {
        data: {
          items: [{
            item: {
              id: 101,
              name: 'John Doe',
              phone: phoneNumber,
              organization: { name: 'E2E Org' },
              update_time: '2026-01-02T03:04:05Z',
            },
          }],
        },
      }, rateLimitHeaders);

    const dealScope = nock(providerBaseUrl)
      .get('/api/v2/deals')
      .query({ person_id: '101', status: 'open' })
      .reply(200, {
        data: [{ id: 201, title: 'E2E Deal' }],
      }, rateLimitHeaders);

    const leadScope = nock(providerBaseUrl)
      .get('/v1/leads')
      .query({ person_id: '101' })
      .reply(200, {
        data: [{ id: 301, title: 'E2E Lead' }],
      }, rateLimitHeaders);

    const contact = await client.get('/contact', {
      params: {
        jwtToken,
        phoneNumber,
        isExtension: 'false',
      },
    });

    expect(contact.status).toBe(200);
    expect(contact.data.successful).toBe(true);
    expect(contact.data.contact[0]).toMatchObject({
      id: 101,
      name: 'John Doe',
      organization: 'E2E Org',
    });
    expect(contact.data.contact[0].additionalInfo.deals).toEqual([{ const: 201, title: 'E2E Deal' }]);
    expect(contact.data.contact[0].additionalInfo.leads).toEqual([{ const: 301, title: 'E2E Lead' }]);
    expect(contactSearchScope.isDone()).toBe(true);
    expect(dealScope.isDone()).toBe(true);
    expect(leadScope.isDone()).toBe(true);

    const cachedContact = await AccountDataModel.findOne({
      where: {
        rcAccountId,
        platformName: platform,
        dataKey: `contact-${phoneNumber}`,
      },
    });
    expect(cachedContact.data[0].name).toBe('John Doe');

    const logInfo = {
      id: 'e2e-call-id',
      sessionId,
      telephonySessionId,
      extensionNumber,
      direction: 'Outbound',
      from: {
        name: 'E2E Agent',
        phoneNumber: '+14155550001',
      },
      to: {
        name: 'John Doe',
        phoneNumber,
      },
      duration: 125,
      result: 'Completed',
      startTime: new Date('2026-01-02T03:04:05.000Z').getTime(),
      recording: {
        link: 'https://recordings.example.test/e2e.wav',
      },
      customSubject: 'E2E call subject',
    };

    const personScope = nock(providerBaseUrl)
      .get('/api/v2/persons/101')
      .reply(200, { data: { org_id: 201 } }, rateLimitHeaders);

    const activityTypesScope = nock(providerBaseUrl)
      .get('/v1/activityTypes')
      .reply(200, {
        data: [{ name: 'Call', key_string: 'call', active_flag: true }],
      }, rateLimitHeaders);

    let createdActivityBody;
    const createActivityScope = nock(providerBaseUrl)
      .post('/api/v2/activities', body => {
        createdActivityBody = body;
        return true;
      })
      .reply(201, { data: { id: 401 } }, rateLimitHeaders);

    const createLog = await client.post('/callLog', {
      logInfo,
      contactId: 101,
      contactName: 'John Doe',
      contactType: 'contact',
      note: 'E2E agent note',
      additionalSubmission: { deals: 201 },
    }, {
      params: { jwtToken },
      headers: {
        'rc-account-id': 'e2e-hashed-account',
        'rc-extension-id': 'e2e-hashed-extension',
      },
    });

    expect(createLog.status).toBe(200);
    expect(createLog.data).toMatchObject({
      successful: true,
      logId: 401,
      returnMessage: {
        message: 'Call logged',
        messageType: 'success',
      },
    });
    expect(createdActivityBody).toMatchObject({
      owner_id: 12345,
      subject: 'E2E call subject',
      deal_id: 201,
      org_id: 201,
      type: 'call',
      participants: [{ person_id: 101, primary: true }],
    });
    expect(createdActivityBody.note).toContain('E2E agent note');
    expect(createdActivityBody.note).toContain('Call details');
    expect(createdActivityBody.note).toContain('Call recording link');
    expect(personScope.isDone()).toBe(true);
    expect(activityTypesScope.isDone()).toBe(true);
    expect(createActivityScope.isDone()).toBe(true);

    const persistedCallLog = await CallLogModel.findOne({ where: { sessionId, userId } });
    expect(persistedCallLog).toMatchObject({
      id: telephonySessionId,
      sessionId,
      extensionNumber,
      platform,
      thirdPartyLogId: '401',
      userId,
      contactId: '101',
    });

    const getActivityScope = nock(providerBaseUrl)
      .get('/api/v2/activities/401')
      .reply(200, providerActivityResponse(), rateLimitHeaders);

    const getLog = await client.get('/callLog', {
      params: {
        jwtToken,
        sessionIds: sessionId,
        extensionNumber,
        requireDetails: 'true',
      },
    });

    expect(getLog.status).toBe(200);
    expect(getLog.data.successful).toBe(true);
    expect(getLog.data.logs).toHaveLength(1);
    expect(getLog.data.logs[0]).toMatchObject({
      sessionId,
      matched: true,
      logId: '401',
      logData: {
        subject: 'E2E call subject',
        note: 'E2E agent note',
        contactName: 'John Doe',
        dispositions: {
          deals: 201,
          leads: null,
        },
      },
    });
    expect(getActivityScope.isDone()).toBe(true);

    const getBeforeUpdateScope = nock(providerBaseUrl)
      .get('/api/v2/activities/401')
      .reply(200, providerActivityResponse(), rateLimitHeaders);

    let patchedActivityBody;
    const updateActivityScope = nock(providerBaseUrl)
      .patch('/api/v2/activities/401', body => {
        patchedActivityBody = body;
        return true;
      })
      .reply(200, { data: { id: 401 } }, rateLimitHeaders);

    const updateLog = await client.patch('/callLog', {
      sessionId,
      extensionNumber,
      subject: 'E2E updated subject',
      note: 'E2E follow-up note',
      startTime: new Date('2026-01-02T03:10:05.000Z').getTime(),
      duration: 240,
      result: 'Completed',
      direction: 'Outbound',
      from: logInfo.from,
      to: logInfo.to,
    }, {
      params: { jwtToken },
      headers: {
        'rc-account-id': 'e2e-hashed-account',
        'rc-extension-id': 'e2e-hashed-extension',
      },
    });

    expect(updateLog.status).toBe(200);
    expect(updateLog.data.successful).toBe(true);
    expect(updateLog.data.logId).toBe('401');
    expect(updateLog.data.updatedNote).toContain('E2E follow-up note');
    expect(patchedActivityBody).toMatchObject({
      subject: 'E2E updated subject',
      duration: '00:05',
    });
    expect(patchedActivityBody.note).toContain('E2E follow-up note');
    expect(getBeforeUpdateScope.isDone()).toBe(true);
    expect(updateActivityScope.isDone()).toBe(true);
    expect(nock.pendingMocks()).toEqual([]);
  });

  test('completes a Bullhorn contact-to-call-log HTTP flow', async () => {
    const interfaces = await client.get('/implementedInterfaces', {
      params: { platform: bullhornPlatform },
    });
    expect(interfaces.status).toBe(200);
    expect(interfaces.data).toMatchObject({
      getAuthType: true,
      getOauthInfo: true,
      findContact: true,
      createCallLog: true,
      updateCallLog: true,
      getCallLog: true,
    });

    const pingContactScope = nock(bullhornRestBaseUrl)
      .get(`${bullhornRestPath}/ping`)
      .reply(200, {
        sessionExpires: Date.now() + 60 * 60 * 1000,
      }, bullhornRateLimitHeaders);

    const actionListScope = nock(bullhornRestBaseUrl)
      .get(`${bullhornRestPath}/settings/commentActionList`)
      .reply(200, {
        commentActionList: ['Call', 'Email'],
      }, bullhornRateLimitHeaders);

    let bullhornContactSearchBody;
    const contactSearchScope = nock(bullhornRestBaseUrl)
      .post(`${bullhornRestPath}/search/ClientContact`, body => {
        bullhornContactSearchBody = body;
        return true;
      })
      .query(true)
      .reply(200, {
        data: [{
          id: 701,
          name: 'Bullhorn Contact',
          email: 'bullhorn-contact@example.test',
          phone: bullhornPhoneNumber,
          dateAdded: new Date('2026-01-02T03:04:05.000Z').getTime(),
          dateLastModified: new Date('2026-01-02T04:04:05.000Z').getTime(),
          dateLastVisit: new Date('2026-01-02T05:04:05.000Z').getTime(),
        }],
      }, bullhornRateLimitHeaders);

    const candidateSearchScope = nock(bullhornRestBaseUrl)
      .post(`${bullhornRestPath}/search/Candidate`)
      .query(true)
      .reply(200, { data: [] }, bullhornRateLimitHeaders);

    const leadSearchScope = nock(bullhornRestBaseUrl)
      .post(`${bullhornRestPath}/search/Lead`)
      .query(true)
      .reply(200, { data: [] }, bullhornRateLimitHeaders);

    const contact = await client.get('/contact', {
      params: {
        jwtToken: bullhornJwtToken,
        phoneNumber: bullhornPhoneNumber,
        isExtension: 'false',
      },
    });

    expect(contact.status).toBe(200);
    expect(contact.data.successful).toBe(true);
    expect(contact.data.contact[0]).toMatchObject({
      id: 701,
      name: 'Bullhorn Contact',
      type: 'Contact',
    });
    expect(contact.data.contact[0].additionalInfo.noteActions).toEqual([
      { const: 'Call', title: 'Call' },
      { const: 'Email', title: 'Email' },
    ]);
    expect(bullhornContactSearchBody.query).toContain('4155552345');
    expect(pingContactScope.isDone()).toBe(true);
    expect(actionListScope.isDone()).toBe(true);
    expect(contactSearchScope.isDone()).toBe(true);
    expect(candidateSearchScope.isDone()).toBe(true);
    expect(leadSearchScope.isDone()).toBe(true);

    const cachedContact = await AccountDataModel.findOne({
      where: {
        rcAccountId: bullhornRcAccountId,
        platformName: bullhornPlatform,
        dataKey: `contact-${bullhornPhoneNumber}`,
      },
    });
    expect(cachedContact.data[0].name).toBe('Bullhorn Contact');

    const logInfo = {
      id: 'e2e-bullhorn-call-id',
      sessionId: bullhornSessionId,
      telephonySessionId: bullhornTelephonySessionId,
      extensionNumber: bullhornExtensionNumber,
      direction: 'Outbound',
      from: {
        name: 'Bullhorn Agent',
        phoneNumber: '+14155550002',
      },
      to: {
        name: 'Bullhorn Contact',
        phoneNumber: bullhornPhoneNumber,
      },
      duration: 180,
      result: 'Completed',
      startTime: new Date('2026-01-02T03:04:05.000Z').getTime(),
      recording: {
        link: 'https://recordings.example.test/bullhorn-e2e.wav',
      },
      customSubject: 'Bullhorn E2E call subject',
    };

    const pingCallLogScope = nock(bullhornRestBaseUrl)
      .get(`${bullhornRestPath}/ping`)
      .reply(200, {
        sessionExpires: Date.now() + 60 * 60 * 1000,
      }, bullhornRateLimitHeaders);

    let createdNoteBody;
    const createNoteScope = nock(bullhornRestBaseUrl)
      .put(`${bullhornRestPath}/entity/Note`, body => {
        createdNoteBody = body;
        return true;
      })
      .reply(200, {
        changedEntityId: 801,
      }, bullhornRateLimitHeaders);

    const createLog = await client.post('/callLog', {
      logInfo,
      contactId: 701,
      contactName: 'Bullhorn Contact',
      contactType: 'Contact',
      note: 'Bullhorn e2e agent note',
      additionalSubmission: { noteActions: 'Call' },
    }, {
      params: { jwtToken: bullhornJwtToken },
      headers: {
        'rc-account-id': 'e2e-bullhorn-hashed-account',
        'rc-extension-id': 'e2e-bullhorn-hashed-extension',
      },
    });

    expect(createLog.status).toBe(200);
    expect(createLog.data).toMatchObject({
      successful: true,
      logId: 801,
      returnMessage: {
        message: 'Call logged',
        messageType: 'success',
      },
    });
    expect(createdNoteBody).toMatchObject({
      personReference: {
        id: 701,
        personSubtype: 'Contact',
      },
      action: 'Call',
      externalID: bullhornSessionId,
      minutesSpent: 3,
    });
    expect(createdNoteBody.comments).toContain('Bullhorn e2e agent note');
    expect(createdNoteBody.comments).toContain('Call details');
    expect(pingCallLogScope.isDone()).toBe(true);
    expect(createNoteScope.isDone()).toBe(true);

    const persistedCallLog = await CallLogModel.findOne({
      where: { sessionId: bullhornSessionId, userId: bullhornUserId },
    });
    expect(persistedCallLog).toMatchObject({
      id: bullhornTelephonySessionId,
      sessionId: bullhornSessionId,
      extensionNumber: bullhornExtensionNumber,
      platform: bullhornPlatform,
      thirdPartyLogId: '801',
      userId: bullhornUserId,
      contactId: '701',
    });
    expect(nock.pendingMocks()).toEqual([]);
  });

  test('completes a Clio contact-to-call-log HTTP flow', async () => {
    const interfaces = await client.get('/implementedInterfaces', {
      params: { platform: clioPlatform },
    });
    expect(interfaces.status).toBe(200);
    expect(interfaces.data).toMatchObject({
      getAuthType: true,
      getOauthInfo: true,
      findContact: true,
      createCallLog: true,
      updateCallLog: true,
      getCallLog: true,
    });

    const contactSearchScope = nock(clioProviderBaseUrl)
      .get('/api/v4/contacts.json')
      .query(true)
      .reply(200, {
        data: [{
          id: 901,
          name: 'Clio Contact',
          type: 'Person',
          created_at: '2026-01-02T03:04:05Z',
          updated_at: '2026-01-02T04:04:05Z',
        }],
      }, rateLimitHeaders);

    const mattersScope = nock(clioProviderBaseUrl)
      .get('/api/v4/matters.json')
      .query(true)
      .reply(200, {
        data: [{
          id: 902,
          display_number: 'MAT-902',
          description: 'E2E Matter',
          status: 'Open',
        }],
      }, rateLimitHeaders);

    const relationshipsScope = nock(clioProviderBaseUrl)
      .get('/api/v4/relationships.json')
      .query(true)
      .reply(200, {
        data: [{
          matter: {
            id: 903,
            display_number: 'MAT-903',
            description: 'Related E2E Matter',
            status: 'Open',
          },
        }],
      }, rateLimitHeaders);

    const contact = await client.get('/contact', {
      params: {
        jwtToken: clioJwtToken,
        phoneNumber: clioPhoneNumber,
        isExtension: 'false',
      },
    });

    expect(contact.status).toBe(200);
    expect(contact.data.successful).toBe(true);
    expect(contact.data.contact[0]).toMatchObject({
      id: 901,
      name: 'Clio Contact',
      type: 'Person',
    });
    expect(contact.data.contact[0].additionalInfo.matters).toEqual([
      {
        const: 902,
        title: 'MAT-902',
        description: 'Open - E2E Matter',
        status: 'Open',
      },
      {
        const: 903,
        title: 'MAT-903',
        description: 'Open - Related E2E Matter',
        status: 'Open',
      },
    ]);
    expect(contactSearchScope.isDone()).toBe(true);
    expect(mattersScope.isDone()).toBe(true);
    expect(relationshipsScope.isDone()).toBe(true);

    const cachedContact = await AccountDataModel.findOne({
      where: {
        rcAccountId: clioRcAccountId,
        platformName: clioPlatform,
        dataKey: `contact-${clioPhoneNumber}`,
      },
    });
    expect(cachedContact.data[0].name).toBe('Clio Contact');

    const logInfo = {
      id: 'e2e-clio-call-id',
      sessionId: clioSessionId,
      telephonySessionId: clioTelephonySessionId,
      extensionNumber: clioExtensionNumber,
      direction: 'Outbound',
      from: {
        name: 'Clio Agent',
        phoneNumber: '+14155550003',
      },
      to: {
        name: 'Clio Contact',
        phoneNumber: clioPhoneNumber,
      },
      duration: 300,
      result: 'Completed',
      startTime: new Date('2026-01-02T03:04:05.000Z').getTime(),
      recording: {
        link: 'https://recordings.example.test/clio-e2e.wav',
      },
      customSubject: 'Clio E2E call subject',
    };

    let communicationBody;
    const createCommunicationScope = nock(clioProviderBaseUrl)
      .post('/api/v4/communications.json', body => {
        communicationBody = body;
        return true;
      })
      .reply(201, {
        data: {
          id: 1001,
        },
      }, rateLimitHeaders);

    const createLog = await client.post('/callLog', {
      logInfo,
      contactId: 901,
      contactName: 'Clio Contact',
      contactType: 'Person',
      note: 'Clio e2e agent note',
      additionalSubmission: { matters: 902 },
    }, {
      params: { jwtToken: clioJwtToken },
      headers: {
        'rc-account-id': 'e2e-clio-hashed-account',
        'rc-extension-id': 'e2e-clio-hashed-extension',
      },
    });

    expect(createLog.status).toBe(200);
    expect(createLog.data).toMatchObject({
      successful: true,
      logId: 1001,
      returnMessage: {
        message: 'Call logged',
        messageType: 'success',
      },
    });
    expect(communicationBody.data).toMatchObject({
      subject: 'Clio E2E call subject',
      type: 'PhoneCommunication',
      senders: [{ id: '67890', type: 'User' }],
      receivers: [{ id: 901, type: 'Contact' }],
      matter: { id: 902 },
      notification_event_subscribers: [{ user_id: '67890' }],
    });
    expect(communicationBody.data.body).toContain('Clio e2e agent note');
    expect(communicationBody.data.body).toContain('Duration: 5 minutes');
    expect(communicationBody.data.body).toContain('Call recording link');
    expect(createCommunicationScope.isDone()).toBe(true);

    const persistedCallLog = await CallLogModel.findOne({
      where: { sessionId: clioSessionId, userId: clioUserId },
    });
    expect(persistedCallLog).toMatchObject({
      id: clioTelephonySessionId,
      sessionId: clioSessionId,
      extensionNumber: clioExtensionNumber,
      platform: clioPlatform,
      thirdPartyLogId: '1001',
      userId: clioUserId,
      contactId: '901',
    });
    expect(nock.pendingMocks()).toEqual([]);
  });

  test('rejects core CRM routes without a valid user session before provider calls', async () => {
    const contact = await client.get('/contact', {
      params: { phoneNumber },
    });

    expect(contact.status).toBe(400);
    expect(contact.data).toBe('Please go to Settings and authorize CRM platform');

    const callLog = await client.post('/callLog', {
      logInfo: {
        sessionId: 'missing-session-token',
      },
      contactId: 101,
    });

    expect(callLog.status).toBe(400);
    expect(callLog.data).toBe('Please go to Settings and authorize CRM platform');

    const messageLog = await client.post('/messageLog', {
      logInfo: {
        messages: [],
        correspondents: [],
      },
      contactId: 101,
    });

    expect(messageLog.status).toBe(400);
    expect(messageLog.data).toBe('Please go to Settings and authorize CRM platform');
    expect(nock.pendingMocks()).toEqual([]);
  });

  test('serves cached contact results and refreshes account contact data when forced', async () => {
    nock(providerBaseUrl)
      .get('/api/v2/persons/search')
      .query({ term: '4155551234', fields: 'phone' })
      .reply(200, {
        data: {
          items: [{
            item: {
              id: 101,
              name: 'John Doe',
              phone: phoneNumber,
              organization: { name: 'E2E Org' },
              update_time: '2026-01-02T03:04:05Z',
            },
          }],
        },
      }, rateLimitHeaders);

    nock(providerBaseUrl)
      .get('/api/v2/deals')
      .query({ person_id: '101', status: 'open' })
      .reply(200, { data: [{ id: 201, title: 'E2E Deal' }] }, rateLimitHeaders);

    nock(providerBaseUrl)
      .get('/v1/leads')
      .query({ person_id: '101' })
      .reply(200, { data: [] }, rateLimitHeaders);

    const firstLookup = await client.get('/contact', {
      params: {
        jwtToken,
        phoneNumber,
        isExtension: 'false',
      },
    });

    expect(firstLookup.status).toBe(200);
    expect(firstLookup.data.successful).toBe(true);
    expect(firstLookup.data.contact[0].name).toBe('John Doe');
    expect(nock.pendingMocks()).toEqual([]);

    nock.cleanAll();

    const cachedLookup = await client.get('/contact', {
      params: {
        jwtToken,
        phoneNumber,
        isExtension: 'false',
      },
    });

    expect(cachedLookup.status).toBe(200);
    expect(cachedLookup.data.successful).toBe(true);
    expect(cachedLookup.data.contact[0].name).toBe('John Doe');

    nock(providerBaseUrl)
      .get('/api/v2/persons/search')
      .query({ term: '4155551234', fields: 'phone' })
      .reply(200, {
        data: {
          items: [{
            item: {
              id: 102,
              name: 'Jane Refresh',
              phone: phoneNumber,
              organization: { name: 'Refresh Org' },
              update_time: '2026-01-03T03:04:05Z',
            },
          }],
        },
      }, rateLimitHeaders);

    nock(providerBaseUrl)
      .get('/api/v2/deals')
      .query({ person_id: '102', status: 'open' })
      .reply(200, { data: [] }, rateLimitHeaders);

    nock(providerBaseUrl)
      .get('/v1/leads')
      .query({ person_id: '102' })
      .reply(200, { data: [{ id: 302, title: 'Refresh Lead' }] }, rateLimitHeaders);

    const refreshedLookup = await client.get('/contact', {
      params: {
        jwtToken,
        phoneNumber,
        isExtension: 'false',
        isForceRefreshAccountData: 'true',
      },
    });

    expect(refreshedLookup.status).toBe(200);
    expect(refreshedLookup.data.successful).toBe(true);
    expect(refreshedLookup.data.contact[0]).toMatchObject({
      id: 102,
      name: 'Jane Refresh',
      organization: 'Refresh Org',
    });

    const cachedContact = await AccountDataModel.findOne({
      where: {
        rcAccountId,
        platformName: platform,
        dataKey: `contact-${phoneNumber}`,
      },
    });
    expect(cachedContact.data[0].name).toBe('Jane Refresh');
    expect(nock.pendingMocks()).toEqual([]);
  });

  test('creates and appends a Pipedrive SMS message log over HTTP', async () => {
    const conversationId = 'e2e-conversation-1';
    const conversationLogId = 'e2e-conversation-log-1';

    nock(providerBaseUrl)
      .get('/v1/users/me')
      .reply(200, { data: { name: 'E2E Agent' } }, rateLimitHeaders);

    nock(providerBaseUrl)
      .get('/api/v2/persons/101')
      .reply(200, { data: { org_id: 201 } }, rateLimitHeaders);

    nock(providerBaseUrl)
      .get('/v1/activityTypes')
      .reply(200, {
        data: [
          { name: 'SMS', key_string: 'sms', active_flag: true },
          { name: 'Call', key_string: 'call', active_flag: true },
        ],
      }, rateLimitHeaders);

    let createdMessageActivityBody;
    nock(providerBaseUrl)
      .post('/api/v2/activities', body => {
        createdMessageActivityBody = body;
        return true;
      })
      .reply(201, { data: { id: 501 } }, rateLimitHeaders);

    const firstMessage = await client.post('/messageLog', {
      contactId: 101,
      contactName: 'John Doe',
      contactType: 'contact',
      additionalSubmission: { deals: 201 },
      logInfo: {
        conversationId,
        conversationLogId,
        correspondents: [{
          phoneNumber,
          name: 'John Doe',
        }],
        messages: [{
          id: 'e2e-message-1',
          type: 'SMS',
          direction: 'Inbound',
          creationTime: '2026-01-02T03:04:05.000Z',
          subject: 'First E2E SMS',
          from: {
            phoneNumber,
            name: 'John Doe',
          },
          to: [{
            phoneNumber: '+14155550001',
            name: 'E2E Agent',
          }],
        }],
      },
    }, {
      params: { jwtToken },
    });

    expect(firstMessage.status).toBe(200);
    expect(firstMessage.data).toMatchObject({
      successful: true,
      logIds: ['e2e-message-1'],
      returnMessage: {
        message: 'Message logged',
        messageType: 'success',
      },
    });
    expect(createdMessageActivityBody).toMatchObject({
      owner_id: 12345,
      subject: 'SMS conversation with John Doe - 26/01/02',
      deal_id: 201,
      org_id: 201,
      type: 'sms',
      participants: [{ person_id: 101, primary: true }],
    });
    expect(createdMessageActivityBody.note).toContain('First E2E SMS');
    expect(createdMessageActivityBody.note).toContain('Conversation(1 messages)');

    const persistedFirstMessage = await MessageLogModel.findByPk('e2e-message-1');
    expect(persistedFirstMessage).toMatchObject({
      platform,
      conversationId,
      conversationLogId,
      thirdPartyLogId: '501',
      userId,
    });

    nock('https://api.pipedrive.com')
      .get('/v1/users/me')
      .reply(200, { data: { name: 'E2E Agent' } }, rateLimitHeaders);

    nock(providerBaseUrl)
      .get('/api/v2/activities/501')
      .reply(200, {
        data: {
          id: 501,
          note: createdMessageActivityBody.note,
        },
      }, rateLimitHeaders);

    let patchedMessageActivityBody;
    nock(providerBaseUrl)
      .patch('/api/v2/activities/501', body => {
        patchedMessageActivityBody = body;
        return true;
      })
      .reply(200, { data: { id: 501 } }, rateLimitHeaders);

    const secondMessage = await client.post('/messageLog', {
      contactId: 101,
      contactName: 'John Doe',
      contactType: 'contact',
      additionalSubmission: { deals: 201 },
      logInfo: {
        conversationId,
        conversationLogId,
        correspondents: [{
          phoneNumber,
          name: 'John Doe',
        }],
        messages: [{
          id: 'e2e-message-2',
          type: 'SMS',
          direction: 'Outbound',
          creationTime: '2026-01-02T03:06:05.000Z',
          subject: 'Second E2E SMS',
          from: {
            phoneNumber: '+14155550001',
            name: 'E2E Agent',
          },
          to: [{
            phoneNumber,
            name: 'John Doe',
          }],
        }],
      },
    }, {
      params: { jwtToken },
    });

    expect(secondMessage.status).toBe(200);
    expect(secondMessage.data.successful).toBe(true);
    expect(secondMessage.data.logIds).toEqual(['e2e-message-2']);
    expect(patchedMessageActivityBody).toMatchObject({
      deal_id: 201,
    });
    expect(patchedMessageActivityBody.note).toContain('Conversation(2 messages)');
    expect(patchedMessageActivityBody.note).toContain('Second E2E SMS');

    const persistedSecondMessage = await MessageLogModel.findByPk('e2e-message-2');
    expect(persistedSecondMessage).toMatchObject({
      platform,
      conversationId,
      conversationLogId,
      thirdPartyLogId: '501',
      userId,
    });
    expect(nock.pendingMocks()).toEqual([]);
  });
});
