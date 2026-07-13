const express = require('express');
const request = require('supertest');

jest.mock('../../handlers/log', () => ({
  saveNoteCache: jest.fn(),
  getCallLog: jest.fn(),
  createCallLog: jest.fn(),
  updateCallLog: jest.fn(),
  createMessageLog: jest.fn(),
  handleAsyncPluginCallback: jest.fn(),
}));
jest.mock('../../handlers/contact', () => ({
  findContact: jest.fn(),
  createContact: jest.fn(),
  findContactWithName: jest.fn(),
}));
jest.mock('../../handlers/appointment', () => ({
  listAppointments: jest.fn(),
  createAppointment: jest.fn(),
  updateAppointment: jest.fn(),
  refreshAppointment: jest.fn(),
  confirmAppointment: jest.fn(),
  cancelAppointment: jest.fn(),
}));
jest.mock('../../handlers/auth', () => ({
  getLicenseStatus: jest.fn(),
  authValidation: jest.fn(),
  onOAuthCallback: jest.fn(),
  onApiKeyLogin: jest.fn(),
  onRingcentralOAuthCallback: jest.fn(),
}));
jest.mock('../../handlers/admin', () => ({
  validateRcUserToken: jest.fn(),
  validateAdminRole: jest.fn(),
  upsertAdminSettings: jest.fn(),
  getAdminSettings: jest.fn(),
  getUserMapping: jest.fn(),
  reinitializeUserMapping: jest.fn(),
  getServerLoggingSettings: jest.fn(),
  updateServerLoggingSettings: jest.fn(),
  getAdminReport: jest.fn(),
  getUserReport: jest.fn(),
}));
jest.mock('../../handlers/user', () => ({
  getUserSettingsByAdmin: jest.fn(),
  refreshUserInfo: jest.fn(),
  getUserSettings: jest.fn(),
  updateUserSettings: jest.fn(),
}));
jest.mock('../../handlers/disposition', () => ({
  upsertCallDisposition: jest.fn(),
}));
jest.mock('../../handlers/calldown', () => ({
  schedule: jest.fn(),
  list: jest.fn(),
  remove: jest.fn(),
  update: jest.fn(),
}));
jest.mock('../../handlers/plugin', () => ({
  registerPluginAccount: jest.fn(),
  unregisterPluginAccount: jest.fn(),
  getPluginLicenseStatus: jest.fn(),
}));
jest.mock('../../handlers/managedAuth', () => ({
  getManagedAuthState: jest.fn(),
  getManagedAuthAdminSettings: jest.fn(),
  upsertUserManagedAuthValues: jest.fn(),
  upsertOrgManagedAuthValues: jest.fn(),
}));
jest.mock('../../handlers/managedOAuth', () => ({
  getManagedOAuthState: jest.fn(),
  upsertPendingManagedOAuth: jest.fn(),
  clearPendingManagedOAuth: jest.fn(),
  resetManagedOAuth: jest.fn(),
}));
jest.mock('../../connector/mock', () => ({
  createUser: jest.fn(),
  deleteUser: jest.fn(),
  getCallLog: jest.fn(),
  createCallLog: jest.fn(),
  cleanUpMockLogs: jest.fn(),
}));
jest.mock('../../connector/registry', () => ({
  getManifest: jest.fn(),
  getReleaseNotes: jest.fn(),
  getConnector: jest.fn(),
}));
jest.mock('../../lib/analytics', () => ({
  init: jest.fn(),
  track: jest.fn(),
}));
jest.mock('../../lib/jwt', () => ({
  decodeJwt: jest.fn(),
  generateJwt: jest.fn(),
}));
jest.mock('../../lib/util', () => ({
  getHashValue: jest.fn((value) => `hash-${value}`),
}));
jest.mock('../../lib/s3ErrorLogReport', () => ({
  getUploadUrl: jest.fn(),
}));
jest.mock('../../lib/authSession', () => ({
  updateAuthSession: jest.fn(),
}));
jest.mock('../../mcp/mcpHandler', () => ({
  handleMcpRequest: jest.fn((req, res) => res.status(200).json({ jsonrpc: '2.0', result: 'mcp-ok' })),
  handleWidgetToolCall: jest.fn((req, res) => res.status(200).json({ successful: true })),
}));
jest.mock('../../models/userModel', () => ({
  UserModel: {
    findByPk: jest.fn(),
  },
}));

const logCore = require('../../handlers/log');
const contactCore = require('../../handlers/contact');
const appointmentCore = require('../../handlers/appointment');
const authCore = require('../../handlers/auth');
const adminCore = require('../../handlers/admin');
const userCore = require('../../handlers/user');
const dispositionCore = require('../../handlers/disposition');
const calldown = require('../../handlers/calldown');
const pluginCore = require('../../handlers/plugin');
const managedAuthCore = require('../../handlers/managedAuth');
const managedOAuthCore = require('../../handlers/managedOAuth');
const mockConnector = require('../../connector/mock');
const connectorRegistry = require('../../connector/registry');
const analytics = require('../../lib/analytics');
const jwt = require('../../lib/jwt');
const s3ErrorLogReport = require('../../lib/s3ErrorLogReport');
const { updateAuthSession } = require('../../lib/authSession');
const mcpHandler = require('../../mcp/mcpHandler');
const { UserModel } = require('../../models/userModel');
const {
  AdminManagedOAuthCacheRequestSchema,
  AdminSettingsUpdateRequestSchema,
  AdminSuccessMessageSchema,
  AppointmentActionResponseSchema,
  AppointmentCreateRequestSchema,
  AppointmentCreateResponseSchema,
  AppointmentListResponseSchema,
  AppointmentPatchRequestSchema,
  AppointmentRecordResponseSchema,
  AppointmentStatusRequestSchema,
  ApiKeyLoginRequestSchema,
  ApiKeyLoginResponseSchema,
  AuthValidationResponseSchema,
  BasicMutationResponseSchema,
  CallLogMutationResponseSchema,
  DebugReportUrlResponseSchema,
  HealthResponseSchema,
  ManagedAuthStateResponseSchema,
  ManagedAuthAdminResponseSchema,
  ManagedAuthUpdateRequestSchema,
  ManagedOAuthStateResponseSchema,
  MessageLogResponseSchema,
  ReleaseNotesResponseSchema,
  ServerVersionInfoResponseSchema,
  UserSettingsEnvelopeSchema,
  UserSettingsSchema,
  UserSettingsUpdateRequestSchema,
} = require('../../contracts');
const {
  createCoreRouter,
  createCoreApp,
  createCoreMiddleware,
  initializeCore,
} = require('../../index');
const coreReleaseNotes = require('../../releaseNotes.json');

describe('Core router broad route coverage', () => {
  const decodedJwt = {
    id: 'user-1',
    platform: 'testCRM',
    exp: Math.floor(Date.now() / 1000) + 60 * 60,
  };
  const mockUser = {
    id: 'user-1',
    platform: 'testCRM',
    hostname: 'crm.example.com',
    rcAccountId: 'rc-account-1',
    userSettings: {},
  };
  let app;

  function authQuery() {
    return { jwtToken: 'valid-crm-jwt' };
  }

  function appointmentCreateBody() {
    return {
      payload: {
        title: 'Meet',
        summary: 'Discuss next steps',
        startTimeUtc: '2026-07-20T19:00:00.000Z',
        durationMinutes: 30,
      },
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.HASH_KEY = 'hash-key';
    process.env.APP_SERVER = 'https://app.example.com';
    process.env.RINGCENTRAL_SERVER = 'https://platform.example.com';
    process.env.RINGCENTRAL_CLIENT_ID = 'rc-client-id';
    process.env.RINGCENTRAL_CLIENT_SECRET = 'rc-client-secret';
    process.env.RINGCENTRAL_MCP_CLIENT_ID = 'rc-mcp-public-client-id';
    process.env.CHATGPT_VERIFICATION_CODE = 'verify-code';
    process.env.APP_SERVER_SECRET_KEY = 'secret-key';
    process.env.IS_PROD = 'false';

    jwt.decodeJwt.mockReturnValue(decodedJwt);
    jwt.generateJwt.mockReturnValue('generated-crm-jwt');
    UserModel.findByPk.mockResolvedValue(mockUser);
    connectorRegistry.getReleaseNotes.mockReturnValue({
      '1.0.0': {
        testCRM: [{ type: 'New', description: 'Connector note.' }],
      },
    });
    connectorRegistry.getManifest.mockReturnValue({
      author: { name: 'Test Author' },
      version: '1.0.0',
      platforms: {
        testCRM: {
          serverSideLogging: {
            url: 'https://logging.example.com',
          },
        },
      },
    });
    connectorRegistry.getConnector.mockReturnValue({
      getAuthType: jest.fn(() => 'oauth'),
      getOauthInfo: jest.fn(),
      getUserInfo: jest.fn(),
      createCallLog: jest.fn(),
      updateCallLog: jest.fn(),
      getCallLog: jest.fn(),
      createMessageLog: jest.fn(),
      updateMessageLog: jest.fn(),
      createContact: jest.fn(),
      findContact: jest.fn(),
      listAppointments: jest.fn(),
      createAppointment: jest.fn(),
      updateAppointment: jest.fn(),
      refreshAppointment: jest.fn(),
      confirmAppointment: jest.fn(),
      cancelAppointment: jest.fn(),
      unAuthorize: jest.fn().mockResolvedValue({
        returnMessage: {
          messageType: 'success',
          message: 'Disconnected',
        },
      }),
      upsertCallDisposition: jest.fn(),
      findContactWithName: jest.fn(),
      getUserList: jest.fn(),
      getLicenseStatus: jest.fn(),
      getLogFormatType: jest.fn(),
      refreshUserInfo: jest.fn(),
    });

    adminCore.validateRcUserToken.mockResolvedValue({
      rcAccountId: 'rc-account-1',
      rcExtensionId: 'rc-extension-1',
    });
    adminCore.validateAdminRole.mockResolvedValue({
      isValidated: true,
      rcAccountId: 'rc-account-1',
    });
    adminCore.upsertAdminSettings.mockResolvedValue();
    adminCore.getAdminSettings.mockResolvedValue({ userSettings: { theme: 'dark' } });
    adminCore.getUserMapping.mockResolvedValue({ users: ['mapped-user'] });
    adminCore.reinitializeUserMapping.mockResolvedValue({ users: ['remapped-user'] });
    adminCore.getServerLoggingSettings.mockResolvedValue({ enabled: true });
    adminCore.updateServerLoggingSettings.mockResolvedValue({
      successful: true,
      returnMessage: { messageType: 'success', message: 'Updated' },
    });
    adminCore.getAdminReport.mockResolvedValue({ rows: [{ id: 'admin-row' }] });
    adminCore.getUserReport.mockResolvedValue({ rows: [{ id: 'user-row' }] });

    managedAuthCore.getManagedAuthState.mockResolvedValue({
      hasManagedAuth: true,
      allRequiredFieldsSatisfied: true,
      visibleFieldConsts: ['apiKey'],
      missingRequiredFieldConsts: [],
      fallbackToManualAuth: false,
    });
    managedAuthCore.getManagedAuthAdminSettings.mockResolvedValue({
      hasManagedAuth: true,
      fields: [{ const: 'tenantId', managedScope: 'account' }],
      orgFields: [{ const: 'tenantId', managedScope: 'account' }],
      userFields: [],
      orgValues: { tenantId: { hasValue: true, value: 'tenant.example' } },
      userValues: [],
    });
    managedAuthCore.upsertUserManagedAuthValues.mockResolvedValue();
    managedAuthCore.upsertOrgManagedAuthValues.mockResolvedValue();
    managedOAuthCore.getManagedOAuthState.mockResolvedValue({
      isAdmin: true,
      hasAccountOAuth: true,
      hasPendingOAuth: false,
    });
    managedOAuthCore.upsertPendingManagedOAuth.mockResolvedValue();
    managedOAuthCore.clearPendingManagedOAuth.mockResolvedValue();
    managedOAuthCore.resetManagedOAuth.mockResolvedValue();

    authCore.getLicenseStatus.mockResolvedValue({ isLicenseValid: true });
    authCore.authValidation.mockResolvedValue({
      successful: true,
      returnMessage: { messageType: 'success', message: 'Valid' },
      failReason: '',
      status: 200,
    });
    authCore.onOAuthCallback.mockResolvedValue({
      userInfo: { id: 'user-1', name: 'CRM User' },
      returnMessage: { messageType: 'success', message: 'Connected' },
    });
    authCore.onApiKeyLogin.mockResolvedValue({
      userInfo: { id: 'user-1', name: 'CRM User' },
      returnMessage: { messageType: 'success', message: 'Connected' },
    });
    authCore.onRingcentralOAuthCallback.mockResolvedValue();

    userCore.getUserSettingsByAdmin.mockResolvedValue({
      userSettings: { theme: { value: 'dark', customizable: true } },
    });
    userCore.refreshUserInfo.mockResolvedValue({
      successful: true,
      returnMessage: { messageType: 'success', message: 'Refreshed' },
    });
    userCore.getUserSettings.mockResolvedValue({ timezone: { value: 'UTC', customizable: true } });
    userCore.updateUserSettings.mockResolvedValue({
      userSettings: { timezone: { value: 'UTC', customizable: true } },
    });

    contactCore.findContact.mockResolvedValue({
      successful: true,
      returnMessage: { messageType: 'success', message: 'Found' },
      contact: [{ id: 'contact-1', isNewContact: false }],
      extraDataTracking: { source: 'contact' },
    });
    contactCore.createContact.mockResolvedValue({
      successful: true,
      returnMessage: { messageType: 'success', message: 'Created' },
      contact: { id: 'contact-2' },
      extraDataTracking: { source: 'create-contact' },
    });
    contactCore.findContactWithName.mockResolvedValue({
      successful: true,
      returnMessage: { messageType: 'success', message: 'Found' },
      contact: [{ id: 'contact-3' }],
    });

    appointmentCore.listAppointments.mockResolvedValue({
      successful: true,
      appointments: [{ id: 'appt-1' }],
      extraDataTracking: { source: 'appointments' },
    });
    appointmentCore.createAppointment.mockResolvedValue({
      successful: true,
      appointmentId: 'appt-2',
      appointment: { id: 'appt-2' },
      returnMessage: { messageType: 'success', message: 'Created' },
      extraDataTracking: { source: 'create-appointment' },
    });
    appointmentCore.updateAppointment.mockResolvedValue({
      successful: true,
      appointment: { id: 'appt-2' },
      returnMessage: { messageType: 'success', message: 'Updated' },
    });
    appointmentCore.refreshAppointment.mockResolvedValue({
      successful: true,
      appointment: { id: 'appt-2' },
      returnMessage: { messageType: 'success', message: 'Refreshed' },
    });
    appointmentCore.confirmAppointment.mockResolvedValue({
      successful: true,
      appointment: { id: 'appt-2' },
      returnMessage: { messageType: 'success', message: 'Confirmed' },
    });
    appointmentCore.cancelAppointment.mockResolvedValue({
      successful: true,
      appointment: { id: 'appt-2' },
      returnMessage: { messageType: 'success', message: 'Cancelled' },
    });

    logCore.saveNoteCache.mockResolvedValue({
      successful: true,
      returnMessage: { messageType: 'success', message: 'Cached' },
      extraDataTracking: { cache: true },
    });
    logCore.getCallLog.mockResolvedValue({
      successful: true,
      logs: [{ sessionId: 'session-1' }],
      returnMessage: { messageType: 'success', message: 'Found' },
      extraDataTracking: { logs: 1 },
    });
    logCore.createCallLog.mockResolvedValue({
      successful: true,
      logId: 'log-1',
      returnMessage: { messageType: 'success', message: 'Logged' },
      extraDataTracking: { created: true },
    });
    logCore.updateCallLog.mockResolvedValue({
      successful: true,
      logId: 'log-1',
      updatedNote: 'updated',
      returnMessage: { messageType: 'success', message: 'Updated' },
      extraDataTracking: { updated: true },
    });
    logCore.createMessageLog.mockResolvedValue({
      successful: true,
      returnMessage: { messageType: 'success', message: 'Message logged' },
      logIds: ['msg-1'],
      extraDataTracking: { messages: 1 },
    });
    logCore.handleAsyncPluginCallback.mockResolvedValue({
      statusCode: 202,
      body: { successful: true },
    });

    dispositionCore.upsertCallDisposition.mockResolvedValue({
      successful: true,
      returnMessage: { messageType: 'success', message: 'Disposition saved' },
      extraDataTracking: { disposition: true },
    });
    calldown.schedule.mockResolvedValue({ id: 'calldown-1' });
    calldown.list.mockResolvedValue({ items: [{ id: 'calldown-1' }] });
    calldown.remove.mockResolvedValue();
    calldown.update.mockResolvedValue();
    pluginCore.registerPluginAccount.mockResolvedValue({ successful: true });
    pluginCore.unregisterPluginAccount.mockResolvedValue({ successful: true });
    pluginCore.getPluginLicenseStatus.mockResolvedValue({ licenseStatus: true });
    mockConnector.createUser.mockResolvedValue({ id: 'mockUser' });
    mockConnector.deleteUser.mockResolvedValue(true);
    mockConnector.getCallLog.mockResolvedValue([{ sessionId: 'session-1', matched: true }]);
    mockConnector.createCallLog.mockResolvedValue();
    mockConnector.cleanUpMockLogs.mockResolvedValue();
    s3ErrorLogReport.getUploadUrl.mockResolvedValue('https://upload.example.com/report');

    app = express();
    app.use(express.json());
    app.use('/', createCoreRouter());
  });

  afterEach(() => {
    delete process.env.IS_PROD;
    delete process.env.RINGCENTRAL_MCP_CLIENT_ID;
  });

  test('serves health, manifest, release, version, and implemented interface routes', async () => {
    const healthResponse = await request(app).get('/isAlive');
    expect(healthResponse).toMatchObject({ status: 200, text: 'OK' });
    expect(healthResponse.headers['content-type']).toMatch(/^text\/plain\b/);
    expect(() => HealthResponseSchema.parse(healthResponse.text)).not.toThrow();
    const releaseNotesResponse = await request(app).get('/releaseNotes');
    expect(releaseNotesResponse.status).toBe(200);
    expect(() => ReleaseNotesResponseSchema.parse(releaseNotesResponse.body)).not.toThrow();
    expect(releaseNotesResponse.body['1.0.0'].global).toEqual(coreReleaseNotes['1.0.0'].global);
    expect(releaseNotesResponse.body['1.0.0'].testCRM).toEqual([
      { type: 'New', description: 'Connector note.' },
    ]);
    const manifestResponse = await request(app)
      .get('/crmManifest')
      .query({ platformName: 'testCRM' });
    expect(manifestResponse.status).toBe(200);
    expect(manifestResponse.body.author.name).toBe('Test Author');
    const versionResponse = await request(app).get('/serverVersionInfo');
    expect(versionResponse.body).toEqual({ version: '1.0.0' });
    expect(() => ServerVersionInfoResponseSchema.parse(versionResponse.body)).not.toThrow();
    connectorRegistry.getManifest.mockReturnValueOnce(null);
    const unknownVersionResponse = await request(app).get('/serverVersionInfo');
    expect(unknownVersionResponse.body).toEqual({ version: 'unknown' });
    expect(() => ServerVersionInfoResponseSchema.parse(unknownVersionResponse.body)).not.toThrow();

    const interfacesResponse = await request(app)
      .get('/implementedInterfaces')
      .query({ platform: 'testCRM' });
    expect(interfacesResponse.status).toBe(200);
    expect(interfacesResponse.body.createCallLog).toBe(true);
  });

  test('applies local manifest URL overrides and rejects invalid manifests', async () => {
    process.env.OVERRIDE_APP_SERVER = 'https://local-app.example.com';
    process.env.OVERRIDE_SERVER_SIDE_LOGGING_SERVER = 'https://local-logging.example.com';

    const manifestResponse = await request(app)
      .get('/crmManifest')
      .query({ platformName: 'testCRM' });

    expect(manifestResponse.status).toBe(200);
    expect(manifestResponse.body.serverUrl).toBe('https://local-app.example.com');
    expect(manifestResponse.body.platforms.testCRM.serverSideLogging.url).toBe('https://local-logging.example.com');

    delete process.env.OVERRIDE_APP_SERVER;
    delete process.env.OVERRIDE_SERVER_SIDE_LOGGING_SERVER;

    connectorRegistry.getManifest.mockReturnValueOnce({
      version: '1.0.0',
      platforms: {}
    });
    await expect(request(app).get('/crmManifest').query({ platformName: 'brokenCRM' })).resolves.toMatchObject({ status: 400 });

    connectorRegistry.getManifest.mockReturnValueOnce(null);
    await expect(request(app).get('/crmManifest').query({ platformName: 'missingCRM' })).resolves.toMatchObject({ status: 400 });
  });

  test('serves ChatGPT and OAuth metadata routes', async () => {
    await expect(request(app).get('/.well-known/openai-apps-challenge')).resolves.toMatchObject({ text: 'verify-code' });
    expect((await request(app).get('/.well-known/oauth-protected-resource')).body.resource).toBe('https://app.example.com');
    const authServerMetadata = (await request(app).get('/.well-known/oauth-authorization-server')).body;
    expect(authServerMetadata.registration_endpoint).toBe('https://app.example.com/oauth/register');
    expect(authServerMetadata.token_endpoint_auth_methods_supported).toEqual(['none']);
    expect(authServerMetadata.code_challenge_methods_supported).toEqual(['S256']);
    expect((await request(app).post('/oauth/register')).body).toEqual({
      client_id: 'rc-mcp-public-client-id',
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    });
    const redirectResponse = await request(app)
      .get('/oauth/authorize_shim')
      .query({
        response_type: 'code',
        client_id: 'rc-mcp-public-client-id',
        redirect_uri: 'https://chat.example.com/callback',
        state: 'state-1',
        scope: 'ReadAccounts',
        code_challenge: 'pkce-challenge',
        code_challenge_method: 'S256',
        resource: 'https://app.example.com',
      });
    expect(redirectResponse.status).toBe(302);
    expect(redirectResponse.headers.location).toContain('/restapi/oauth/authorize?');
    expect(redirectResponse.headers.location).toContain('client_id=rc-mcp-public-client-id');
    expect(redirectResponse.headers.location).toContain('code_challenge=pkce-challenge');
    expect(redirectResponse.headers.location).toContain('code_challenge_method=S256');
    expect(redirectResponse.headers.location).not.toContain('resource=');

    const staleClientResponse = await request(app)
      .get('/oauth/authorize_shim')
      .query({
        response_type: 'code',
        client_id: 'stale-client-id',
        redirect_uri: 'https://chat.example.com/callback',
        code_challenge: 'pkce-challenge',
        code_challenge_method: 'S256',
      });
    expect(staleClientResponse.status).toBe(400);
    expect(staleClientResponse.body).toEqual(expect.objectContaining({
      success: false,
      error: 'mcp_oauth_client_mismatch',
      message: expect.stringContaining('outdated RingCentral OAuth client ID'),
    }));
  });

  test('rejects incomplete OAuth metadata and shim requests', async () => {
    delete process.env.RINGCENTRAL_MCP_CLIENT_ID;
    await expect(request(app).post('/oauth/register')).resolves.toMatchObject({ status: 500 });
    await expect(request(app).get('/oauth/authorize_shim')).resolves.toMatchObject({ status: 500 });

    process.env.RINGCENTRAL_MCP_CLIENT_ID = 'rc-mcp-public-client-id';
    await expect(request(app).get('/oauth/authorize_shim').query({
      response_type: 'code',
      client_id: 'rc-mcp-public-client-id',
      code_challenge: 'pkce-challenge',
      code_challenge_method: 'S256',
    })).resolves.toMatchObject({ status: 400, text: 'Missing OAuth authorization parameters' });

    await expect(request(app).get('/oauth/authorize_shim').query({
      response_type: 'code',
      client_id: 'rc-mcp-public-client-id',
      redirect_uri: 'https://chat.example.com/callback',
      code_challenge_method: 'plain',
    })).resolves.toMatchObject({ status: 400, text: 'PKCE S256 code_challenge is required' });
  });

  test('serves mock connector utility routes', async () => {
    await expect(request(app).post('/registerMockUser').query({ secretKey: 'secret-key' }).send({ userName: 'A' })).resolves.toMatchObject({ status: 200 });
    await expect(request(app).delete('/deleteMockUser').query({ secretKey: 'secret-key', userName: 'A' })).resolves.toMatchObject({ status: 200 });
    await expect(request(app).get('/mockCallLog').query({ secretKey: 'secret-key', sessionIds: 's1' })).resolves.toMatchObject({ status: 200 });
    await expect(request(app).post('/mockCallLog').query({ secretKey: 'secret-key' }).send({ sessionId: 's1' })).resolves.toMatchObject({ status: 200 });
    await expect(request(app).delete('/mockCallLog').query({ secretKey: 'secret-key' })).resolves.toMatchObject({ status: 200 });
  });

  test('serves MCP and widget tool-call routes', async () => {
    expect((await request(app).options('/mcp')).status).toBe(200);
    expect((await request(app).post('/mcp').send({ method: 'tools/list' })).body).toEqual({ jsonrpc: '2.0', result: 'mcp-ok' });
    expect(mcpHandler.handleMcpRequest).toHaveBeenCalled();
    expect((await request(app).post('/mcp').send({ method: 'notifications/cancelled' })).body).toEqual({ jsonrpc: '2.0', result: 'mcp-ok' });
    expect((await request(app).post('/mcp').set('Authorization', 'Bearer rc-oauth-token').send({ method: 'tools/call' })).body).toEqual({ jsonrpc: '2.0', result: 'mcp-ok' });
    const protectedMcpResponse = await request(app)
      .post('/mcp')
      .send({ method: 'tools/call', params: { name: 'simpleTool' } });
    expect(protectedMcpResponse.status).toBe(401);
    expect(protectedMcpResponse.headers['www-authenticate']).toContain('error_description=');
    expect(protectedMcpResponse.body).toEqual(expect.objectContaining({
      success: false,
      error: 'mcp_oauth_reconnect_required',
      message: expect.stringContaining('PKCE update'),
    }));
    expect((await request(app).options('/mcp/widget-tool-call')).status).toBe(200);
    expect((await request(app).post('/mcp/widget-tool-call').send({ name: 'tool' })).body).toEqual({ successful: true });
  });

  test('serves auth and managed-auth state routes', async () => {
    expect((await request(app).get('/licenseStatus').query(authQuery())).body).toEqual({ isLicenseValid: true });
    const authValidationResponse = await request(app).get('/authValidation').query(authQuery());
    expect(authValidationResponse.body).toEqual({
      successful: true,
      returnMessage: { messageType: 'success', message: 'Valid' },
    });
    expect(() => AuthValidationResponseSchema.parse(authValidationResponse.body)).not.toThrow();

    const managedAuthResponse = await request(app).get('/apiKeyManagedAuthState').query({ platform: 'testCRM', rcAccessToken: 'rc-token' });
    expect(() => ManagedAuthStateResponseSchema.parse(managedAuthResponse.body)).not.toThrow();
    const managedOAuthResponse = await request(app).get('/oauthManagedAuthState').query({ platform: 'testCRM', rcAccessToken: 'rc-token' });
    expect(() => ManagedOAuthStateResponseSchema.parse(managedOAuthResponse.body)).not.toThrow();
  });

  test('serves admin settings, managed auth, managed OAuth, mapping, and server logging routes', async () => {
    const adminSettingsRequest = { adminSettings: { a: 1 } };
    expect(() => AdminSettingsUpdateRequestSchema.parse(adminSettingsRequest)).not.toThrow();
    const adminSettingsResponse = await request(app).post('/admin/settings').query({ rcAccessToken: 'rc-token' }).send(adminSettingsRequest);
    expect(adminSettingsResponse.text).toBe('Admin settings updated');
    expect(adminSettingsResponse.headers['content-type']).toMatch(/^text\/html/);
    expect(() => AdminSuccessMessageSchema.parse(adminSettingsResponse.text)).not.toThrow();
    expect((await request(app).get('/admin/settings').query({ ...authQuery(), rcAccessToken: 'rc-token' })).body).toEqual({ userSettings: { theme: 'dark' } });
    const managedAuthAdminResponse = await request(app).get('/admin/managedAuth').query({ ...authQuery(), rcAccessToken: 'rc-token', connectorId: 'connector-1' });
    expect(() => ManagedAuthAdminResponseSchema.parse(managedAuthAdminResponse.body)).not.toThrow();

    for (const managedAuthRequest of [
      { scope: 'user', rcExtensionId: 'ext-1', values: { key: 'value' } },
      { scope: 'org', values: { key: 'value' } },
    ]) {
      expect(() => ManagedAuthUpdateRequestSchema.parse(managedAuthRequest)).not.toThrow();
      const response = await request(app).post('/admin/managedAuth').query({ ...authQuery(), rcAccessToken: 'rc-token' }).send(managedAuthRequest);
      expect(response.text).toBe('Shared authentication updated');
      expect(() => AdminSuccessMessageSchema.parse(response.text)).not.toThrow();
    }

    const managedOAuthRequest = { values: { clientId: 'id' } };
    expect(() => AdminManagedOAuthCacheRequestSchema.parse(managedOAuthRequest)).not.toThrow();
    const managedOAuthCacheResponse = await request(app).post('/admin/managedOAuth/cache').query({ rcAccessToken: 'rc-token' }).send(managedOAuthRequest);
    expect(() => BasicMutationResponseSchema.parse(managedOAuthCacheResponse.body)).not.toThrow();
    const managedOAuthCacheDeleteResponse = await request(app).delete('/admin/managedOAuth/cache').query({ rcAccessToken: 'rc-token' });
    expect(() => BasicMutationResponseSchema.parse(managedOAuthCacheDeleteResponse.body)).not.toThrow();
    const managedOAuthAccountDeleteResponse = await request(app).delete('/admin/managedOAuth/account').query({ rcAccessToken: 'rc-token', platform: 'testCRM' });
    expect(() => BasicMutationResponseSchema.parse(managedOAuthAccountDeleteResponse.body)).not.toThrow();
    expect((await request(app).post('/admin/userMapping').query({ ...authQuery(), rcAccessToken: 'rc-token' }).send({ rcExtensionList: ['100'] })).body).toEqual({ users: ['mapped-user'] });
    expect((await request(app).post('/admin/reinitializeUserMapping').query({ ...authQuery(), rcAccessToken: 'rc-token' }).send({ rcExtensionList: ['100'] })).body).toEqual({ users: ['remapped-user'] });
    expect((await request(app).get('/admin/serverLoggingSettings').query(authQuery())).body).toEqual({ enabled: true });
    expect((await request(app).post('/admin/serverLoggingSettings').query(authQuery()).send({ additionalFieldValues: { enabled: true } })).body).toEqual({
      successful: true,
      returnMessage: { messageType: 'success', message: 'Updated' },
    });
  });

  test('serves user settings, user info, hostname, and user hash routes', async () => {
    const preloadResponse = await request(app).get('/user/preloadSettings').query({ rcAccessToken: 'rc-token' });
    expect(() => UserSettingsEnvelopeSchema.parse(preloadResponse.body)).not.toThrow();

    const refreshResponse = await request(app).post('/user/refreshInfo').query(authQuery()).send({});
    expect(refreshResponse.body).toEqual({
      successful: true,
      returnMessage: { messageType: 'success', message: 'Refreshed' },
    });
    expect(() => BasicMutationResponseSchema.parse(refreshResponse.body)).not.toThrow();

    const settingsResponse = await request(app).get('/user/settings').query({ ...authQuery(), rcAccessToken: 'rc-token' });
    expect(() => UserSettingsSchema.parse(settingsResponse.body)).not.toThrow();
    const settingsRequest = { userSettings: { timezone: { value: 'UTC', customizable: true } } };
    expect(() => UserSettingsUpdateRequestSchema.parse(settingsRequest)).not.toThrow();
    const settingsUpdateResponse = await request(app).post('/user/settings').query(authQuery()).send(settingsRequest);
    expect(() => UserSettingsEnvelopeSchema.parse(settingsUpdateResponse.body)).not.toThrow();
    await expect(request(app).get('/hostname').query(authQuery())).resolves.toMatchObject({ status: 200, text: 'crm.example.com' });
    expect((await request(app).get('/userInfoHash').query({ extensionId: 'ext', accountId: 'acc' })).body).toEqual({
      extensionId: 'hash-ext',
      accountId: 'hash-acc',
    });
  });

  test('serves CRM OAuth, MCP session OAuth, API-key login, and disconnect routes', async () => {
    const callbackState = encodeURIComponent('platform=testCRM&hostname=crm.example.com');
    const callbackResponse = await request(app)
      .get('/oauth-callback')
      .query({
        callbackUri: `https://redirect.example.com/callback?state=${callbackState}`,
        code: 'oauth-code',
      });
    expect(callbackResponse.body).toEqual({
      jwtToken: 'generated-crm-jwt',
      name: 'CRM User',
      returnMessage: { messageType: 'success', message: 'Connected' },
    });

    const mcpState = encodeURIComponent('platform=testCRM&hostname=crm.example.com&sessionId=session-1');
    await expect(request(app).get('/oauth-callback').query({
      callbackUri: `https://redirect.example.com/callback?state=${mcpState}`,
      code: 'oauth-code',
    })).resolves.toMatchObject({ status: 200, text: 'Authentication successful. Please go back to AI Agent and confirm it.' });
    expect(updateAuthSession).toHaveBeenCalledWith('session-1', expect.objectContaining({ status: 'completed' }));

    const apiKeyLoginRequest = {
      platform: 'testCRM',
      apiKey: 'api-key',
      rcAccessToken: 'rc-token',
    };
    expect(ApiKeyLoginRequestSchema.parse(apiKeyLoginRequest)).toEqual(apiKeyLoginRequest);
    const apiKeyLoginResponse = await request(app).post('/apiKeyLogin').send(apiKeyLoginRequest);
    expect(apiKeyLoginResponse.body).toEqual({
      jwtToken: 'generated-crm-jwt',
      name: 'CRM User',
      returnMessage: { messageType: 'success', message: 'Connected' },
    });
    expect(ApiKeyLoginResponseSchema.parse(apiKeyLoginResponse.body)).toEqual(apiKeyLoginResponse.body);
    expect((await request(app).post('/unAuthorize').query(authQuery()).send({})).body).toEqual({
      messageType: 'success',
      message: 'Disconnected',
    });
  });

  test('serves contact lookup, contact creation, and custom contact search routes', async () => {
    expect((await request(app).get('/contact').query({ ...authQuery(), phoneNumber: '+15551234567' })).body).toEqual({
      successful: true,
      returnMessage: { messageType: 'success', message: 'Found' },
      contact: [{ id: 'contact-1', isNewContact: false }],
    });
    expect((await request(app).post('/contact').query(authQuery()).send({ phoneNumber: '+1555', newContactName: 'Alice' })).body.contact).toEqual({ id: 'contact-2' });
    expect((await request(app).get('/custom/contact/search').query({ ...authQuery(), name: 'Alice' })).body.contact).toEqual([{ id: 'contact-3' }]);
  });

  test('serves appointment list, create, update, status, refresh, confirm, and cancel routes', async () => {
    const listResponse = await request(app).get('/appointments').query(authQuery());
    expect(() => AppointmentListResponseSchema.parse(listResponse.body)).not.toThrow();
    const rangedListResponse = await request(app).get('/appointments').query({
      ...authQuery(),
      startDate: '2026-07-01',
      endDate: '2026-07-31',
    });
    expect(rangedListResponse.status).toBe(200);
    expect(appointmentCore.listAppointments).toHaveBeenLastCalledWith(expect.objectContaining({
      range: { startDate: '2026-07-01', endDate: '2026-07-31' },
    }));

    const createBody = appointmentCreateBody();
    expect(() => AppointmentCreateRequestSchema.parse(createBody)).not.toThrow();
    const createResponse = await request(app).post('/appointments').query(authQuery()).send(createBody);
    expect(() => AppointmentCreateResponseSchema.parse(createResponse.body)).not.toThrow();

    const patchBody = { patch: { title: 'Updated' } };
    expect(() => AppointmentPatchRequestSchema.parse(patchBody)).not.toThrow();
    const patchResponse = await request(app).patch('/appointments/appt-2').query(authQuery()).send(patchBody);
    expect(() => AppointmentRecordResponseSchema.parse(patchResponse.body)).not.toThrow();

    const statusBody = { status: 'Tentative' };
    expect(() => AppointmentStatusRequestSchema.parse(statusBody)).not.toThrow();
    const statusResponse = await request(app).post('/appointments/appt-2/status').query(authQuery()).send(statusBody);
    expect(() => AppointmentRecordResponseSchema.parse(statusResponse.body)).not.toThrow();
    expect(appointmentCore.updateAppointment).toHaveBeenLastCalledWith({
      platform: 'testCRM',
      userId: 'user-1',
      appointmentId: 'appt-2',
      patchBody: { status: 'tentative' },
    });
    const refreshResponse = await request(app).get('/appointments/appt-2/refresh').query(authQuery());
    expect(() => AppointmentRecordResponseSchema.parse(refreshResponse.body)).not.toThrow();
    const confirmResponse = await request(app).post('/appointments/appt-2/confirm').query(authQuery());
    expect(() => AppointmentActionResponseSchema.parse(confirmResponse.body)).not.toThrow();
    const cancelResponse = await request(app).post('/appointments/appt-2/cancel').query(authQuery());
    expect(() => AppointmentActionResponseSchema.parse(cancelResponse.body)).not.toThrow();
  });

  test('rejects malformed appointment request bodies before invoking connectors', async () => {
    appointmentCore.listAppointments.mockClear();
    appointmentCore.createAppointment.mockClear();
    appointmentCore.updateAppointment.mockClear();

    const responses = [
      await request(app).get('/appointments').query({ ...authQuery(), startDate: '2026-07-01' }),
      await request(app).get('/appointments').query({
        ...authQuery(),
        startDate: '2026-08-01',
        endDate: '2026-07-01',
      }),
      await request(app).post('/appointments').query(authQuery()).send({ payload: null }),
      await request(app).post('/appointments').query(authQuery()).send({ arbitrary: true }),
      await request(app).post('/appointments').query(authQuery()).send({
        ...appointmentCreateBody(),
        payload: { ...appointmentCreateBody().payload, status: 'scheduled' },
      }),
      await request(app).patch('/appointments/appt-2').query(authQuery()).send({ patch: 'bad' }),
      await request(app).patch('/appointments/appt-2').query(authQuery()).send({ patch: {} }),
      await request(app).patch('/appointments/appt-2').query(authQuery()).send({ patch: { location: 'Zoom' } }),
      await request(app).patch('/appointments/appt-2').query(authQuery()).send({ patch: { status: 'tentative' } }),
      await request(app).patch('/appointments/appt-2').query(authQuery()).send({
        patch: { startTimeUtc: '2026-07-20T19:00:00.000Z' },
      }),
      await request(app).patch('/appointments/appt-2').query(authQuery()).send({
        patch: { durationMinutes: -1 },
      }),
      await request(app).post('/appointments/appt-2/status').query(authQuery()).send({ status: 123 }),
    ];

    for (const response of responses) {
      expect(response.status).toBe(400);
      expect(response.body).toEqual(expect.objectContaining({ error: expect.any(String) }));
    }
    expect(appointmentCore.listAppointments).not.toHaveBeenCalled();
    expect(appointmentCore.createAppointment).not.toHaveBeenCalled();
    expect(appointmentCore.updateAppointment).not.toHaveBeenCalled();
  });

  test('rejects connector appointment results that violate the published response contracts', async () => {
    appointmentCore.listAppointments.mockResolvedValueOnce({
      successful: true,
      appointments: [{ id: null, title: 'Missing identifier' }],
    });
    const listResponse = await request(app).get('/appointments').query(authQuery());
    expect(listResponse.status).toBe(400);

    appointmentCore.createAppointment.mockResolvedValueOnce({ successful: true });
    const createResponse = await request(app)
      .post('/appointments')
      .query(authQuery())
      .send(appointmentCreateBody());
    expect(createResponse.status).toBe(400);

    appointmentCore.updateAppointment.mockResolvedValueOnce({ successful: true });
    const updateResponse = await request(app)
      .patch('/appointments/appt-2')
      .query(authQuery())
      .send({ patch: { title: 'Updated' } });
    expect(updateResponse.status).toBe(400);

    appointmentCore.confirmAppointment.mockResolvedValueOnce({ successful: true });
    const confirmResponse = await request(app)
      .post('/appointments/appt-2/confirm')
      .query(authQuery());
    expect(confirmResponse.status).toBe(400);
  });

  test('serves migrated client routes with bearer auth header and no jwtToken query', async () => {
    const withAuth = (req: any) => req.set('Authorization', 'Bearer valid-crm-jwt');

    await expect(withAuth(request(app).get('/hostname'))).resolves.toMatchObject({ status: 200, text: 'crm.example.com' });
    expect((await withAuth(request(app).get('/custom/contact/search').query({ name: 'Alice' }))).body.contact).toEqual([{ id: 'contact-3' }]);
    expect((await withAuth(request(app).get('/appointments').query({
      startDate: '2026-07-01',
      endDate: '2026-07-31',
    }))).body.appointments).toEqual([{ id: 'appt-1' }]);
    expect((await withAuth(request(app).post('/appointments').send(appointmentCreateBody()))).body.appointmentId).toBe('appt-2');
    expect((await withAuth(request(app).patch('/appointments/appt-2').send({ patch: { title: 'Updated' } }))).body.appointmentId).toBe('appt-2');
    expect((await withAuth(request(app).post('/appointments/appt-2/status').send({ status: 'tentative' }))).body.appointmentId).toBe('appt-2');
    expect((await withAuth(request(app).get('/appointments/appt-2/refresh'))).body.appointmentId).toBe('appt-2');
    expect((await withAuth(request(app).post('/appointments/appt-2/confirm'))).body.appointmentId).toBe('appt-2');
    expect((await withAuth(request(app).post('/appointments/appt-2/cancel'))).body.appointmentId).toBe('appt-2');
  });

  test('serves call-log, disposition, and message-log routes', async () => {
    expect((await request(app).post('/callLog/cacheNote').query(authQuery()).send({ sessionId: 's1', note: 'note' })).body.successful).toBe(true);
    expect((await request(app).get('/callLog').query({ ...authQuery(), sessionIds: 's1', requireDetails: 'true' })).body.logs).toEqual([{ sessionId: 'session-1' }]);
    const callLogResponse = await request(app).post('/callLog').query(authQuery()).send({ logInfo: { accountId: 'acc' } });
    expect(callLogResponse.body.logId).toBe('log-1');
    expect(() => CallLogMutationResponseSchema.parse(callLogResponse.body)).not.toThrow();
    expect((await request(app).patch('/callLog').query(authQuery()).send({ accountId: 'acc' })).body.updatedNote).toBe('updated');
    expect((await request(app).put('/callDisposition').query(authQuery()).send({
      sessionId: 's1',
      dispositions: [{ id: 'left-voicemail', value: 'Left voicemail' }],
    })).body.successful).toBe(true);
    const messageLogResponse = await request(app).post('/messageLog').query(authQuery()).send({ messages: [] });
    expect(messageLogResponse.body.logIds).toEqual(['msg-1']);
    expect(() => MessageLogResponseSchema.parse(messageLogResponse.body)).not.toThrow();

    logCore.createMessageLog.mockResolvedValueOnce({
      successful: true,
      logIds: [],
      returnMessage: null,
    });
    const alreadyLoggedResponse = await request(app).post('/messageLog').query(authQuery()).send({ messages: [] });
    expect(alreadyLoggedResponse.body).toEqual({
      successful: true,
      logIds: [],
      returnMessage: null,
    });
    expect(() => MessageLogResponseSchema.parse(alreadyLoggedResponse.body)).not.toThrow();
  });

  test('wraps representative route responses with debug trace data', async () => {
    async function expectDebugResponse(req) {
      const response = await req.set('is-debug', 'true');
      expect(response.status).toBeLessThan(500);
      expect(response.body._debug).toEqual(expect.objectContaining({
        requestId: expect.any(String),
        traceCount: expect.any(Number),
        traces: expect.any(Array),
      }));
      return response;
    }

    await expectDebugResponse(request(app).get('/releaseNotes'));
    await expectDebugResponse(request(app).get('/implementedInterfaces').query({ platform: 'testCRM' }));
    await expectDebugResponse(request(app).get('/licenseStatus').query(authQuery()));
    await expectDebugResponse(request(app).get('/authValidation').query(authQuery()));
    await expectDebugResponse(request(app).get('/apiKeyManagedAuthState').query({ platform: 'testCRM', rcAccessToken: 'rc-token' }));
    await expectDebugResponse(request(app).get('/oauthManagedAuthState').query({ platform: 'testCRM', rcAccessToken: 'rc-token' }));
    await expectDebugResponse(request(app).get('/admin/settings').query({ ...authQuery(), rcAccessToken: 'rc-token' }));
    await expectDebugResponse(request(app).get('/admin/managedAuth').query({ ...authQuery(), rcAccessToken: 'rc-token' }));
    await expectDebugResponse(request(app).post('/admin/managedAuth').query({ ...authQuery(), rcAccessToken: 'rc-token' }).send({ scope: 'org', values: { key: 'value' } }));
    await expectDebugResponse(request(app).post('/admin/managedOAuth/cache').query({ rcAccessToken: 'rc-token' }).send({ values: { clientSecret: 'secret' } }));
    await expectDebugResponse(request(app).delete('/admin/managedOAuth/cache').query({ rcAccessToken: 'rc-token' }));
    await expectDebugResponse(request(app).delete('/admin/managedOAuth/account').query({ rcAccessToken: 'rc-token', platform: 'testCRM' }));
    await expectDebugResponse(request(app).post('/admin/userMapping').query({ ...authQuery(), rcAccessToken: 'rc-token' }).send({ rcExtensionList: ['100'] }));
    await expectDebugResponse(request(app).post('/admin/reinitializeUserMapping').query({ ...authQuery(), rcAccessToken: 'rc-token' }).send({ rcExtensionList: ['100'] }));
    await expectDebugResponse(request(app).get('/admin/serverLoggingSettings').query(authQuery()));
    await expectDebugResponse(request(app).post('/admin/serverLoggingSettings').query(authQuery()).send({ additionalFieldValues: { enabled: true } }));
    await expectDebugResponse(request(app).get('/user/preloadSettings').query({ rcAccessToken: 'rc-token' }));
    await expectDebugResponse(request(app).post('/user/refreshInfo').query(authQuery()).send({}));
    await expectDebugResponse(request(app).get('/user/settings').query(authQuery()));
    await expectDebugResponse(request(app).post('/user/settings').query(authQuery()).send({
      userSettings: { timezone: { value: 'UTC', customizable: true } },
    }));
    await expectDebugResponse(request(app).get('/hostname').query(authQuery()));
    await expectDebugResponse(request(app).get('/contact').query({ ...authQuery(), phoneNumber: '+15551234567' }));
    await expectDebugResponse(request(app).post('/contact').query(authQuery()).send({ phoneNumber: '+1555', newContactName: 'Alice' }));
    await expectDebugResponse(request(app).get('/appointments').query(authQuery()));
    await expectDebugResponse(request(app).post('/appointments').query(authQuery()).send(appointmentCreateBody()));
    await expectDebugResponse(request(app).patch('/appointments/appt-2').query(authQuery()).send({ patch: { title: 'Updated' } }));
    await expectDebugResponse(request(app).get('/callLog').query(authQuery()));
    await expectDebugResponse(request(app).post('/callLog').query(authQuery()).send({ logInfo: { accountId: 'acc' } }));
    await expectDebugResponse(request(app).patch('/callLog').query(authQuery()).send({ accountId: 'acc' }));
    await expectDebugResponse(request(app).put('/callDisposition').query(authQuery()).send({ sessionId: 's1' }));
    await expectDebugResponse(request(app).post('/messageLog').query(authQuery()).send({ messages: [] }));
    await expectDebugResponse(request(app).get('/custom/contact/search').query({ ...authQuery(), name: 'Alice' }));
    await expectDebugResponse(request(app).get('/ringcentral/admin/report').query(authQuery()));
    await expectDebugResponse(request(app).get('/ringcentral/admin/userReport').query({ ...authQuery(), rcExtensionId: 'ext-1' }));
    await expectDebugResponse(request(app).get('/debug/report/url').query(authQuery()));
  });

  test('normalizes bearer RC access token headers and tracks forwarded client IP', async () => {
    analytics.track.mockClear();

    const response = await request(app)
      .post('/calldown')
      .query(authQuery())
      .set('X-RC-Access-Token', 'Bearer rc-header-token')
      .set('X-Forwarded-For', '10.0.0.4,203.0.113.10')
      .set('User-Agent', 'Route Test Agent')
      .set('developer-author-name', 'Route Tester')
      .send({ contactId: 'contact-1' });

    expect(response.status).toBe(200);
    expect(calldown.schedule).toHaveBeenCalledWith({
      jwtToken: 'generated-crm-jwt',
      rcAccessToken: 'rc-header-token',
      body: { contactId: 'contact-1' }
    });
    expect(analytics.track).toHaveBeenLastCalledWith(expect.objectContaining({
      eventName: 'Schedule call down',
      ip: '203.0.113.10',
      userAgent: 'Route Test Agent',
      author: 'Route Tester',
      success: true
    }));
  });

  test('serves RingCentral report, callback, debug, and plugin routes', async () => {
    expect((await request(app).get('/ringcentral/admin/report').query({ ...authQuery(), timezone: 'UTC' })).body).toEqual({ rows: [{ id: 'admin-row' }] });
    expect((await request(app).get('/ringcentral/admin/userReport').query({ ...authQuery(), rcExtensionId: 'ext-1' })).body).toEqual({ rows: [{ id: 'user-row' }] });
    await expect(request(app).get('/ringcentral/oauth/callback').query({ ...authQuery(), code: 'rc-code' })).resolves.toMatchObject({ status: 200 });
    const debugReportResponse = await request(app).get('/debug/report/url').query(authQuery());
    expect(debugReportResponse.body).toEqual({ presignedUrl: 'https://upload.example.com/report' });
    expect(() => DebugReportUrlResponseSchema.parse(debugReportResponse.body)).not.toThrow();
    expect((await request(app).post('/plugin/async-callback/task-1').send({ successful: true })).body).toEqual({ successful: true });
    await expect(request(app).post('/plugin/register').query({ rcAccessToken: 'rc-token' }).send({ pluginId: 'p1', rcAccountId: 'rc-account-1' })).resolves.toMatchObject({ status: 200 });
    await expect(request(app).delete('/plugin/unregister').query({ rcAccessToken: 'rc-token', pluginId: 'p1', rcAccountId: 'rc-account-1' })).resolves.toMatchObject({ status: 200 });
    expect((await request(app).get('/plugin/licenseStatus').query({ ...authQuery(), rcAccountId: 'rc-account-1', pluginId: 'p1' })).body).toEqual({ licenseStatus: true });
  });

  test('rejects protected routes when JWT token is missing', async () => {
    const noTokenCases: Array<[any, string, any?]> = [
      ['get', '/authValidation'],
      ['get', '/admin/settings'],
      ['get', '/admin/managedAuth'],
      ['post', '/admin/managedAuth', { scope: 'org' }],
      ['post', '/admin/userMapping', { rcExtensionList: ['100'] }],
      ['post', '/admin/reinitializeUserMapping', { rcExtensionList: ['100'] }],
      ['get', '/admin/serverLoggingSettings'],
      ['post', '/admin/serverLoggingSettings', { additionalFieldValues: { enabled: true } }],
      ['post', '/user/refreshInfo', {}],
      ['get', '/user/settings'],
      ['post', '/user/settings', { userSettings: {} }],
      ['get', '/hostname'],
      ['post', '/unAuthorize', {}],
      ['get', '/contact'],
      ['post', '/contact', { phoneNumber: '+1555', newContactName: 'Alice' }],
      ['get', '/appointments'],
      ['post', '/appointments', appointmentCreateBody()],
      ['patch', '/appointments/appt-2', { patch: { title: 'Meet' } }],
      ['post', '/appointments/appt-2/status', { status: 'tentative' }],
      ['get', '/appointments/appt-2/refresh'],
      ['post', '/appointments/appt-2/confirm', {}],
      ['post', '/appointments/appt-2/cancel', {}],
      ['get', '/callLog'],
      ['post', '/callLog', { logInfo: { accountId: 'acc' } }],
      ['patch', '/callLog', { accountId: 'acc' }],
      ['put', '/callDisposition', { sessionId: 's1' }],
      ['post', '/messageLog', { messages: [] }],
      ['post', '/calldown', { contactId: 'c1' }],
      ['get', '/calldown'],
      ['delete', '/calldown/item-1'],
      ['patch', '/calldown/item-1', { status: 'called' }],
      ['get', '/custom/contact/search'],
      ['get', '/ringcentral/admin/report'],
      ['get', '/ringcentral/admin/userReport'],
      ['get', '/ringcentral/oauth/callback'],
      ['get', '/debug/report/url'],
    ];

    for (const [method, path, body] of noTokenCases) {
      const req = request(app)[method](path);
      const response = body === undefined ? await req : await req.send(body);
      expect(response.status).toBe(400);
    }
  });

  test('rejects routes with missing required parameters', async () => {
    await expect(request(app).get('/implementedInterfaces')).resolves.toMatchObject({ status: 400 });
    await expect(request(app).get('/apiKeyManagedAuthState').query({ rcAccessToken: 'rc-token' })).resolves.toMatchObject({ status: 400 });
    await expect(request(app).get('/apiKeyManagedAuthState').query({ platform: 'testCRM' })).resolves.toMatchObject({ status: 400 });
    await expect(request(app).get('/oauthManagedAuthState').query({ rcAccessToken: 'rc-token' })).resolves.toMatchObject({ status: 400 });
    await expect(request(app).get('/oauthManagedAuthState').query({ platform: 'testCRM' })).resolves.toMatchObject({ status: 400 });
    await expect(request(app).post('/admin/serverLoggingSettings').query(authQuery()).send({})).resolves.toMatchObject({ status: 400 });
    await expect(request(app).get('/user/preloadSettings')).resolves.toMatchObject({ status: 400 });
    await expect(request(app).get('/oauth-callback')).resolves.toMatchObject({ status: 400 });
    await expect(request(app).get('/oauth-callback').query({ callbackUri: 'https://redirect.example.com/callback' })).resolves.toMatchObject({ status: 400 });
    await expect(request(app).post('/apiKeyLogin').send({ apiKey: 'api-key' })).resolves.toMatchObject({ status: 400 });
    await expect(request(app).post('/appointments/appt-2/status').query(authQuery()).send({})).resolves.toMatchObject({ status: 400 });
    await expect(request(app).delete('/admin/managedOAuth/account').query({ rcAccessToken: 'rc-token' })).resolves.toMatchObject({ status: 400 });
  });

  test('rejects protected routes when JWT is invalid', async () => {
    async function expectInvalidJwt(requestPromise, expectedText = null) {
      jwt.decodeJwt.mockReturnValue(null);
      const response = await requestPromise();
      expect(response.status).toBe(400);
      if (expectedText) {
        expect(response.text).toContain(expectedText);
      }
      jwt.decodeJwt.mockReturnValue(decodedJwt);
    }

    await expectInvalidJwt(() => request(app).get('/licenseStatus').query({ jwtToken: 'bad' }), 'Invalid JWT token');
    await expectInvalidJwt(() => request(app).get('/authValidation').query({ jwtToken: 'bad' }));
    await expectInvalidJwt(() => request(app).get('/contact').query({ jwtToken: 'bad', phoneNumber: '+1555' }));
    await expectInvalidJwt(() => request(app).post('/contact').query({ jwtToken: 'bad' }).send({ phoneNumber: '+1555' }));
    await expectInvalidJwt(() => request(app).get('/appointments').query({ jwtToken: 'bad' }));
    await expectInvalidJwt(() => request(app).post('/appointments').query({ jwtToken: 'bad' }).send(appointmentCreateBody()));
    await expectInvalidJwt(() => request(app).patch('/appointments/appt-2').query({ jwtToken: 'bad' }).send({ patch: { title: 'Updated' } }));
    await expectInvalidJwt(() => request(app).post('/appointments/appt-2/status').query({ jwtToken: 'bad' }).send({ status: 'tentative' }));
    await expectInvalidJwt(() => request(app).get('/appointments/appt-2/refresh').query({ jwtToken: 'bad' }));
    await expectInvalidJwt(() => request(app).post('/appointments/appt-2/confirm').query({ jwtToken: 'bad' }));
    await expectInvalidJwt(() => request(app).post('/appointments/appt-2/cancel').query({ jwtToken: 'bad' }));
    await expectInvalidJwt(() => request(app).get('/callLog').query({ jwtToken: 'bad' }));
    await expectInvalidJwt(() => request(app).post('/callLog').query({ jwtToken: 'bad' }).send({ logInfo: {} }));
    await expectInvalidJwt(() => request(app).patch('/callLog').query({ jwtToken: 'bad' }).send({}));
    await expectInvalidJwt(() => request(app).put('/callDisposition').query({ jwtToken: 'bad' }).send({ sessionId: 's1' }), 'Invalid JWT token');
    await expectInvalidJwt(() => request(app).post('/messageLog').query({ jwtToken: 'bad' }).send({ messages: [] }));
    await expectInvalidJwt(() => request(app).get('/custom/contact/search').query({ jwtToken: 'bad', name: 'Alice' }), 'Invalid JWT token');
  });

  test('returns 401 when contact handlers request session revocation', async () => {
    contactCore.findContact.mockResolvedValueOnce({
      successful: false,
      returnMessage: { messageType: 'warning', message: 'Reconnect' },
      isRevokeUserSession: true,
    });
    expect((await request(app).get('/contact').query({ ...authQuery(), phoneNumber: '+1555' })).status).toBe(401);

    contactCore.createContact.mockResolvedValueOnce({
      successful: false,
      returnMessage: { messageType: 'warning', message: 'Reconnect' },
      isRevokeUserSession: true,
    });
    expect((await request(app).post('/contact').query(authQuery()).send({ phoneNumber: '+1555' })).status).toBe(401);
  });

  test('returns 401 when appointment handlers request session revocation', async () => {
    for (const [method, path, mockFn, body] of [
      ['get', '/appointments', appointmentCore.listAppointments],
      ['post', '/appointments', appointmentCore.createAppointment, appointmentCreateBody()],
      ['patch', '/appointments/appt-2', appointmentCore.updateAppointment, { patch: { title: 'Updated' } }],
      ['post', '/appointments/appt-2/status', appointmentCore.updateAppointment, { status: 'tentative' }],
      ['get', '/appointments/appt-2/refresh', appointmentCore.refreshAppointment],
      ['post', '/appointments/appt-2/confirm', appointmentCore.confirmAppointment, {}],
      ['post', '/appointments/appt-2/cancel', appointmentCore.cancelAppointment, {}],
    ]) {
      mockFn.mockResolvedValueOnce({
        successful: false,
        returnMessage: { messageType: 'warning', message: 'Reconnect' },
        isRevokeUserSession: true,
      });
      const req = request(app)[method](path).query(authQuery());
      const response = body === undefined ? await req : await req.send(body);
      expect(response.status).toBe(401);
    }
  });

  test('returns 401 when log and contact-search handlers request session revocation', async () => {
    logCore.getCallLog.mockResolvedValueOnce({
      successful: false,
      returnMessage: { messageType: 'warning', message: 'Reconnect' },
      isRevokeUserSession: true,
    });
    expect((await request(app).get('/callLog').query(authQuery())).status).toBe(401);

    logCore.createCallLog.mockResolvedValueOnce({
      successful: false,
      returnMessage: { messageType: 'warning', message: 'Reconnect' },
      isRevokeUserSession: true,
    });
    expect((await request(app).post('/callLog').query(authQuery()).send({ logInfo: { accountId: 'acc' } })).status).toBe(401);

    dispositionCore.upsertCallDisposition.mockResolvedValueOnce({
      successful: false,
      returnMessage: { messageType: 'warning', message: 'Reconnect' },
      isRevokeUserSession: true,
    });
    expect((await request(app).put('/callDisposition').query(authQuery()).send({ sessionId: 's1' })).status).toBe(401);

    logCore.createMessageLog.mockResolvedValueOnce({
      successful: false,
      returnMessage: { messageType: 'warning', message: 'Reconnect' },
      isRevokeUserSession: true,
    });
    expect((await request(app).post('/messageLog').query(authQuery()).send({ messages: [] })).status).toBe(401);

    contactCore.findContactWithName.mockResolvedValueOnce({
      successful: false,
      returnMessage: { messageType: 'warning', message: 'Reconnect' },
      isRevokeUserSession: true,
    });
    expect((await request(app).get('/custom/contact/search').query({ ...authQuery(), name: 'Alice' })).status).toBe(401);
  });

  test('handles metadata and auth route failures', async () => {
    connectorRegistry.getConnector.mockImplementationOnce(() => {
      throw new Error('connector unavailable');
    });
    await expect(request(app).get('/implementedInterfaces').query({ platform: 'testCRM' })).resolves.toMatchObject({ status: 400 });

    authCore.getLicenseStatus.mockRejectedValueOnce(new Error('license failed'));
    expect((await request(app).get('/licenseStatus').query(authQuery())).body.licenseStatus).toBe('Invalid (Connect to get license status)');

    authCore.authValidation.mockRejectedValueOnce({ response: { status: 503 }, message: 'validation failed' });
    await expect(request(app).get('/authValidation').query(authQuery())).resolves.toMatchObject({ status: 400 });

    adminCore.validateRcUserToken.mockRejectedValueOnce(new Error('rc token invalid'));
    await expect(request(app).get('/apiKeyManagedAuthState').query({ platform: 'testCRM', rcAccessToken: 'rc-token' })).resolves.toMatchObject({ status: 400 });

    adminCore.validateAdminRole.mockRejectedValueOnce(new Error('admin validation failed'));
    await expect(request(app).get('/oauthManagedAuthState').query({ platform: 'testCRM', rcAccessToken: 'rc-token' })).resolves.toMatchObject({ status: 400 });
  });

  test('handles admin, managed OAuth, mapping, and server-logging route failures', async () => {
    UserModel.findByPk.mockResolvedValueOnce(null);
    await expect(request(app).get('/admin/settings').query({ ...authQuery(), rcAccessToken: 'rc-token' })).resolves.toMatchObject({ status: 400 });

    adminCore.getAdminSettings.mockResolvedValueOnce(null);
    expect((await request(app).get('/admin/settings').query({ ...authQuery(), rcAccessToken: 'rc-token' })).body).toEqual({
      customConnector: null,
      userSettings: {},
    });

    adminCore.validateAdminRole.mockResolvedValueOnce({ isValidated: false, rcAccountId: 'rc-account-1' });
    await expect(request(app).post('/admin/settings').query({ rcAccessToken: 'rc-token' }).send({ adminSettings: {} })).resolves.toMatchObject({ status: 403 });

    adminCore.validateAdminRole.mockResolvedValueOnce({ isValidated: false, rcAccountId: 'rc-account-1' });
    await expect(request(app).get('/admin/settings').query({ ...authQuery(), rcAccessToken: 'rc-token' })).resolves.toMatchObject({ status: 403 });

    UserModel.findByPk.mockResolvedValueOnce(null);
    await expect(request(app).get('/admin/managedAuth').query({ ...authQuery(), rcAccessToken: 'rc-token' })).resolves.toMatchObject({ status: 400 });

    adminCore.validateAdminRole.mockResolvedValueOnce({ isValidated: false, rcAccountId: 'rc-account-1' });
    await expect(request(app).get('/admin/managedAuth').query({ ...authQuery(), rcAccessToken: 'rc-token' })).resolves.toMatchObject({ status: 403 });

    UserModel.findByPk.mockResolvedValueOnce(null);
    await expect(request(app).post('/admin/managedAuth').query({ ...authQuery(), rcAccessToken: 'rc-token' }).send({ scope: 'user' })).resolves.toMatchObject({ status: 400 });

    adminCore.validateAdminRole.mockResolvedValueOnce({ isValidated: false, rcAccountId: 'rc-account-1' });
    await expect(request(app).post('/admin/managedAuth').query({ ...authQuery(), rcAccessToken: 'rc-token' }).send({ scope: 'user' })).resolves.toMatchObject({ status: 403 });

    adminCore.validateAdminRole.mockResolvedValueOnce({ isValidated: false, rcAccountId: 'rc-account-1' });
    await expect(request(app).post('/admin/managedOAuth/cache').query({ rcAccessToken: 'rc-token' }).send({ values: {} })).resolves.toMatchObject({ status: 403 });

    managedOAuthCore.upsertPendingManagedOAuth.mockRejectedValueOnce(new Error('cache failed'));
    await expect(request(app).post('/admin/managedOAuth/cache').query({ rcAccessToken: 'rc-token' }).send({ values: {} })).resolves.toMatchObject({ status: 400 });

    managedOAuthCore.clearPendingManagedOAuth.mockRejectedValueOnce(new Error('clear failed'));
    await expect(request(app).delete('/admin/managedOAuth/cache').query({ rcAccessToken: 'rc-token' })).resolves.toMatchObject({ status: 400 });

    managedOAuthCore.resetManagedOAuth.mockRejectedValueOnce(new Error('reset failed'));
    await expect(request(app).delete('/admin/managedOAuth/account').query({ rcAccessToken: 'rc-token', platform: 'testCRM' })).resolves.toMatchObject({ status: 400 });

    adminCore.getUserMapping.mockResolvedValueOnce({ isRevokeUserSession: true });
    await expect(request(app).post('/admin/userMapping').query({ ...authQuery(), rcAccessToken: 'rc-token' }).send({ rcExtensionList: ['100'] })).resolves.toMatchObject({ status: 401 });

    adminCore.reinitializeUserMapping.mockResolvedValueOnce({ isRevokeUserSession: true });
    await expect(request(app).post('/admin/reinitializeUserMapping').query({ ...authQuery(), rcAccessToken: 'rc-token' }).send({ rcExtensionList: ['100'] })).resolves.toMatchObject({ status: 401 });

    adminCore.validateAdminRole.mockResolvedValueOnce({ isValidated: false, rcAccountId: 'rc-account-1' });
    await expect(request(app).post('/admin/userMapping').query({ ...authQuery(), rcAccessToken: 'rc-token' }).send({ rcExtensionList: ['100'] })).resolves.toMatchObject({ status: 403 });

    adminCore.validateAdminRole.mockResolvedValueOnce({ isValidated: false, rcAccountId: 'rc-account-1' });
    await expect(request(app).post('/admin/reinitializeUserMapping').query({ ...authQuery(), rcAccessToken: 'rc-token' }).send({ rcExtensionList: ['100'] })).resolves.toMatchObject({ status: 403 });

    UserModel.findByPk.mockResolvedValueOnce(null);
    await expect(request(app).get('/admin/serverLoggingSettings').query(authQuery())).resolves.toMatchObject({ status: 400 });

    adminCore.updateServerLoggingSettings.mockRejectedValueOnce(new Error('settings failed'));
    await expect(request(app).post('/admin/serverLoggingSettings').query(authQuery()).send({ additionalFieldValues: { enabled: true } })).resolves.toMatchObject({ status: 400 });
  });

  test('handles user, hostname, OAuth callback, login, and disconnect route failures', async () => {
    userCore.getUserSettingsByAdmin.mockRejectedValueOnce(new Error('preload failed'));
    await expect(request(app).get('/user/preloadSettings').query({ rcAccessToken: 'rc-token' })).resolves.toMatchObject({ status: 400 });

    userCore.refreshUserInfo.mockRejectedValueOnce(new Error('refresh failed'));
    await expect(request(app).post('/user/refreshInfo').query(authQuery()).send({})).resolves.toMatchObject({ status: 400 });

    UserModel.findByPk.mockResolvedValueOnce(null);
    await expect(request(app).get('/user/settings').query(authQuery())).resolves.toMatchObject({ status: 400 });

    jwt.decodeJwt.mockReturnValueOnce({ id: 'user-1' }).mockReturnValueOnce({ id: 'user-1' });
    await expect(request(app).post('/user/settings').query({ jwtToken: 'valid-crm-jwt' }).send({ userSettings: {} })).resolves.toMatchObject({ status: 400 });
    jwt.decodeJwt.mockReturnValue(decodedJwt);

    UserModel.findByPk.mockResolvedValueOnce(null);
    await expect(request(app).get('/hostname').query(authQuery())).resolves.toMatchObject({ status: 400 });

    authCore.onOAuthCallback.mockRejectedValueOnce(new Error('oauth failed'));
    const failedState = encodeURIComponent('platform=testCRM&hostname=crm.example.com&sessionId=session-failed');
    await expect(request(app).get('/oauth-callback').query({
      callbackUri: `https://redirect.example.com/callback?state=${failedState}`,
      code: 'oauth-code',
    })).resolves.toMatchObject({ status: 400 });

    authCore.onApiKeyLogin.mockResolvedValueOnce({
      userInfo: null,
      returnMessage: { messageType: 'warning', message: 'Rejected' },
    });
    await expect(request(app).post('/apiKeyLogin').send({ platform: 'testCRM', apiKey: 'api-key' })).resolves.toMatchObject({ status: 400 });

    connectorRegistry.getConnector.mockReturnValueOnce({
      unAuthorize: jest.fn().mockRejectedValue(new Error('logout failed')),
    });
    await expect(request(app).post('/unAuthorize').query(authQuery()).send({})).resolves.toMatchObject({ status: 400 });
  });

  test('handles contact and appointment route failures', async () => {
    contactCore.findContact.mockRejectedValueOnce({ response: { status: 500 }, message: 'find failed' });
    await expect(request(app).get('/contact').query({ ...authQuery(), phoneNumber: '+1555' })).resolves.toMatchObject({ status: 400 });

    contactCore.createContact.mockRejectedValueOnce({ response: { status: 500 }, message: 'create failed' });
    await expect(request(app).post('/contact').query(authQuery()).send({ phoneNumber: '+1555' })).resolves.toMatchObject({ status: 400 });

    appointmentCore.listAppointments.mockRejectedValueOnce({ response: { status: 500 }, message: 'list failed' });
    await expect(request(app).get('/appointments').query(authQuery())).resolves.toMatchObject({ status: 400 });

    appointmentCore.createAppointment.mockRejectedValueOnce({ response: { status: 500 }, message: 'create appointment failed' });
    await expect(request(app).post('/appointments').query(authQuery()).send(appointmentCreateBody())).resolves.toMatchObject({ status: 400 });

    appointmentCore.updateAppointment.mockRejectedValueOnce({ response: { status: 500 }, message: 'update appointment failed' });
    await expect(request(app).patch('/appointments/appt-2').query(authQuery()).send({ patch: { title: 'Updated' } })).resolves.toMatchObject({ status: 400 });

    appointmentCore.updateAppointment.mockRejectedValueOnce({ response: { status: 500 }, message: 'update appointment status failed' });
    await expect(request(app).post('/appointments/appt-2/status').query(authQuery()).send({ status: 'tentative' })).resolves.toMatchObject({ status: 400 });

    appointmentCore.refreshAppointment.mockRejectedValueOnce({ response: { status: 500 }, message: 'refresh appointment failed' });
    await expect(request(app).get('/appointments/appt-2/refresh').query(authQuery())).resolves.toMatchObject({ status: 400 });

    appointmentCore.confirmAppointment.mockRejectedValueOnce({ response: { status: 500 }, message: 'confirm appointment failed' });
    await expect(request(app).post('/appointments/appt-2/confirm').query(authQuery())).resolves.toMatchObject({ status: 400 });

    appointmentCore.cancelAppointment.mockRejectedValueOnce({ response: { status: 500 }, message: 'cancel appointment failed' });
    await expect(request(app).post('/appointments/appt-2/cancel').query(authQuery())).resolves.toMatchObject({ status: 400 });
  });

  test('handles log, calldown, report, and plugin callback route failures', async () => {
    logCore.saveNoteCache.mockRejectedValueOnce({ response: { status: 500 }, message: 'cache failed' });
    await expect(request(app).post('/callLog/cacheNote').query(authQuery()).send({ sessionId: 's1' })).resolves.toMatchObject({ status: 400 });

    logCore.getCallLog.mockRejectedValueOnce({ response: { status: 500 }, message: 'get log failed' });
    await expect(request(app).get('/callLog').query(authQuery())).resolves.toMatchObject({ status: 400 });

    logCore.createCallLog.mockRejectedValueOnce({ response: { status: 500 }, message: 'create log failed' });
    await expect(request(app).post('/callLog').query(authQuery()).send({ logInfo: { accountId: 'acc' } })).resolves.toMatchObject({ status: 400 });

    logCore.updateCallLog.mockRejectedValueOnce({ response: { status: 500 }, message: 'update log failed' });
    await expect(request(app).patch('/callLog').query(authQuery()).send({ accountId: 'acc' })).resolves.toMatchObject({ status: 400 });

    dispositionCore.upsertCallDisposition.mockRejectedValueOnce({ response: { status: 500 }, message: 'disposition failed' });
    await expect(request(app).put('/callDisposition').query(authQuery()).send({ sessionId: 's1' })).resolves.toMatchObject({ status: 400 });

    logCore.createMessageLog.mockRejectedValueOnce({ response: { status: 500 }, message: 'message failed' });
    await expect(request(app).post('/messageLog').query(authQuery()).send({ messages: [] })).resolves.toMatchObject({ status: 400 });

    calldown.list.mockRejectedValueOnce({ response: { status: 500 }, message: 'calldown failed' });
    await expect(request(app).get('/calldown').query(authQuery())).resolves.toMatchObject({ status: 400 });

    contactCore.findContactWithName.mockRejectedValueOnce({ response: { status: 500 }, message: 'search failed' });
    await expect(request(app).get('/custom/contact/search').query({ ...authQuery(), name: 'Alice' })).resolves.toMatchObject({ status: 400 });

    UserModel.findByPk.mockResolvedValueOnce(null);
    await expect(request(app).get('/ringcentral/admin/report').query(authQuery())).resolves.toMatchObject({ status: 400 });

    UserModel.findByPk.mockResolvedValueOnce(null);
    await expect(request(app).get('/ringcentral/admin/userReport').query(authQuery())).resolves.toMatchObject({ status: 400 });

    UserModel.findByPk.mockResolvedValueOnce(null);
    await expect(request(app).get('/ringcentral/oauth/callback').query({ ...authQuery(), code: 'rc-code' })).resolves.toMatchObject({ status: 400 });

    logCore.handleAsyncPluginCallback.mockRejectedValueOnce(new Error('plugin failed'));
    await expect(request(app).post('/plugin/async-callback/task-1').send({ successful: true })).resolves.toMatchObject({ status: 500 });
  });

  test('rejects plugin account routes with invalid admin request details', async () => {
    await expect(request(app).post('/plugin/register').query({ rcAccessToken: 'rc-token' }).send({ rcAccountId: 'rc-account-1' })).resolves.toMatchObject({ status: 400 });
    await expect(request(app).post('/plugin/register').send({ pluginId: 'p1', rcAccountId: 'rc-account-1' })).resolves.toMatchObject({ status: 400 });

    adminCore.validateAdminRole.mockResolvedValueOnce({ isValidated: false, rcAccountId: 'rc-account-1' });
    await expect(request(app).post('/plugin/register').query({ rcAccessToken: 'rc-token' }).send({ pluginId: 'p1', rcAccountId: 'rc-account-1' })).resolves.toMatchObject({ status: 403 });

    adminCore.validateAdminRole.mockResolvedValueOnce({ isValidated: true, rcAccountId: 'different-account' });
    await expect(request(app).post('/plugin/register').query({ rcAccessToken: 'rc-token' }).send({ pluginId: 'p1', rcAccountId: 'rc-account-1' })).resolves.toMatchObject({ status: 403 });

    pluginCore.registerPluginAccount.mockRejectedValueOnce(new Error('register failed'));
    await expect(request(app).post('/plugin/register').query({ rcAccessToken: 'rc-token' }).send({ pluginId: 'p1', rcAccountId: 'rc-account-1' })).resolves.toMatchObject({ status: 400 });

    await expect(request(app).delete('/plugin/unregister').query({ rcAccessToken: 'rc-token', rcAccountId: 'rc-account-1' })).resolves.toMatchObject({ status: 400 });
    await expect(request(app).delete('/plugin/unregister').query({ pluginId: 'p1', rcAccountId: 'rc-account-1' })).resolves.toMatchObject({ status: 400 });

    adminCore.validateAdminRole.mockResolvedValueOnce({ isValidated: false, rcAccountId: 'rc-account-1' });
    await expect(request(app).delete('/plugin/unregister').query({ rcAccessToken: 'rc-token', pluginId: 'p1', rcAccountId: 'rc-account-1' })).resolves.toMatchObject({ status: 403 });

    adminCore.validateAdminRole.mockResolvedValueOnce({ isValidated: true, rcAccountId: 'different-account' });
    await expect(request(app).delete('/plugin/unregister').query({ rcAccessToken: 'rc-token', pluginId: 'p1', rcAccountId: 'rc-account-1' })).resolves.toMatchObject({ status: 403 });

    pluginCore.unregisterPluginAccount.mockRejectedValueOnce(new Error('unregister failed'));
    await expect(request(app).delete('/plugin/unregister').query({ rcAccessToken: 'rc-token', pluginId: 'p1', rcAccountId: 'rc-account-1' })).resolves.toMatchObject({ status: 400 });

    await expect(request(app).get('/plugin/licenseStatus').query(authQuery())).resolves.toMatchObject({ status: 400 });
    UserModel.findByPk.mockResolvedValueOnce(null);
    await expect(request(app).get('/plugin/licenseStatus').query({ ...authQuery(), rcAccountId: 'rc-account-1', pluginId: 'p1' })).resolves.toMatchObject({ status: 400 });
    pluginCore.getPluginLicenseStatus.mockRejectedValueOnce(new Error('license failed'));
    await expect(request(app).get('/plugin/licenseStatus').query({ ...authQuery(), rcAccountId: 'rc-account-1', pluginId: 'p1' })).resolves.toMatchObject({
      status: 200,
      body: {
        licenseStatus: false,
        licenseStatusDescription: 'license failed',
      },
    });
  });

  test('covers exported app and initialization helpers', async () => {
    const middleware = createCoreMiddleware();
    expect(middleware).toHaveLength(3);

    await initializeCore({ skipDatabaseInit: true });
    expect(analytics.init).toHaveBeenCalled();

    const fullApp = createCoreApp({ skipDatabaseInit: true, skipAnalyticsInit: true });
    const response = await request(fullApp).get('/isAlive');
    expect(response.status).toBe(200);
    expect(response.text).toBe('OK');
  });
});

export {};
