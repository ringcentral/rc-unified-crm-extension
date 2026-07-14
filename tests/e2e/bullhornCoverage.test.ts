const http = require('http');
const nock = require('nock');
const jwt = require('@app-connect/core/lib/jwt');
const { UserModel } = require('@app-connect/core/models/userModel');
const { MessageLogModel } = require('@app-connect/core/models/messageLogModel');
const { AdminConfigModel } = require('@app-connect/core/models/adminConfigModel');
const { AccountDataModel } = require('@app-connect/core/models/accountDataModel');
const { getHashValue } = require('@app-connect/core/lib/util');
const {
  startServer,
  stopServer,
  cleanE2EData,
  generateJwt,
} = require('./support/serverHarness');
const {
  bullhornCoverageCases,
  buildBullhornMessageLogRequest,
} = require('./support/bullhornCoverageCases');

describe('Bullhorn connector App-level E2E coverage', () => {
  const {
    identity,
    provider,
    contact,
    contacts,
    conversation,
    messages,
    appointments,
    userMapping,
    oauth,
    commentActions,
  } = bullhornCoverageCases;
  const hashedRcAccountId = getHashValue(
    identity.rcAccountId,
    process.env.HASH_KEY,
  );
  const environmentKeys = ['BULLHORN_CLIENT_ID', 'BULLHORN_CLIENT_SECRET'];
  const previousEnvironment = Object.fromEntries(
    environmentKeys.map(key => [key, process.env[key]]),
  );

  let server;
  let client;
  let jwtToken;
  let tokenApiServer;
  let tokenUrl;
  let tokenRequest;

  function requestConfig() {
    return {
      params: { jwtToken },
      headers: provider.requestHeaders,
    };
  }

  function restoreEnvironment() {
    for (const key of environmentKeys) {
      const value = previousEnvironment[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }

  async function startTokenApiServer() {
    tokenApiServer = http.createServer(async (request: any, response: any) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) {
        chunks.push(Buffer.from(chunk));
      }
      tokenRequest = {
        method: request.method,
        url: request.url,
        headers: request.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      };
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(oauth.tokenResponse));
    });
    await new Promise(resolve => tokenApiServer.listen(0, '127.0.0.1', resolve));
    const { port } = tokenApiServer.address();
    tokenUrl = `http://127.0.0.1:${port}${provider.tokenPath}`;
  }

  async function stopTokenApiServer() {
    if (!tokenApiServer) return;
    await new Promise((resolve, reject) => tokenApiServer.close((error: any) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(undefined);
    }));
  }

  async function cleanData() {
    await MessageLogModel.destroy({ where: { userId: identity.userId } });
    await AdminConfigModel.destroy({ where: { id: hashedRcAccountId } });
    await cleanE2EData({
      userIds: [identity.userId],
      rcAccountIds: [identity.rcAccountId],
    });
  }

  async function seedUser() {
    await UserModel.create({
      id: identity.userId,
      platform: identity.platform,
      hostname: provider.hostname,
      rcAccountId: identity.rcAccountId,
      rcUserNumber: identity.rcUserNumber,
      accessToken: identity.accessToken,
      refreshToken: identity.refreshToken,
      tokenExpiry: new Date(Date.now() + 60 * 60 * 1000),
      timezoneOffset: '+00:00',
      platformAdditionalInfo: {
        id: provider.corporateUserId,
        tokenUrl,
        restUrl: provider.restUrl,
        loginUrl: provider.apiBaseUrl,
        bhRestToken: provider.bhRestToken,
      },
      userSettings: {},
      hashedRcExtensionId: identity.hashedExtensionId,
    });
    jwtToken = generateJwt({
      id: identity.userId,
      platform: identity.platform,
      rcUserNumber: identity.rcUserNumber,
    });
  }

  function mockHealthySession(times = 1) {
    return nock(provider.restBaseUrl)
      .matchHeader('bhresttoken', provider.expectedBhRestToken)
      .get(`${provider.restPath}/ping`)
      .times(times)
      .reply(200, { sessionExpires: Date.now() + 60 * 60 * 1000 }, provider.rateLimitHeaders);
  }

  function mockCommentActions() {
    return nock(provider.restBaseUrl)
      .matchHeader('bhresttoken', provider.expectedBhRestToken)
      .get(`${provider.restPath}/settings/commentActionList`)
      .reply(200, { commentActionList: commentActions }, provider.rateLimitHeaders);
  }

  function mockContactSearch(entity, data, bodySink = null) {
    return nock(provider.restBaseUrl)
      .matchHeader('bhresttoken', provider.expectedBhRestToken)
      .post(`${provider.restPath}/search/${entity}`, body => {
        if (bodySink) bodySink(body);
        return true;
      })
      .query(true)
      .reply(200, { data }, provider.rateLimitHeaders);
  }

  function expectNoPendingExternalRequests(scopes) {
    for (const scope of scopes) {
      expect(scope.isDone()).toBe(true);
    }
    expect(nock.pendingMocks()).toEqual([]);
  }

  beforeAll(async () => {
    await startTokenApiServer();
    process.env.BULLHORN_CLIENT_ID = provider.clientId;
    process.env.BULLHORN_CLIENT_SECRET = provider.clientSecret;
    nock.disableNetConnect();
    nock.enableNetConnect('127.0.0.1');
    await MessageLogModel.sync();
    await AdminConfigModel.sync();
    ({ server, client } = await startServer());
  });

  afterAll(async () => {
    try {
      await cleanData();
    } finally {
      try {
        await stopServer(server);
      } finally {
        try {
          await stopTokenApiServer();
        } finally {
          restoreEnvironment();
          nock.cleanAll();
          nock.enableNetConnect();
        }
      }
    }
  });

  beforeEach(async () => {
    nock.cleanAll();
    tokenRequest = null;
    await cleanData();
    await seedUser();
  });

  afterEach(async () => {
    nock.cleanAll();
    await cleanData();
  });

  test('returns Bullhorn create-contact data when no CRM contact matches', async () => {
    const interfaces = await client.get('/implementedInterfaces', {
      params: { platform: identity.platform },
    });
    expect(interfaces.status).toBe(200);
    expect(interfaces.data).toMatchObject({
      findContact: true,
      createContact: true,
      createMessageLog: true,
      updateMessageLog: true,
      getUserList: true,
      listAppointments: true,
      createAppointment: true,
      updateAppointment: true,
      refreshAppointment: true,
      confirmAppointment: false,
      cancelAppointment: true,
    });

    const searchBodies: Record<string, any> = {};
    const scopes = [
      mockHealthySession(),
      mockCommentActions(),
      mockContactSearch('ClientContact', [], body => { searchBodies.ClientContact = body; }),
      mockContactSearch('Candidate', [], body => { searchBodies.Candidate = body; }),
      mockContactSearch('Lead', [], body => { searchBodies.Lead = body; }),
    ];
    const statusMetadata = [
      ['Lead', 'New', 'New'],
      ['Candidate', 'Submitted', 'Submitted'],
      ['ClientContact', 'Active', 'Active'],
    ];
    for (const [entity, value, label] of statusMetadata) {
      scopes.push(
        nock(provider.restBaseUrl)
          .matchHeader('bhresttoken', provider.expectedBhRestToken)
          .get(`${provider.restPath}/meta/${entity}`)
          .query({ fields: 'status' })
          .reply(200, {
            fields: [{ name: 'status', options: [{ value, label }] }],
          }, provider.rateLimitHeaders),
      );
    }

    const response = await client.get('/contact', {
      ...requestConfig(),
      params: {
        jwtToken,
        phoneNumber: contacts.unmatched.phoneNumber,
        isExtension: 'false',
      },
    });

    expect(response.status).toBe(200);
    expect(response.data).toMatchObject({
      successful: true,
      returnMessage: {
        message: 'Contact not found',
        messageType: 'warning',
      },
      contact: [{
        id: 'createNewContact',
        name: 'Create new contact...',
        isNewContact: true,
        defaultContactType: 'Lead',
        additionalInfo: {
          Lead: { status: contacts.unmatched.statuses.Lead },
          Candidate: { status: contacts.unmatched.statuses.Candidate },
          Contact: { status: contacts.unmatched.statuses.Contact },
          noteActions: commentActions.map(action => ({ const: action, title: action })),
        },
      }],
    });
    expect(Object.values(searchBodies)).toHaveLength(3);
    for (const body of Object.values(searchBodies) as any[]) {
      expect(body.query).toContain('4155556010');
    }
    expectNoPendingExternalRequests(scopes);
  });

  test('returns all Bullhorn contact types when multiple CRM records match', async () => {
    const scenario = contacts.multiple;
    const scopes = [
      mockHealthySession(),
      mockCommentActions(),
      mockContactSearch('ClientContact', [scenario.crmResponses.Contact]),
      mockContactSearch('Candidate', [scenario.crmResponses.Candidate]),
      mockContactSearch('Lead', [scenario.crmResponses.Lead]),
    ];

    const response = await client.get('/contact', {
      ...requestConfig(),
      params: {
        jwtToken,
        phoneNumber: scenario.phoneNumber,
        isExtension: 'false',
      },
    });

    expect(response.status).toBe(200);
    expect(response.data.successful).toBe(true);
    expect(response.data.contact).toHaveLength(3);
    expect(response.data.contact).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 84641, name: 'Alex Client', type: 'Contact' }),
      expect.objectContaining({ id: 84642, name: 'Alex Candidate', type: 'Candidate' }),
      expect.objectContaining({ id: 84643, name: 'Alex Lead', type: 'Lead' }),
    ]));

    const cachedContacts = await AccountDataModel.findOne({
      where: {
        rcAccountId: identity.rcAccountId,
        platformName: identity.platform,
        dataKey: `contact-${scenario.phoneNumber}`,
      },
    });
    expect(cachedContacts.data).toHaveLength(3);
    expectNoPendingExternalRequests(scopes);
  });

  test('creates a Bullhorn Lead through the root contact endpoint', async () => {
    const scenario = contacts.create;
    let crmRequestBody;
    const scopes = [
      mockHealthySession(),
      mockCommentActions(),
      nock(provider.restBaseUrl)
        .matchHeader('bhresttoken', provider.expectedBhRestToken)
        .put(`${provider.restPath}/entity/Lead`, body => {
          crmRequestBody = body;
          return true;
        })
        .reply(200, { changedEntityId: scenario.crmId }, provider.rateLimitHeaders),
    ];

    const response = await client.post(
      '/contact',
      scenario.appRequestBody,
      requestConfig(),
    );

    expect(response.status).toBe(200);
    expect(response.data).toMatchObject({
      successful: true,
      contact: {
        id: scenario.crmId,
        name: scenario.appRequestBody.newContactName,
        additionalInfo: {
          noteActions: commentActions.map(action => ({ const: action, title: action })),
        },
      },
      returnMessage: {
        message: 'Lead created.',
        messageType: 'success',
      },
    });
    expect(crmRequestBody).toEqual(scenario.expectedCrmRequestBody);
    expectNoPendingExternalRequests(scopes);
  });

  test('creates and updates one Bullhorn Note from RingCentral SMS records', async () => {
    const corporateUserPath = `${provider.restPath}/query/CorporateUser`;
    let createdNoteBody;
    const createScopes = [
      mockHealthySession(),
      nock(provider.restBaseUrl)
        .matchHeader('bhresttoken', provider.expectedBhRestToken)
        .get(corporateUserPath)
        .query({
          fields: 'id,name',
          where: `masterUserID=${identity.userId.replace('-bullhorn', '')}`,
        })
        .reply(200, {
          data: [{ id: provider.corporateUserId, name: identity.agentName }],
        }, provider.rateLimitHeaders),
      nock(provider.restBaseUrl)
        .matchHeader('bhresttoken', provider.expectedBhRestToken)
        .put(`${provider.restPath}/entity/Note`, body => {
          createdNoteBody = body;
          return true;
        })
        .reply(200, { changedEntityId: conversation.noteId }, provider.rateLimitHeaders),
    ];

    const createResponse = await client.post(
      '/messageLog',
      buildBullhornMessageLogRequest([messages.inbound]),
      requestConfig(),
    );

    expect(createResponse.status).toBe(200);
    expect(createResponse.data).toMatchObject({
      successful: true,
      logIds: [messages.inbound.id],
      returnMessage: {
        message: 'Message logged',
        messageType: 'success',
      },
    });
    expect(createdNoteBody).toMatchObject({
      action: 'SMS',
      personReference: { id: contact.id, personSubtype: contact.type },
      dateAdded: messages.inbound.creationTime,
    });
    expect(createdNoteBody.comments).toContain('Conversation(1 messages)');
    expect(createdNoteBody.comments).toContain(messages.inbound.subject);
    expectNoPendingExternalRequests(createScopes);

    const persistedCreate = await MessageLogModel.findByPk(messages.inbound.id);
    expect(persistedCreate).toMatchObject({
      id: messages.inbound.id,
      platform: identity.platform,
      conversationId: conversation.id,
      conversationLogId: conversation.logId,
      thirdPartyLogId: String(conversation.noteId),
      userId: identity.userId,
    });

    let updatedNoteBody;
    const updateScopes = [
      mockHealthySession(),
      nock(provider.restBaseUrl)
        .matchHeader('bhresttoken', provider.expectedBhRestToken)
        .get(corporateUserPath)
        .query({
          fields: 'id,name',
          where: `masterUserID=${identity.userId.replace('-bullhorn', '')}`,
        })
        .reply(200, {
          data: [{ id: provider.corporateUserId, name: identity.agentName }],
        }, provider.rateLimitHeaders),
      nock(provider.restBaseUrl)
        .matchHeader('bhresttoken', provider.expectedBhRestToken)
        .get(`${provider.restPath}/entity/Note/${conversation.noteId}`)
        .query({ fields: 'id,comments' })
        .reply(200, {
          data: { id: conversation.noteId, comments: createdNoteBody.comments },
        }, provider.rateLimitHeaders),
      nock(provider.restBaseUrl)
        .matchHeader('bhresttoken', provider.expectedBhRestToken)
        .post(`${provider.restPath}/entity/Note/${conversation.noteId}`, body => {
          updatedNoteBody = body;
          return true;
        })
        .reply(200, { changedEntityId: conversation.noteId }, provider.rateLimitHeaders),
    ];

    const updateResponse = await client.post(
      '/messageLog',
      buildBullhornMessageLogRequest([messages.outbound, messages.inbound]),
      requestConfig(),
    );

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.data).toMatchObject({
      successful: true,
      logIds: [messages.outbound.id],
    });
    expect(updatedNoteBody).toMatchObject({ dateAdded: messages.outbound.creationTime });
    expect(updatedNoteBody.comments).toContain('Conversation(2 messages)');
    expect(updatedNoteBody.comments).toContain(messages.inbound.subject);
    expect(updatedNoteBody.comments).toContain(messages.outbound.subject);
    expectNoPendingExternalRequests(updateScopes);

    const persistedLogs = await MessageLogModel.findAll({
      where: { userId: identity.userId, conversationLogId: conversation.logId },
    });
    expect(persistedLogs).toHaveLength(2);
    expect(persistedLogs.map(log => log.thirdPartyLogId)).toEqual([
      String(conversation.noteId),
      String(conversation.noteId),
    ]);
  });

  test('lists Bullhorn appointments and resolves their attendee links', async () => {
    const scenario = appointments.list;
    let appointmentQuery;
    let attendeeQuery;
    const scopes = [
      mockHealthySession(),
      nock(provider.restBaseUrl)
        .matchHeader('bhresttoken', provider.expectedBhRestToken)
        .get(`${provider.restPath}/query/Appointment`)
        .query(query => {
          appointmentQuery = query;
          return true;
        })
        .reply(200, scenario.crmResponse, provider.rateLimitHeaders),
      nock(provider.restBaseUrl)
        .matchHeader('bhresttoken', provider.expectedBhRestToken)
        .get(`${provider.restPath}/query/AppointmentAttendee`)
        .query(query => {
          attendeeQuery = query;
          return true;
        })
        .reply(200, scenario.attendeeCrmResponse, provider.rateLimitHeaders),
    ];

    const response = await client.get('/appointments', {
      ...requestConfig(),
      params: { jwtToken, ...scenario.appRequestQuery },
    });

    expect(response.status).toBe(200);
    expect(response.data).toEqual(scenario.expectedResponse);
    expect(appointmentQuery).toMatchObject({
      fields: 'id,subject,description,dateBegin,dateEnd,isDeleted,candidateReference,clientContactReference,lead',
      where: `isDeleted=false AND owner.id=${provider.corporateUserId} AND dateBegin>=${Date.parse('2026-07-01T00:00:00.000Z')} AND dateBegin<=${Date.parse('2026-07-31T23:59:59.999Z')}`,
      start: '0',
      count: '20',
      orderBy: 'dateBegin',
    });
    expect(attendeeQuery).toMatchObject({
      fields: 'id,appointment(id),attendee(id),acceptanceStatus',
      where: 'appointment.id IN (84681)',
      start: '0',
      count: '2000',
    });
    expectNoPendingExternalRequests(scopes);
  });

  test('creates a Bullhorn appointment and de-duplicates attendee links', async () => {
    const scenario = appointments.create;
    let appointmentBody;
    const attendeeBodies = [];
    const scopes = [
      mockHealthySession(),
      nock(provider.restBaseUrl)
        .matchHeader('bhresttoken', provider.expectedBhRestToken)
        .put(`${provider.restPath}/entity/Appointment`, body => {
          appointmentBody = body;
          return true;
        })
        .reply(200, { changedEntityId: Number(scenario.appointmentId) }, provider.rateLimitHeaders),
      nock(provider.restBaseUrl)
        .matchHeader('bhresttoken', provider.expectedBhRestToken)
        .put(`${provider.restPath}/entity/AppointmentAttendee`, body => {
          attendeeBodies.push(body);
          return true;
        })
        .times(2)
        .reply(200, { changedEntityId: 84692 }, provider.rateLimitHeaders),
    ];

    const response = await client.post(
      '/appointments',
      scenario.appRequestBody,
      requestConfig(),
    );

    expect(response.status).toBe(200);
    expect(response.data).toEqual({
      successful: true,
      appointmentId: scenario.appointmentId,
    });
    expect(appointmentBody).toEqual(scenario.expectedCrmRequestBody);
    expect(attendeeBodies).toEqual(scenario.expectedAttendeeBodies);
    expectNoPendingExternalRequests(scopes);
  });

  test('updates and normalizes a Bullhorn appointment', async () => {
    const scenario = appointments.update;
    let updateBody;
    let refreshQuery;
    const scopes = [
      mockHealthySession(),
      nock(provider.restBaseUrl)
        .matchHeader('bhresttoken', provider.expectedBhRestToken)
        .post(`${provider.restPath}/entity/Appointment/${scenario.appointmentId}`, body => {
          updateBody = body;
          return true;
        })
        .reply(200, { changedEntityId: Number(scenario.appointmentId) }, provider.rateLimitHeaders),
      nock(provider.restBaseUrl)
        .matchHeader('bhresttoken', provider.expectedBhRestToken)
        .get(`${provider.restPath}/entity/Appointment/${scenario.appointmentId}`)
        .query(query => {
          refreshQuery = query;
          return true;
        })
        .reply(200, scenario.crmResponse, provider.rateLimitHeaders),
    ];

    const response = await client.patch(
      `/appointments/${scenario.appointmentId}`,
      scenario.appRequestBody,
      requestConfig(),
    );

    expect(response.status).toBe(200);
    expect(response.data).toMatchObject({
      successful: true,
      appointmentId: scenario.appointmentId,
      appointment: {
        id: scenario.appointmentId,
        thirdPartyAppointmentId: scenario.appointmentId,
        title: 'Updated candidate interview',
        description: 'Technical interview panel',
        startTimeUtc: '2026-07-23T17:00:00.000Z',
        durationMinutes: 60,
        status: 'scheduled',
        contactId: String(scenario.crmResponse.data.clientContactReference.id),
        contactType: 'ClientContact',
      },
    });
    expect(updateBody).toEqual(scenario.expectedCrmRequestBody);
    expect(refreshQuery).toEqual({
      fields: 'id,subject,description,dateBegin,dateEnd,isDeleted,candidateReference,clientContactReference',
    });
    expectNoPendingExternalRequests(scopes);
  });

  test('refreshes a Bullhorn appointment with its persisted attendee IDs', async () => {
    const scenario = appointments.refresh;
    let refreshQuery;
    const scopes = [
      mockHealthySession(),
      nock(provider.restBaseUrl)
        .matchHeader('bhresttoken', provider.expectedBhRestToken)
        .get(`${provider.restPath}/entity/Appointment/${scenario.appointmentId}`)
        .query(query => {
          refreshQuery = query;
          return true;
        })
        .reply(200, scenario.crmResponse, provider.rateLimitHeaders),
    ];

    const response = await client.get(
      `/appointments/${scenario.appointmentId}/refresh`,
      requestConfig(),
    );

    expect(response.status).toBe(200);
    expect(response.data).toMatchObject({
      successful: true,
      appointmentId: scenario.appointmentId,
      appointment: {
        id: scenario.appointmentId,
        title: 'Refreshed interview',
        description: 'Latest details from Bullhorn',
        startTimeUtc: '2026-07-24T18:00:00.000Z',
        durationMinutes: 20,
        status: 'scheduled',
        contactId: '84672',
        contactType: 'Lead',
        attendeeIds: ['84671', '84672'],
      },
    });
    expect(refreshQuery).toEqual({
      fields: 'id,subject,description,dateBegin,dateEnd,isDeleted,candidateReference,clientContactReference,lead,attendees',
    });
    expectNoPendingExternalRequests(scopes);
  });

  test('cancels a Bullhorn appointment and exposes confirmation as unsupported', async () => {
    const scenario = appointments.cancel;
    const interfaces = await client.get('/implementedInterfaces', {
      params: { platform: identity.platform },
    });
    expect(interfaces.data.confirmAppointment).toBe(false);
    expect(interfaces.data.cancelAppointment).toBe(true);

    let cancelBody;
    const scopes = [
      mockHealthySession(),
      nock(provider.restBaseUrl)
        .matchHeader('bhresttoken', provider.expectedBhRestToken)
        .post(`${provider.restPath}/entity/Appointment/${scenario.appointmentId}`, body => {
          cancelBody = body;
          return true;
        })
        .reply(200, { changedEntityId: Number(scenario.appointmentId) }, provider.rateLimitHeaders),
    ];

    const response = await client.post(
      `/appointments/${scenario.appointmentId}/cancel`,
      undefined,
      requestConfig(),
    );

    expect(response.status).toBe(200);
    expect(response.data).toEqual(scenario.expectedResponse);
    expect(cancelBody).toEqual({ isDeleted: true });
    expectNoPendingExternalRequests(scopes);
  });

  test('reads Bullhorn users and reinitializes persisted RingCentral user mappings', async () => {
    await AdminConfigModel.create({
      id: hashedRcAccountId,
      userMappings: userMapping.legacyPersistedMappings,
    });

    const ringCentralScope = nock('https://platform.ringcentral.com')
      .matchHeader('authorization', `Bearer ${identity.rcAccessToken}`)
      .get('/restapi/v1.0/account/~/extension/~')
      .times(2)
      .reply(200, {
        id: identity.rcExtensionId,
        account: { id: identity.rcAccountId },
        permissions: { admin: { enabled: true } },
      });
    const pingScope = mockHealthySession(2);
    const firstPageScope = nock(provider.restBaseUrl)
      .matchHeader('bhresttoken', provider.expectedBhRestToken)
      .get(`${provider.restPath}/query/CorporateUser`)
      .query({
        start: '0',
        fields: 'id,firstName,lastName,email',
        where: 'isDeleted=false',
      })
      .times(2)
      .reply(200, {
        start: 0,
        count: 1,
        data: [{
          id: userMapping.crmUser.id,
          firstName: 'Bailey',
          lastName: 'Recruiter',
          email: userMapping.crmUser.email,
        }],
      }, provider.rateLimitHeaders);
    const finalPageScope = nock(provider.restBaseUrl)
      .matchHeader('bhresttoken', provider.expectedBhRestToken)
      .get(`${provider.restPath}/query/CorporateUser`)
      .query({
        start: '1',
        fields: 'id,firstName,lastName,email',
        where: 'isDeleted=false',
      })
      .times(2)
      .reply(200, { start: 1, count: 0, data: [] }, provider.rateLimitHeaders);

    const readResponse = await client.post(
      '/admin/userMapping',
      userMapping.appRequestBody,
      requestConfig(),
    );
    expect(readResponse.status).toBe(200);
    expect(readResponse.data).toEqual(userMapping.expectedResult);

    const persistedAfterRead = await AdminConfigModel.findByPk(hashedRcAccountId);
    expect(persistedAfterRead.userMappings).toEqual([
      ...userMapping.legacyPersistedMappings,
      ...userMapping.expectedPersistedMappings,
    ]);

    const reinitializeResponse = await client.post(
      '/admin/reinitializeUserMapping',
      userMapping.appRequestBody,
      requestConfig(),
    );
    expect(reinitializeResponse.status).toBe(200);
    expect(reinitializeResponse.data).toEqual(userMapping.expectedResult);

    const persistedAfterReinitialize = await AdminConfigModel.findByPk(hashedRcAccountId);
    expect(persistedAfterReinitialize.userMappings).toEqual(
      userMapping.expectedPersistedMappings,
    );
    expectNoPendingExternalRequests([
      ringCentralScope,
      pingScope,
      firstPageScope,
      finalPageScope,
    ]);
  });

  test('completes the real Bullhorn OAuth exchange, login, and user session persistence', async () => {
    await cleanData();
    const state = new URLSearchParams({
      platform: identity.platform,
      hostname: provider.hostname,
    }).toString();
    const callbackUri = `${provider.redirectUri}?code=${provider.authorizationCode}&state=${encodeURIComponent(state)}`;
    const loginScope = nock(provider.apiBaseUrl)
      .post('/login')
      .query({ version: '2.0', access_token: identity.accessToken })
      .reply(200, oauth.loginResponse);
    let corporateUserQuery;
    const corporateUserScope = nock(provider.restBaseUrl)
      .get(`${provider.restPath}/query/CorporateUser`)
      .query(query => {
        corporateUserQuery = query;
        return true;
      })
      .reply(200, oauth.corporateUserResponse);
    const tokenExchangeStartedAt = Date.now();

    const response = await client.get('/oauth-callback', {
      params: {
        callbackUri,
        tokenUrl,
        apiUrl: provider.apiBaseUrl,
        username: oauth.username,
      },
      headers: {
        'rc-extension-id': identity.hashedExtensionId,
      },
    });

    expect(response.status).toBe(200);
    expect(response.data).toMatchObject({
      name: identity.agentName,
      returnMessage: {
        messageType: 'success',
        message: 'Connected to Bullhorn.',
      },
    });
    expect(response.data.jwtToken).toEqual(expect.any(String));
    expect(jwt.decodeJwt(response.data.jwtToken)).toMatchObject({
      id: identity.userId,
      platform: identity.platform,
    });
    expect(tokenRequest).not.toBeNull();
    expect(tokenRequest.method).toBe('POST');
    const parsedTokenRequest = new URL(tokenRequest.url, 'http://127.0.0.1');
    expect(parsedTokenRequest.pathname).toBe(provider.tokenPath);
    expect(Object.fromEntries(parsedTokenRequest.searchParams)).toMatchObject({
      grant_type: 'authorization_code',
      code: provider.authorizationCode,
      client_id: provider.clientId,
      client_secret: provider.clientSecret,
      redirect_uri: provider.redirectUri,
    });
    expect(tokenRequest.headers.authorization ?? '').toBe('');
    expect(corporateUserQuery).toMatchObject({
      fields: 'id,name,timeZoneOffsetEST,masterUserID',
      BhRestToken: provider.bhRestToken,
      where: `username='${oauth.username}'`,
    });

    const persistedUser = await UserModel.findByPk(identity.userId);
    expect(persistedUser).not.toBeNull();
    const persistedData = persistedUser.toJSON();
    expect(persistedData).toMatchObject({
      id: identity.userId,
      platform: identity.platform,
      hostname: provider.hostname,
      accessToken: identity.accessToken,
      refreshToken: identity.refreshToken,
      hashedRcExtensionId: identity.hashedExtensionId,
      timezoneOffset: '0',
      platformAdditionalInfo: {
        id: provider.corporateUserId,
        tokenUrl,
        restUrl: provider.restUrl,
        loginUrl: provider.apiBaseUrl,
        bhRestToken: provider.bhRestToken,
      },
      userSettings: {},
    });
    expect(persistedData.tokenExpiry).toBeInstanceOf(Date);
    expect(persistedData.tokenExpiry.getTime()).toBeGreaterThan(
      tokenExchangeStartedAt + 7190 * 1000,
    );
    expect(loginScope.isDone()).toBe(true);
    expect(corporateUserScope.isDone()).toBe(true);
    expect(nock.pendingMocks()).toEqual([]);
  });
});

export {};
