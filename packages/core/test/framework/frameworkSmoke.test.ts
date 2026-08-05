const request = require('supertest');
const { createCoreApp, connectorRegistry } = require('../../index');
const jwt = require('../../lib/jwt');
const { LOG_DETAILS_FORMAT_TYPE } = require('../../lib/constants');
const { UserModel } = require('../../models/userModel');
const { CallLogModel } = require('../../models/callLogModel');
const { MessageLogModel } = require('../../models/messageLogModel');
const { AccountDataModel } = require('../../models/accountDataModel');

describe('Core Framework-level HTTP smoke', () => {
  const platform = 'frameworkTest';
  const userId = 'framework-e2e-user';
  const rcAccountId = 'framework-e2e-account';
  const rcUserNumber = '+14155550000';
  const phoneNumber = '+14155551234';

  let app;
  let jwtToken;
  let connector;

  function buildConnector(overrides = {}) {
    return {
      getAuthType: jest.fn().mockReturnValue('apiKey'),
      getBasicAuth: jest.fn(({ apiKey }) => `framework-basic-${apiKey}`),
      getLogFormatType: jest.fn().mockReturnValue(LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT),
      findContact: jest.fn().mockResolvedValue({
        successful: true,
        matchedContactInfo: [{
          id: 'contact-1',
          name: 'Framework Contact',
          phone: phoneNumber,
          type: 'Contact',
        }],
      }),
      createContact: jest.fn().mockResolvedValue({
        contactInfo: {
          id: 'created-contact-1',
          name: 'Created Framework Contact',
        },
        returnMessage: {
          message: 'Contact created.',
          messageType: 'success',
          ttl: 2000,
        },
      }),
      createCallLog: jest.fn().mockResolvedValue({
        logId: 'framework-call-log-1',
        returnMessage: {
          message: 'Call logged',
          messageType: 'success',
          ttl: 2000,
        },
        extraDataTracking: {},
      }),
      updateCallLog: jest.fn().mockResolvedValue({
        updatedNote: 'Updated framework note',
        returnMessage: {
          message: 'Call updated',
          messageType: 'success',
          ttl: 2000,
        },
        extraDataTracking: {},
      }),
      getCallLog: jest.fn().mockResolvedValue({
        callLogInfo: {
          subject: 'Framework call',
          note: 'Framework call body',
        },
        extraDataTracking: {},
      }),
      createMessageLog: jest.fn().mockResolvedValue({
        logId: 'framework-message-log-1',
        returnMessage: {
          message: 'Message logged',
          messageType: 'success',
          ttl: 2000,
        },
        extraDataTracking: {},
      }),
      updateMessageLog: jest.fn().mockResolvedValue({
        returnMessage: {
          message: 'Message logged',
          messageType: 'success',
          ttl: 2000,
        },
        extraDataTracking: {},
      }),
      ...overrides,
    };
  }

  async function seedUser() {
    await UserModel.create({
      id: userId,
      platform,
      rcAccountId,
      rcUserNumber,
      accessToken: 'framework-access-token',
      refreshToken: 'framework-refresh-token',
      tokenExpiry: new Date(Date.now() + 60 * 60 * 1000),
      timezoneOffset: '+00:00',
      platformAdditionalInfo: {},
      userSettings: {},
    });
    jwtToken = jwt.generateJwt({
      id: userId,
      platform,
      rcUserNumber,
    });
  }

  function buildCallLog(overrides = {}) {
    return {
      id: 'framework-call-id',
      sessionId: 'framework-session-1',
      telephonySessionId: 'framework-telephony-session-1',
      extensionNumber: '101',
      direction: 'Outbound',
      from: {
        name: 'Framework Agent',
        phoneNumber: rcUserNumber,
      },
      to: {
        name: 'Framework Contact',
        phoneNumber,
      },
      duration: 120,
      result: 'Completed',
      startTime: new Date('2026-01-02T03:04:05.000Z').getTime(),
      customSubject: 'Framework call subject',
      ...overrides,
    };
  }

  beforeAll(() => {
    app = createCoreApp({
      skipDatabaseInit: true,
      skipAnalyticsInit: true,
    });
  });

  beforeEach(async () => {
    connector = buildConnector();
    connectorRegistry.registerConnector(platform, connector);
    await CallLogModel.destroy({ where: {} });
    await MessageLogModel.destroy({ where: {} });
    await AccountDataModel.destroy({ where: {} });
    await UserModel.destroy({ where: {} });
    await seedUser();
  });

  afterEach(async () => {
    connectorRegistry.unregisterConnector(platform);
    await CallLogModel.destroy({ where: {} });
    await MessageLogModel.destroy({ where: {} });
    await AccountDataModel.destroy({ where: {} });
    await UserModel.destroy({ where: {} });
  });

  test('rejects core CRM routes without a valid user session before connector calls', async () => {
    const contact = await request(app)
      .get('/contact')
      .query({ phoneNumber });

    expect(contact.status).toBe(400);
    expect(contact.text).toBe('Please go to Settings and authorize CRM platform');

    const callLog = await request(app)
      .post('/callLog')
      .send({
        logInfo: {
          sessionId: 'missing-session-token',
        },
        contactId: 'contact-1',
      });

    expect(callLog.status).toBe(400);
    expect(callLog.text).toBe('Please go to Settings and authorize CRM platform');

    const messageLog = await request(app)
      .post('/messageLog')
      .send({
        logInfo: {
          messages: [],
          correspondents: [],
        },
        contactId: 'contact-1',
      });

    expect(messageLog.status).toBe(400);
    expect(messageLog.text).toBe('Please go to Settings and authorize CRM platform');
    expect(connector.findContact).not.toHaveBeenCalled();
    expect(connector.createCallLog).not.toHaveBeenCalled();
    expect(connector.createMessageLog).not.toHaveBeenCalled();
  });

  test('serves cached contact results and refreshes account contact data when forced', async () => {
    const firstContact = [{
      id: 'contact-1',
      name: 'Framework Contact',
      phone: phoneNumber,
      type: 'Contact',
    }];
    const refreshedContact = [{
      id: 'contact-2',
      name: 'Framework Refresh Contact',
      phone: phoneNumber,
      type: 'Lead',
    }];

    connector.findContact
      .mockResolvedValueOnce({
        successful: true,
        matchedContactInfo: firstContact,
      })
      .mockResolvedValueOnce({
        successful: true,
        matchedContactInfo: refreshedContact,
      });

    const firstLookup = await request(app)
      .get('/contact')
      .query({
        jwtToken,
        phoneNumber,
        isExtension: 'false',
      });

    expect(firstLookup.status).toBe(200);
    expect(firstLookup.body.successful).toBe(true);
    expect(firstLookup.body.contact).toEqual(firstContact);
    expect(connector.findContact).toHaveBeenCalledTimes(1);

    const cachedLookup = await request(app)
      .get('/contact')
      .query({
        jwtToken,
        phoneNumber,
        isExtension: 'false',
      });

    expect(cachedLookup.status).toBe(200);
    expect(cachedLookup.body.contact).toEqual(firstContact);
    expect(connector.findContact).toHaveBeenCalledTimes(1);

    const refreshedLookup = await request(app)
      .get('/contact')
      .query({
        jwtToken,
        phoneNumber,
        isExtension: 'false',
        isForceRefreshAccountData: 'true',
      });

    expect(refreshedLookup.status).toBe(200);
    expect(refreshedLookup.body.contact).toEqual(refreshedContact);
    expect(connector.findContact).toHaveBeenCalledTimes(2);

    const cachedContact = await AccountDataModel.findOne({
      where: {
        rcAccountId,
        platformName: platform,
        dataKey: `contact-${phoneNumber}`,
      },
    });
    expect(cachedContact.data).toEqual(refreshedContact);
  });

  test('supports a generic no-match to create-contact to call-log lifecycle', async () => {
    connector.findContact.mockResolvedValue({
      successful: true,
      matchedContactInfo: [{
        id: 'createNewContact',
        name: 'Create new contact...',
        additionalInfo: {},
        isNewContact: true,
      }],
    });
    connector.createContact.mockResolvedValue({
      contactInfo: {
        id: 'created-contact-1',
        name: 'Created Framework Contact',
      },
      returnMessage: {
        message: 'Contact created.',
        messageType: 'success',
        ttl: 2000,
      },
      extraDataTracking: {},
    });
    connector.createCallLog.mockResolvedValue({
      logId: 'framework-created-contact-call-log',
      returnMessage: {
        message: 'Call logged',
        messageType: 'success',
        ttl: 2000,
      },
      extraDataTracking: {},
    });

    const noMatch = await request(app)
      .get('/contact')
      .query({
        jwtToken,
        phoneNumber,
        isExtension: 'false',
      });

    expect(noMatch.status).toBe(200);
    expect(noMatch.body).toMatchObject({
      successful: true,
      returnMessage: {
        message: 'Contact not found',
        messageType: 'warning',
      },
    });
    expect(noMatch.body.contact[0]).toMatchObject({
      id: 'createNewContact',
      isNewContact: true,
    });

    const createContact = await request(app)
      .post('/contact')
      .query({ jwtToken })
      .send({
        phoneNumber,
        newContactName: 'Created Framework Contact',
        newContactType: 'Contact',
      });

    expect(createContact.status).toBe(200);
    expect(createContact.body).toMatchObject({
      successful: true,
      contact: {
        id: 'created-contact-1',
        name: 'Created Framework Contact',
      },
    });
    expect(connector.createContact).toHaveBeenCalledWith(expect.objectContaining({
      phoneNumber,
      newContactName: 'Created Framework Contact',
      newContactType: 'Contact',
    }));

    const createLog = await request(app)
      .post('/callLog')
      .query({ jwtToken })
      .set('rc-account-id', 'framework-hashed-account')
      .set('rc-extension-id', 'framework-hashed-extension')
      .send({
        logInfo: buildCallLog({
          sessionId: 'framework-created-contact-session',
          telephonySessionId: 'framework-created-contact-telephony-session',
          to: {
            name: 'Created Framework Contact',
            phoneNumber,
          },
        }),
        contactId: 'created-contact-1',
        contactName: 'Created Framework Contact',
        contactType: 'Contact',
        note: 'Framework lifecycle note',
      });

    expect(createLog.status).toBe(200);
    expect(createLog.body).toMatchObject({
      successful: true,
      logId: 'framework-created-contact-call-log',
    });
    expect(connector.createCallLog).toHaveBeenCalledWith(expect.objectContaining({
      contactInfo: expect.objectContaining({
        id: 'created-contact-1',
        name: 'Created Framework Contact',
      }),
      composedLogDetails: expect.stringContaining('Framework lifecycle note'),
    }));

    const persistedCallLog = await CallLogModel.findOne({
      where: {
        sessionId: 'framework-created-contact-session',
        userId,
      },
    });
    expect(persistedCallLog).toMatchObject({
      id: 'framework-created-contact-telephony-session',
      platform,
      thirdPartyLogId: 'framework-created-contact-call-log',
      contactId: 'created-contact-1',
    });
  });

  test('gets detailed call logs and updates persisted generic call logs', async () => {
    const getUpdateSessionId = 'framework-get-update-session';
    const getUpdateTelephonySessionId = 'framework-get-update-telephony-session';
    const getUpdateExtensionNumber = '202';
    const fullBody = '- Agent notes: Framework original note\n- Duration: 2 minutes\n';

    connector.createCallLog.mockResolvedValue({
      logId: 'framework-get-update-call-log',
      returnMessage: {
        message: 'Call logged',
        messageType: 'success',
        ttl: 2000,
      },
      extraDataTracking: {},
    });
    connector.getCallLog.mockResolvedValue({
      callLogInfo: {
        subject: 'Framework original subject',
        note: 'Framework original note',
        fullBody,
        fullLogResponse: {
          id: 'framework-get-update-call-log',
          body: fullBody,
        },
        contactName: 'Framework Contact',
        dispositions: {
          status: 'Open',
        },
      },
      extraDataTracking: {},
    });
    connector.updateCallLog.mockResolvedValue({
      updatedNote: 'Framework updated note body',
      returnMessage: {
        message: 'Call log updated.',
        messageType: 'success',
        ttl: 2000,
      },
      extraDataTracking: {},
    });

    const createLog = await request(app)
      .post('/callLog')
      .query({ jwtToken })
      .set('rc-account-id', 'framework-hashed-account')
      .set('rc-extension-id', 'framework-hashed-extension')
      .send({
        logInfo: buildCallLog({
          sessionId: getUpdateSessionId,
          telephonySessionId: getUpdateTelephonySessionId,
          extensionNumber: getUpdateExtensionNumber,
        }),
        contactId: 'contact-1',
        contactName: 'Framework Contact',
        contactType: 'Contact',
        note: 'Framework original note',
      });

    expect(createLog.status).toBe(200);
    expect(createLog.body).toMatchObject({
      successful: true,
      logId: 'framework-get-update-call-log',
    });

    const getLog = await request(app)
      .get('/callLog')
      .query({
        jwtToken,
        sessionIds: `${getUpdateSessionId},framework-missing-session`,
        extensionNumber: getUpdateExtensionNumber,
        requireDetails: 'true',
      });

    expect(getLog.status).toBe(200);
    expect(getLog.body).toMatchObject({
      successful: true,
      logs: [
        {
          sessionId: getUpdateSessionId,
          matched: true,
          logId: 'framework-get-update-call-log',
          logData: {
            subject: 'Framework original subject',
            note: 'Framework original note',
            contactName: 'Framework Contact',
            dispositions: {
              status: 'Open',
            },
          },
        },
        {
          sessionId: 'framework-missing-session',
          matched: false,
        },
      ],
    });
    expect(connector.getCallLog).toHaveBeenCalledWith(expect.objectContaining({
      callLogId: 'framework-get-update-call-log',
      contactId: 'contact-1',
      authHeader: 'Basic framework-basic-framework-access-token',
    }));

    const updateLog = await request(app)
      .patch('/callLog')
      .query({ jwtToken })
      .set('rc-account-id', 'framework-hashed-account')
      .set('rc-extension-id', 'framework-hashed-extension')
      .send({
        sessionId: getUpdateSessionId,
        extensionNumber: getUpdateExtensionNumber,
        subject: 'Framework updated subject',
        note: 'Framework updated note',
        startTime: new Date('2026-01-02T03:08:05.000Z').getTime(),
        duration: 240,
        result: 'Completed',
        direction: 'Outbound',
        from: {
          name: 'Framework Agent',
          phoneNumber: rcUserNumber,
        },
        to: {
          name: 'Framework Contact',
          phoneNumber,
        },
      });

    expect(updateLog.status).toBe(200);
    expect(updateLog.body).toMatchObject({
      successful: true,
      logId: 'framework-get-update-call-log',
      updatedNote: 'Framework updated note body',
      returnMessage: {
        message: 'Call log updated.',
        messageType: 'success',
      },
    });
    expect(connector.getCallLog).toHaveBeenCalledTimes(2);
    expect(connector.updateCallLog).toHaveBeenCalledWith(expect.objectContaining({
      existingCallLog: expect.objectContaining({
        id: getUpdateTelephonySessionId,
        sessionId: getUpdateSessionId,
        thirdPartyLogId: 'framework-get-update-call-log',
      }),
      subject: 'Framework updated subject',
      note: 'Framework updated note',
      composedLogDetails: expect.stringContaining('Framework updated note'),
      existingCallLogDetails: expect.objectContaining({
        id: 'framework-get-update-call-log',
      }),
    }));
  });

  test('creates and appends generic message logs using conversation persistence', async () => {
    connector.createMessageLog.mockResolvedValue({
      logId: 'framework-message-log-1',
      returnMessage: {
        message: 'Message logged',
        messageType: 'success',
        ttl: 2000,
      },
      extraDataTracking: {},
    });
    connector.updateMessageLog.mockResolvedValue({
      returnMessage: {
        message: 'Message logged',
        messageType: 'success',
        ttl: 2000,
      },
      extraDataTracking: {},
    });

    const firstMessage = await request(app)
      .post('/messageLog')
      .query({ jwtToken })
      .send({
        contactId: 'contact-1',
        contactName: 'Framework Contact',
        contactType: 'Contact',
        logInfo: {
          conversationId: 'framework-conversation-1',
          conversationLogId: 'framework-conversation-log-1',
          correspondents: [{
            phoneNumber,
            name: 'Framework Contact',
          }],
          messages: [{
            id: 'framework-message-1',
            type: 'SMS',
            direction: 'Inbound',
            creationTime: '2026-01-02T03:04:05.000Z',
            subject: 'First framework SMS',
            from: {
              phoneNumber,
              name: 'Framework Contact',
            },
            to: [{
              phoneNumber: rcUserNumber,
              name: 'Framework Agent',
            }],
          }],
        },
      });

    expect(firstMessage.status).toBe(200);
    expect(firstMessage.body).toMatchObject({
      successful: true,
      logIds: ['framework-message-1'],
    });
    expect(connector.createMessageLog).toHaveBeenCalledTimes(1);

    const persistedFirstMessage = await MessageLogModel.findByPk('framework-message-1');
    expect(persistedFirstMessage).toMatchObject({
      platform,
      conversationId: 'framework-conversation-1',
      conversationLogId: 'framework-conversation-log-1',
      thirdPartyLogId: 'framework-message-log-1',
      userId,
    });

    const secondMessage = await request(app)
      .post('/messageLog')
      .query({ jwtToken })
      .send({
        contactId: 'contact-1',
        contactName: 'Framework Contact',
        contactType: 'Contact',
        logInfo: {
          conversationId: 'framework-conversation-1',
          conversationLogId: 'framework-conversation-log-1',
          correspondents: [{
            phoneNumber,
            name: 'Framework Contact',
          }],
          messages: [{
            id: 'framework-message-2',
            type: 'SMS',
            direction: 'Outbound',
            creationTime: '2026-01-02T03:06:05.000Z',
            subject: 'Second framework SMS',
            from: {
              phoneNumber: rcUserNumber,
              name: 'Framework Agent',
            },
            to: [{
              phoneNumber,
              name: 'Framework Contact',
            }],
          }],
        },
      });

    expect(secondMessage.status).toBe(200);
    expect(secondMessage.body).toMatchObject({
      successful: true,
      logIds: ['framework-message-2'],
    });
    expect(connector.updateMessageLog).toHaveBeenCalledTimes(1);
    expect(connector.updateMessageLog).toHaveBeenCalledWith(expect.objectContaining({
      existingMessageLog: expect.objectContaining({
        id: 'framework-message-1',
        thirdPartyLogId: 'framework-message-log-1',
      }),
      message: expect.objectContaining({
        id: 'framework-message-2',
      }),
    }));

    const persistedSecondMessage = await MessageLogModel.findByPk('framework-message-2');
    expect(persistedSecondMessage).toMatchObject({
      platform,
      conversationId: 'framework-conversation-1',
      conversationLogId: 'framework-conversation-log-1',
      thirdPartyLogId: 'framework-message-log-1',
      userId,
    });
  });
});

export {};
