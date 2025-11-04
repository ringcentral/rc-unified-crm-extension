jest.mock('axios', () => jest.fn());
jest.mock('../../../models/dynamo/connectorSchema', () => ({
  Connector: { getProxyConfig: jest.fn() }
}));
jest.mock('awesome-phonenumber', () => ({
  parsePhoneNumber: jest.fn().mockReturnValue({})
}));
jest.mock('../../../models/userModel', () => ({
  UserModel: { findByPk: jest.fn() }
}));

const axios = require('axios');
const { Connector } = require('../../../models/dynamo/connectorSchema');
const { UserModel } = require('../../../models/userModel');
const proxy = require('../../../connector/proxy/index');
const sampleConfig = require('./sample.json');

describe('proxy connector (high-level)', () => {
  beforeEach(() => {
    axios.mockReset();
  });

  test('createCallLog returns mapped logId using provided proxyConfig', async () => {
    // Response matching mapping: response.activity.id (engine wraps as { response: response.data })
    axios.mockResolvedValue({ data: { activity: { id: 'A-100' } } });

    const user = { accessToken: 't-123', platformAdditionalInfo: { proxyId: 'p1' } };
    const contactInfo = { id: 'c-1', name: 'Alice' };
    const callLog = { direction: 'Outbound', startTime: Date.now(), duration: 60 };

    const res = await proxy.createCallLog({
      user,
      contactInfo,
      authHeader: 'Basic abc',
      callLog,
      note: 'hello',
      additionalSubmission: {},
      aiNote: '',
      transcript: '',
      hashedAccountId: 'h1',
      isFromSSCL: false,
      composedLogDetails: 'details',
      proxyConfig: sampleConfig
    });

    expect(res.logId).toBe('A-100');
    expect(res.returnMessage.messageType).toBe('success');
    expect(axios).toHaveBeenCalledTimes(1);
    const args = axios.mock.calls[0][0];
    expect(args.method).toBe('POST');
    expect(args.url).toMatch(/\/activities$/);
    expect(args.headers['Content-Type']).toBe('application/json');
    expect(args.data.subject).toMatch(/Call/);
    expect(args.data.linked_contacts[0].contact_id).toBe('c-1');
  });

  test('getCallLog maps subject, note and fullBody', async () => {
    axios.mockResolvedValue({ data: { activity: { subject: 'S', note: 'N', description: 'D' } } });

    const out = await proxy.getCallLog({
      user: { accessToken: 't-123', platformAdditionalInfo: { proxyId: 'p1' } },
      callLogId: '123',
      contactId: 'c-1',
      authHeader: 'x',
      proxyConfig: sampleConfig
    });

    expect(out.callLogInfo.subject).toBe('S');
    expect(out.callLogInfo.note).toBe('N');
    expect(out.callLogInfo.fullBody).toBe('D');
    expect(out.callLogInfo.fullLogResponse).toBeDefined();
  });

  test('updateCallLog performs PUT and returns success message', async () => {
    axios.mockResolvedValue({ data: { ok: true } });

    const start = new Date('2020-01-01T00:00:00Z');
    const res = await proxy.updateCallLog({
      user: { accessToken: 't-123', platformAdditionalInfo: { proxyId: 'p1' } },
      existingCallLog: { thirdPartyLogId: '77' },
      authHeader: 'x',
      recordingLink: '',
      recordingDownloadLink: '',
      subject: 'Subj',
      note: 'Note',
      startTime: start,
      duration: 90,
      result: 'Completed',
      aiNote: '',
      transcript: '',
      legs: [],
      additionalSubmission: {},
      composedLogDetails: 'Body',
      existingCallLogDetails: {},
      hashedAccountId: 'h',
      isFromSSCL: false,
      proxyConfig: sampleConfig
    });

    expect(res.returnMessage.message).toMatch(/updated/i);
    const args = axios.mock.calls[0][0];
    expect(args.method).toBe('PUT');
    expect(args.url).toMatch(/\/activities\/77$/);
    expect(args.data.subject).toBe('Subj');
    expect(args.data.end_date).toBeDefined();
  });

  test('getLogFormatType returns meta.logFormat or custom', () => {
    expect(proxy.getLogFormatType('x', sampleConfig)).toBe('text/plain');
    expect(proxy.getLogFormatType('x', null)).toBe('custom');
  });
});

describe('proxy connector - more coverage', () => {
  beforeEach(() => {
    axios.mockReset();
    Connector.getProxyConfig.mockReset();
  });

  test('getAuthType returns apiKey', async () => {
    expect(await proxy.getAuthType()).toBe('apiKey');
  });

  test('getBasicAuth encodes apiKey with colon', () => {
    const token = proxy.getBasicAuth({ apiKey: 'abc' });
    expect(token).toBe(Buffer.from('abc:').toString('base64'));
  });

  test('getUserInfo maps id/name/message/platformAdditionalInfo', async () => {
    const cfg = JSON.parse(JSON.stringify(sampleConfig));
    delete cfg.auth; // ensure provided authHeader is used
    Connector.getProxyConfig.mockResolvedValue(cfg);
    axios.mockResolvedValue({ data: { user: { username: 'u1', role: 'admin' }, message: 'OK' } });

    const res = await proxy.getUserInfo({
      authHeader: 'Basic t',
      hostname: 'host',
      additionalInfo: { foo: 'bar' },
      platform: 'test',
      apiKey: 'k',
      proxyId: 'p1'
    });

    expect(res.successful).toBe(true);
    expect(res.platformUserInfo.id).toBe('u1-test');
    expect(res.platformUserInfo.name).toBe('u1');
    expect(res.returnMessage.message).toBe('OK');
    expect(res.platformUserInfo.platformAdditionalInfo.userResponse).toEqual({ username: 'u1', role: 'admin' });
  });

  test('findContact maps list items', async () => {
    Connector.getProxyConfig.mockResolvedValue(sampleConfig);
    axios.mockResolvedValue({ data: { contacts: [ { id: 'c1', name: 'Alice', type: 'Contact', phone: '+1' } ] } });

    const out = await proxy.findContact({
      user: { accessToken: 't', platformAdditionalInfo: { proxyId: 'p1' } },
      authHeader: 'x',
      phoneNumber: '+1',
      overridingFormat: '',
      isExtension: false
    });

    expect(out.successful).toBe(true);
    expect(out.matchedContactInfo.length).toBe(1);
    expect(out.matchedContactInfo[0].id).toBe('c1');
  });

  test('createContact maps object response', async () => {
    Connector.getProxyConfig.mockResolvedValue(sampleConfig);
    axios.mockResolvedValue({ data: { id: 'c2', name: 'Bob', type: 'Lead' } });

    const res = await proxy.createContact({
      user: { accessToken: 't', platformAdditionalInfo: { proxyId: 'p1' } },
      authHeader: 'x',
      phoneNumber: '+1',
      newContactName: 'Bob',
      newContactType: 'Lead',
      additionalSubmission: {}
    });

    expect(res.contactInfo).toEqual({ id: 'c2', name: 'Bob', type: 'Lead' });
    expect(res.returnMessage.messageType).toBe('success');
  });

  test('createMessageLog maps idPath and updateMessageLog returns success', async () => {
    Connector.getProxyConfig.mockResolvedValue(sampleConfig);
    axios.mockResolvedValueOnce({ data: { activity: { id: 'M1' } } });

    const create = await proxy.createMessageLog({
      user: { accessToken: 't', platformAdditionalInfo: { proxyId: 'p1' } },
      contactInfo: { id: 'c1', name: 'Alice' },
      authHeader: 'x',
      message: { subject: 'S', direction: 'Outbound', from: { phoneNumber: '+1' }, creationTime: Date.now() },
      additionalSubmission: {},
      recordingLink: '',
      faxDocLink: '',
      faxDownloadLink: '',
      imageLink: '',
      videoLink: ''
    });
    expect(create.logId).toBe('M1');

    axios.mockResolvedValueOnce({ data: { ok: true } });
    const update = await proxy.updateMessageLog({
      user: { accessToken: 't', platformAdditionalInfo: { proxyId: 'p1' } },
      contactInfo: { id: 'c1', name: 'Alice' },
      existingMessageLog: { thirdPartyLogId: 'M1' },
      message: { subject: 'S', direction: 'Outbound', from: { phoneNumber: '+1' }, creationTime: Date.now() },
      authHeader: 'x',
      additionalSubmission: {},
      imageLink: '',
      videoLink: ''
    });
    expect(update.returnMessage.message).toMatch(/updated/i);
    const args2 = axios.mock.calls[1][0];
    expect(args2.url).toMatch(/\/activities\/M1$/);
  });

  test('upsertCallDisposition returns Not supported when op missing', async () => {
    Connector.getProxyConfig.mockResolvedValue(sampleConfig);
    const res = await proxy.upsertCallDisposition({
      user: { accessToken: 't', platformAdditionalInfo: { proxyId: 'p1' } },
      existingCallLog: { thirdPartyLogId: 'L1' },
      authHeader: 'x',
      dispositions: []
    });
    expect(res.returnMessage.message).toMatch(/Not supported/);
  });

  test('getLicenseStatus maps values with custom config', async () => {
    const licenseConfig = {
      requestDefaults: { baseUrl: 'https://api.example.com' },
      operations: {
        getLicenseStatus: {
          method: 'GET',
          url: '/license/{{userId}}',
          responseMapping: {
            isLicenseValidPath: 'body.valid',
            licenseStatusPath: 'body.status',
            licenseStatusDescriptionPath: 'body.desc'
          }
        }
      }
    };
    Connector.getProxyConfig.mockResolvedValue(licenseConfig);
    axios.mockResolvedValue({ data: { valid: true, status: 'Pro', desc: 'All good' } });
    UserModel.findByPk.mockResolvedValue({ id: 'u1', accessToken: 't', platformAdditionalInfo: { proxyId: 'p1' } });

    const s = await proxy.getLicenseStatus({ userId: 'u1', platform: 'x' });
    expect(s.isLicenseValid).toBe(true);
    expect(s.licenseStatus).toBe('Pro');
    expect(s.licenseStatusDescription).toBe('All good');
  });

  test('unAuthorize without custom op clears tokens and saves user', async () => {
    Connector.getProxyConfig.mockResolvedValue(sampleConfig); // no unAuthorize op
    const user = { accessToken: 't', refreshToken: 'r', save: jest.fn(), platformAdditionalInfo: { proxyId: 'p1' } };
    const out = await proxy.unAuthorize({ user });
    expect(user.accessToken).toBe('');
    expect(user.refreshToken).toBe('');
    expect(user.save).toHaveBeenCalled();
    expect(out.returnMessage.messageType).toBe('success');
  });

  test('unAuthorize with custom op triggers request then clears tokens', async () => {
    const cfg = {
      requestDefaults: { baseUrl: 'https://api.example.com' },
      operations: { unAuthorize: { method: 'POST', url: '/logout' } }
    };
    Connector.getProxyConfig.mockResolvedValue(cfg);
    axios.mockResolvedValue({ data: { ok: true } });
    const user = { accessToken: 't', refreshToken: 'r', save: jest.fn(), platformAdditionalInfo: { proxyId: 'p1' } };
    const out = await proxy.unAuthorize({ user });
    expect(axios).toHaveBeenCalledTimes(1);
    expect(out.returnMessage.message).toMatch(/Logged out/);
    expect(user.accessToken).toBe('');
  });
});

