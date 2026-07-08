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
  createCoreRouter,
  createCoreApp,
  createCoreMiddleware,
  initializeCore,
} = require('../../index');

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

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.HASH_KEY = 'hash-key';
    process.env.APP_SERVER = 'https://app.example.com';
    process.env.RINGCENTRAL_SERVER = 'https://platform.example.com';
    process.env.RINGCENTRAL_CLIENT_ID = 'rc-client-id';
    process.env.RINGCENTRAL_CLIENT_SECRET = 'rc-client-secret';
    process.env.CHATGPT_VERIFICATION_CODE = 'verify-code';
    process.env.APP_SERVER_SECRET_KEY = 'secret-key';
    process.env.IS_PROD = 'false';

    jwt.decodeJwt.mockReturnValue(decodedJwt);
    jwt.generateJwt.mockReturnValue('generated-crm-jwt');
    UserModel.findByPk.mockResolvedValue(mockUser);
    connectorRegistry.getReleaseNotes.mockReturnValue({
      '1.0.0': { testCRM: { notes: ['connector note'] } },
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

    managedAuthCore.getManagedAuthState.mockResolvedValue({ hasManagedAuth: true });
    managedAuthCore.getManagedAuthAdminSettings.mockResolvedValue({ shared: true });
    managedAuthCore.upsertUserManagedAuthValues.mockResolvedValue();
    managedAuthCore.upsertOrgManagedAuthValues.mockResolvedValue();
    managedOAuthCore.getManagedOAuthState.mockResolvedValue({ isConfigured: true });
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

    userCore.getUserSettingsByAdmin.mockResolvedValue({ fields: [] });
    userCore.refreshUserInfo.mockResolvedValue({
      successful: true,
      returnMessage: { messageType: 'success', message: 'Refreshed' },
    });
    userCore.getUserSettings.mockResolvedValue({ timezone: 'UTC' });
    userCore.updateUserSettings.mockResolvedValue({ userSettings: { timezone: 'UTC' } });

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
  });

  test('serves health, manifest, release, version, and implemented interface routes', async () => {
    await expect(request(app).get('/isAlive')).resolves.toMatchObject({ status: 200, text: 'OK' });
    expect((await request(app).get('/releaseNotes')).status).toBe(200);
    const manifestResponse = await request(app)
      .get('/crmManifest')
      .query({ platformName: 'testCRM' });
    expect(manifestResponse.status).toBe(200);
    expect(manifestResponse.body.author.name).toBe('Test Author');
    expect((await request(app).get('/serverVersionInfo')).body).toEqual({ version: '1.0.0' });

    const interfacesResponse = await request(app)
      .get('/implementedInterfaces')
      .query({ platform: 'testCRM' });
    expect(interfacesResponse.status).toBe(200);
    expect(interfacesResponse.body.createCallLog).toBe(true);
  });

  test('serves ChatGPT and OAuth metadata routes', async () => {
    await expect(request(app).get('/.well-known/openai-apps-challenge')).resolves.toMatchObject({ text: 'verify-code' });
    expect((await request(app).get('/.well-known/oauth-protected-resource')).body.resource).toBe('https://app.example.com');
    expect((await request(app).get('/.well-known/oauth-authorization-server')).body.registration_endpoint).toBe('https://app.example.com/oauth/register');
    expect((await request(app).post('/oauth/register')).body).toEqual({
      client_id: 'rc-client-id',
      client_secret: 'rc-client-secret',
    });
    const redirectResponse = await request(app)
      .get('/oauth/authorize_shim')
      .query({
        response_type: 'code',
        client_id: 'client-id',
        redirect_uri: 'https://chat.example.com/callback',
        state: 'state-1',
        scope: 'ReadAccounts',
    });
    expect(redirectResponse.status).toBe(302);
    expect(redirectResponse.headers.location).toContain('/restapi/oauth/authorize?');
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
    expect((await request(app).options('/mcp/widget-tool-call')).status).toBe(200);
    expect((await request(app).post('/mcp/widget-tool-call').send({ name: 'tool' })).body).toEqual({ successful: true });
  });

  test('serves auth and managed-auth state routes', async () => {
    expect((await request(app).get('/licenseStatus').query(authQuery())).body).toEqual({ isLicenseValid: true });
    expect((await request(app).get('/authValidation').query(authQuery())).body).toEqual({
      successful: true,
      returnMessage: { messageType: 'success', message: 'Valid' },
    });
    expect((await request(app).get('/apiKeyManagedAuthState').query({ platform: 'testCRM', rcAccessToken: 'rc-token' })).body).toEqual({ hasManagedAuth: true });
    expect((await request(app).get('/oauthManagedAuthState').query({ platform: 'testCRM', rcAccessToken: 'rc-token' })).body).toEqual({ isConfigured: true });
  });

  test('serves admin settings, managed auth, managed OAuth, mapping, and server logging routes', async () => {
    await expect(request(app).post('/admin/settings').query({ rcAccessToken: 'rc-token' }).send({ adminSettings: { a: 1 } })).resolves.toMatchObject({ status: 200 });
    expect((await request(app).get('/admin/settings').query({ ...authQuery(), rcAccessToken: 'rc-token' })).body).toEqual({ userSettings: { theme: 'dark' } });
    expect((await request(app).get('/admin/managedAuth').query({ ...authQuery(), rcAccessToken: 'rc-token', connectorId: 'connector-1' })).body).toEqual({ shared: true });
    await expect(request(app).post('/admin/managedAuth').query({ ...authQuery(), rcAccessToken: 'rc-token' }).send({ scope: 'user', rcExtensionId: 'ext-1', values: { key: 'value' } })).resolves.toMatchObject({ status: 200 });
    await expect(request(app).post('/admin/managedAuth').query({ ...authQuery(), rcAccessToken: 'rc-token' }).send({ scope: 'org', values: { key: 'value' } })).resolves.toMatchObject({ status: 200 });
    await expect(request(app).post('/admin/managedOAuth/cache').query({ rcAccessToken: 'rc-token' }).send({ values: { clientId: 'id' } })).resolves.toMatchObject({ status: 200 });
    await expect(request(app).delete('/admin/managedOAuth/cache').query({ rcAccessToken: 'rc-token' })).resolves.toMatchObject({ status: 200 });
    await expect(request(app).delete('/admin/managedOAuth/account').query({ rcAccessToken: 'rc-token', platform: 'testCRM' })).resolves.toMatchObject({ status: 200 });
    expect((await request(app).post('/admin/userMapping').query({ ...authQuery(), rcAccessToken: 'rc-token' }).send({ rcExtensionList: ['100'] })).body).toEqual({ users: ['mapped-user'] });
    expect((await request(app).post('/admin/reinitializeUserMapping').query({ ...authQuery(), rcAccessToken: 'rc-token' }).send({ rcExtensionList: ['100'] })).body).toEqual({ users: ['remapped-user'] });
    expect((await request(app).get('/admin/serverLoggingSettings').query(authQuery())).body).toEqual({ enabled: true });
    expect((await request(app).post('/admin/serverLoggingSettings').query(authQuery()).send({ additionalFieldValues: { enabled: true } })).body).toEqual({
      successful: true,
      returnMessage: { messageType: 'success', message: 'Updated' },
    });
  });

  test('serves user settings, user info, hostname, and user hash routes', async () => {
    expect((await request(app).get('/user/preloadSettings').query({ rcAccessToken: 'rc-token' })).body).toEqual({ fields: [] });
    expect((await request(app).post('/user/refreshInfo').query(authQuery()).send({})).body).toEqual({
      successful: true,
      returnMessage: { messageType: 'success', message: 'Refreshed' },
    });
    expect((await request(app).get('/user/settings').query({ ...authQuery(), rcAccessToken: 'rc-token' })).body).toEqual({ timezone: 'UTC' });
    expect((await request(app).post('/user/settings').query(authQuery()).send({ userSettings: { timezone: 'UTC' } })).body).toEqual({ userSettings: { timezone: 'UTC' } });
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

    expect((await request(app).post('/apiKeyLogin').send({ platform: 'testCRM', apiKey: 'api-key', rcAccessToken: 'rc-token' })).body).toEqual({
      jwtToken: 'generated-crm-jwt',
      name: 'CRM User',
      returnMessage: { messageType: 'success', message: 'Connected' },
    });
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

  test('serves appointment list, create, update, refresh, confirm, and cancel routes', async () => {
    expect((await request(app).get('/appointments').query(authQuery())).body.appointments).toEqual([{ id: 'appt-1' }]);
    expect((await request(app).post('/appointments').query(authQuery()).send({ payload: { title: 'Meet' } })).body.appointmentId).toBe('appt-2');
    expect((await request(app).patch('/appointments/appt-2').query(authQuery()).send({ patch: { title: 'Updated' } })).body.appointmentId).toBe('appt-2');
    expect((await request(app).get('/appointments/appt-2/refresh').query(authQuery())).body.appointmentId).toBe('appt-2');
    expect((await request(app).post('/appointments/appt-2/confirm').query(authQuery())).body.appointmentId).toBe('appt-2');
    expect((await request(app).post('/appointments/appt-2/cancel').query(authQuery())).body.appointmentId).toBe('appt-2');
  });

  test('serves call-log, disposition, and message-log routes', async () => {
    expect((await request(app).post('/callLog/cacheNote').query(authQuery()).send({ sessionId: 's1', note: 'note' })).body.successful).toBe(true);
    expect((await request(app).get('/callLog').query({ ...authQuery(), sessionIds: 's1', requireDetails: 'true' })).body.logs).toEqual([{ sessionId: 'session-1' }]);
    expect((await request(app).post('/callLog').query(authQuery()).send({ logInfo: { accountId: 'acc' } })).body.logId).toBe('log-1');
    expect((await request(app).patch('/callLog').query(authQuery()).send({ accountId: 'acc' })).body.updatedNote).toBe('updated');
    expect((await request(app).put('/callDisposition').query(authQuery()).send({ sessionId: 's1', dispositions: ['left voicemail'] })).body.successful).toBe(true);
    expect((await request(app).post('/messageLog').query(authQuery()).send({ messages: [] })).body.logIds).toEqual(['msg-1']);
  });

  test('serves RingCentral report, callback, debug, and plugin routes', async () => {
    expect((await request(app).get('/ringcentral/admin/report').query({ ...authQuery(), timezone: 'UTC' })).body).toEqual({ rows: [{ id: 'admin-row' }] });
    expect((await request(app).get('/ringcentral/admin/userReport').query({ ...authQuery(), rcExtensionId: 'ext-1' })).body).toEqual({ rows: [{ id: 'user-row' }] });
    await expect(request(app).get('/ringcentral/oauth/callback').query({ ...authQuery(), code: 'rc-code' })).resolves.toMatchObject({ status: 200 });
    expect((await request(app).get('/debug/report/url').query(authQuery())).body).toEqual({ presignedUrl: 'https://upload.example.com/report' });
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
      ['post', '/appointments', { payload: { title: 'Meet' } }],
      ['patch', '/appointments/appt-2', { patch: { title: 'Meet' } }],
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
    await expectInvalidJwt(() => request(app).post('/appointments').query({ jwtToken: 'bad' }).send({ payload: {} }));
    await expectInvalidJwt(() => request(app).patch('/appointments/appt-2').query({ jwtToken: 'bad' }).send({ patch: {} }));
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
      ['post', '/appointments', appointmentCore.createAppointment, { payload: {} }],
      ['patch', '/appointments/appt-2', appointmentCore.updateAppointment, { patch: {} }],
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

    UserModel.findByPk.mockResolvedValueOnce(null);
    await expect(request(app).get('/admin/managedAuth').query({ ...authQuery(), rcAccessToken: 'rc-token' })).resolves.toMatchObject({ status: 400 });

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
    await expect(request(app).post('/appointments').query(authQuery()).send({ payload: {} })).resolves.toMatchObject({ status: 400 });

    appointmentCore.updateAppointment.mockRejectedValueOnce({ response: { status: 500 }, message: 'update appointment failed' });
    await expect(request(app).patch('/appointments/appt-2').query(authQuery()).send({ patch: {} })).resolves.toMatchObject({ status: 400 });

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
