describe('backfillCallLogAiNotes', () => {
  function loadBackfill({
    checkAndRefreshAccessToken = jest.fn(),
    adminConfig = null,
    platformModule
  }: {
    checkAndRefreshAccessToken?: jest.Mock;
    adminConfig?: Record<string, unknown> | null;
    platformModule?: Record<string, unknown>;
  } = {}) {
    jest.resetModules();

    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };
    const getOauthInfo = jest.fn().mockResolvedValue({
      accessTokenUri: 'https://auth.bullhorn.example/oauth/token'
    });
    const resolvedPlatformModule = platformModule ?? { getOauthInfo };

    const AdminConfigModel = {
      findByPk: jest.fn().mockResolvedValue(adminConfig),
      update: jest.fn().mockResolvedValue([1])
    };
    jest.doMock('@app-connect/core/models/adminConfigModel', () => ({ AdminConfigModel }));
    jest.doMock('@app-connect/core/models/userModel', () => ({ UserModel: {} }));
    jest.doMock('@app-connect/core/models/callLogModel', () => ({ CallLogModel: {} }));
    jest.doMock('@app-connect/core/lib/util', () => ({ getHashValue: jest.fn() }));
    jest.doMock('@app-connect/core/lib/ringcentral', () => ({ RingCentral: jest.fn() }));
    jest.doMock('@app-connect/core/lib/logger', () => logger);
    jest.doMock('@app-connect/core/lib/oauth', () => ({
      getOAuthApp: jest.fn(() => ({})),
      checkAndRefreshAccessToken
    }));
    jest.doMock('@app-connect/core/connector/registry', () => ({
      registerConnector: jest.fn(),
      getConnector: jest.fn(() => resolvedPlatformModule)
    }));
    jest.doMock('../src/connectors/bullhorn', () => ({}));

    return {
      backfill: require('../src/backfillCallLogAiNotes'),
      AdminConfigModel,
      logger
    };
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('uses the first valid Bullhorn session regardless of the call-log owner', async () => {
    const secondUser = {
      id: 'second-user',
      platformAdditionalInfo: { tokenUrl: 'https://auth.bullhorn.example/oauth/token' }
    };
    const checkAndRefreshAccessToken = jest.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(secondUser);
    const { backfill } = loadBackfill({ checkAndRefreshAccessToken });
    const users = [
      {
        id: 'expired-user',
        platformAdditionalInfo: { tokenUrl: 'https://auth.bullhorn.example/oauth/token' }
      },
      secondUser,
      {
        id: 'unused-user',
        platformAdditionalInfo: { tokenUrl: 'https://auth.bullhorn.example/oauth/token' }
      }
    ];

    await expect(backfill.findBullhornExecutorUser(users)).resolves.toBe(secondUser);
    expect(checkAndRefreshAccessToken).toHaveBeenCalledTimes(2);
  });

  test('does not refresh again when a freshly issued RC token receives 401', async () => {
    const { backfill } = loadBackfill({
      adminConfig: {
        adminAccessToken: 'expired-access-token',
        adminRefreshToken: 'refresh-token',
        adminTokenExpiry: new Date(Date.now() - 1000)
      }
    });
    const rcSDK = {
      refreshToken: jest.fn().mockResolvedValue({
        access_token: 'fresh-access-token',
        refresh_token: 'fresh-refresh-token',
        expire_time: Date.now() + 60 * 60 * 1000
      })
    };
    const unauthorized = Object.assign(new Error('Unauthorized'), {
      response: { status: 401 }
    });
    const manager = await backfill.createAdminTokenManager({ rcSDK, rcAccountId: 'account' });

    await expect(manager.withAccessToken(jest.fn().mockRejectedValue(unauthorized)))
      .rejects.toThrow('Unauthorized');
    expect(rcSDK.refreshToken).toHaveBeenCalledTimes(1);
  });

  test('shares one RC refresh when concurrent requests reject the same stored token', async () => {
    const { backfill } = loadBackfill({
      adminConfig: {
        adminAccessToken: 'stored-access-token',
        adminRefreshToken: 'stored-refresh-token',
        adminTokenExpiry: new Date(Date.now() + 60 * 60 * 1000)
      }
    });
    const rcSDK = {
      refreshToken: jest.fn().mockResolvedValue({
        access_token: 'refreshed-access-token',
        refresh_token: 'refreshed-refresh-token',
        expire_time: Date.now() + 60 * 60 * 1000
      })
    };
    const unauthorized = Object.assign(new Error('Unauthorized'), {
      response: { status: 401 }
    });
    const operation = jest.fn((token) => (
      token === 'stored-access-token'
        ? Promise.reject(unauthorized)
        : Promise.resolve(token)
    ));
    const manager = await backfill.createAdminTokenManager({ rcSDK, rcAccountId: 'account' });

    await expect(Promise.all([
      manager.withAccessToken(operation),
      manager.withAccessToken(operation)
    ])).resolves.toEqual(['refreshed-access-token', 'refreshed-access-token']);
    expect(rcSDK.refreshToken).toHaveBeenCalledTimes(1);
  });

  test('builds a Bullhorn HTML patch whenever RC has AI note data', () => {
    const { backfill } = loadBackfill();
    const patch = backfill.buildAiPatch({
      rcAiNotes: {
        callNote: {
          content: '<p><strong>Customer requested a follow-up.</strong></p>'
        },
        callTranscripts: {
          context: {
            participants: [
              { participantId: 'agent', extensionId: '101', name: 'Fallback agent' },
              { participantId: 'customer', name: 'Customer' }
            ]
          },
          transcripts: [
            { participantId: 'agent', text: 'I will follow up.' },
            { participantId: 'customer', text: 'Thank you.' }
          ]
        }
      },
      rcRecord: {
        from: { extensionId: '101', name: 'Alice' },
        to: { phoneNumber: '+16505550100' }
      },
      existingBody: '<div>Existing call details</div>'
    });

    expect(patch.wouldPatch).toBe(true);
    expect(patch.wouldPatchAiNote).toBe(true);
    expect(patch.wouldPatchTranscript).toBe(true);
    expect(patch.patchedBody).toContain('<b>AI Note</b>');
    expect(patch.patchedBody).toContain('**Customer requested a follow-up.**');
    expect(patch.patchedBody).toContain('<b>Transcript</b>');
    expect(patch.patchedBody).toContain('Alice: I will follow up.');

    const replacementPatch = backfill.buildAiPatch({
      rcAiNotes: {
        callNote: { content: '<p>Updated RC note.</p>' },
        callTranscripts: {
          context: { participants: [] },
          transcripts: []
        }
      },
      rcRecord: {},
      existingBody: patch.patchedBody
    });
    expect(replacementPatch.wouldPatch).toBe(true);
    expect(replacementPatch.wouldPatchAiNote).toBe(true);
    expect(replacementPatch.patchedBody).toContain('Updated RC note.');
    expect(replacementPatch.patchedBody).not.toContain('Customer requested a follow-up.');
    expect(replacementPatch.patchedBody).toContain('Alice: I will follow up.');

    const emptyPatch = backfill.buildAiPatch({
      rcAiNotes: {},
      rcRecord: {},
      existingBody: patch.patchedBody
    });
    expect(emptyPatch.wouldPatch).toBe(false);
    expect(emptyPatch.patchedBody).toBe(patch.patchedBody);
  });

  test.each([
    ['dry-run', false],
    ['run', true]
  ])('%s mode computes the patch and writes only in run mode', async (mode, shouldWrite) => {
    const existingBody = '<div>Existing call details</div>';
    const getCallLog = jest.fn().mockResolvedValue({
      callLogInfo: {
        fullBody: existingBody,
        fullLogResponse: { comments: existingBody }
      }
    });
    const updateCallLog = jest.fn().mockResolvedValue({ updatedNote: 'updated' });
    const { backfill } = loadBackfill({
      platformModule: {
        getCallLog,
        updateCallLog
      }
    });
    const callLog = {
      id: 'telephony-session-1',
      thirdPartyLogId: 'bullhorn-note-1',
      userId: 'original-user',
      extensionNumber: '101'
    };
    const rcRecord = {
      from: { extensionId: '101', name: 'Alice', extensionNumber: '101' },
      to: { phoneNumber: '+16505550100' },
      legs: [{
        extension: { id: '101' },
        from: { extensionNumber: '101' }
      }]
    };
    const rcAiNotes = {
      callNote: { content: '<p>Patch this note.</p>' }
    };
    const rcSDK = {
      request: jest.fn().mockResolvedValue({
        json: jest.fn().mockResolvedValue(rcAiNotes)
      })
    };
    const adminTokenManager = {
      withAccessToken: jest.fn((operation) => operation('rc-access-token'))
    };
    const bullhornExecutorUser = { id: 'executor-user' };

    const summary = await backfill.processCallLog({
      callLog,
      rcRecordsBySessionId: new Map([[callLog.id, rcRecord]]),
      rcSDK,
      adminTokenManager,
      bullhornExecutorUser,
      mode
    });

    expect(summary.wouldPatch).toBe(true);
    expect(summary.patched).toBe(shouldWrite);
    expect(summary.bullhornExecutorUserId).toBe('executor-user');
    expect(updateCallLog).toHaveBeenCalledTimes(shouldWrite ? 1 : 0);
    if (shouldWrite) {
      expect(updateCallLog).toHaveBeenCalledWith(expect.objectContaining({
        user: bullhornExecutorUser,
        existingCallLog: callLog,
        isFromSSCL: false,
        composedLogDetails: expect.stringContaining('<b>AI Note</b>')
      }));
    }
  });
});

export {};
