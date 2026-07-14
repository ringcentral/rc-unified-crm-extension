const nock = require('nock');
const {
  startServer,
  stopServer,
  cleanE2EData,
  generateJwt,
} = require('./support/serverHarness');
const { UserModel } = require('@app-connect/core/models/userModel');
const { AccountDataModel } = require('@app-connect/core/models/accountDataModel');
const {
  contactLifecycleCases,
  pipedriveRateLimitHeaders,
} = require('./support/contactLifecycleCases');

describe('Pipedrive contact lifecycle App-level E2E', () => {
  const platform = 'pipedrive';
  const userId = 'e2e-contact-lifecycle-pipedrive-user';
  const rcAccountId = 'e2e-contact-lifecycle-pipedrive-account';
  const rcUserNumber = '+14155550999';
  const hostname = 'contact-lifecycle.pipedrive.com';
  const apiBaseUrl = `https://${hostname}`;
  const accessToken = 'e2e-contact-lifecycle-access-token';
  const expectedAuthorization = `Bearer ${accessToken}`;

  let server;
  let client;
  let jwtToken;

  async function seedUser() {
    await UserModel.create({
      id: userId,
      platform,
      hostname,
      rcAccountId,
      rcUserNumber,
      accessToken,
      refreshToken: 'e2e-contact-lifecycle-refresh-token',
      tokenExpiry: new Date(Date.now() + 60 * 60 * 1000),
      timezoneOffset: '+00:00',
      platformAdditionalInfo: {},
      userSettings: {},
      hashedRcExtensionId: 'e2e-contact-lifecycle-hashed-extension',
    });
    jwtToken = generateJwt({ id: userId, platform, rcUserNumber });
  }

  async function cleanData() {
    await cleanE2EData({ userIds: [userId], rcAccountIds: [rcAccountId] });
  }

  function mockPersonSearch({ phoneSearchTerm, crmSearchResponse }) {
    return nock(apiBaseUrl)
      .matchHeader('authorization', expectedAuthorization)
      .get('/api/v2/persons/search')
      .query({ term: phoneSearchTerm, fields: 'phone' })
      .reply(200, crmSearchResponse, pipedriveRateLimitHeaders);
  }

  function mockPersonEnrichment({ personId, crmDealsResponse, crmLeadsResponse }) {
    const dealScope = nock(apiBaseUrl)
      .matchHeader('authorization', expectedAuthorization)
      .get('/api/v2/deals')
      .query({ person_id: String(personId), status: 'open' })
      .reply(200, crmDealsResponse, pipedriveRateLimitHeaders);
    const leadScope = nock(apiBaseUrl)
      .matchHeader('authorization', expectedAuthorization)
      .get('/v1/leads')
      .query({ person_id: String(personId) })
      .reply(200, crmLeadsResponse, pipedriveRateLimitHeaders);

    return { dealScope, leadScope };
  }

  async function findContact(phoneNumber) {
    return client.get('/contact', {
      params: {
        jwtToken,
        phoneNumber,
        isExtension: 'false',
      },
    });
  }

  async function findCachedContact(phoneNumber) {
    return AccountDataModel.findOne({
      where: {
        rcAccountId,
        platformName: platform,
        dataKey: `contact-${phoneNumber}`,
      },
    });
  }

  beforeAll(async () => {
    ({ server, client } = await startServer());
  });

  afterAll(async () => {
    try {
      await cleanData();
    } finally {
      await stopServer(server);
    }
  });

  beforeEach(async () => {
    nock.cleanAll();
    await cleanData();
    await seedUser();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  test('returns an unmatched result without persisting an empty CRM search', async () => {
    const testCase = contactLifecycleCases.unmatched;
    const personSearchScope = mockPersonSearch(testCase);

    const response = await findContact(testCase.phoneNumber);

    expect(response.status).toBe(200);
    expect(response.data).toMatchObject(testCase.expectedResponse);
    expect(response.data.returnMessage.details[0].items[0].text).toContain(testCase.phoneNumber);
    expect(personSearchScope.isDone()).toBe(true);
    expect(await findCachedContact(testCase.phoneNumber)).toBeNull();
  });

  test('maps and caches one CRM match, then serves the repeat lookup from persistence', async () => {
    const testCase = contactLifecycleCases.oneMatch;
    const personSearchScope = mockPersonSearch(testCase);
    const { dealScope, leadScope } = mockPersonEnrichment(testCase.enrichments[0]);

    const response = await findContact(testCase.phoneNumber);

    expect(response.status).toBe(200);
    expect(response.data).toEqual(testCase.expectedResponse);
    expect(personSearchScope.isDone()).toBe(true);
    expect(dealScope.isDone()).toBe(true);
    expect(leadScope.isDone()).toBe(true);

    const cachedContact = await findCachedContact(testCase.phoneNumber);
    expect(cachedContact).not.toBeNull();
    expect(cachedContact.data).toEqual(testCase.expectedContacts);

    // No CRM mocks remain. With real network disabled by the E2E setup, this can
    // only succeed if the framework reads the persisted contact result.
    const cachedResponse = await findContact(testCase.phoneNumber);
    expect(cachedResponse.status).toBe(200);
    expect(cachedResponse.data).toEqual(testCase.expectedCachedResponse);
  });

  test('maps and caches multiple CRM matches with each contact enrichment', async () => {
    const testCase = contactLifecycleCases.multipleMatches;
    const personSearchScope = mockPersonSearch(testCase);
    const firstEnrichment = mockPersonEnrichment(testCase.enrichments[0]);
    const secondEnrichment = mockPersonEnrichment(testCase.enrichments[1]);

    const response = await findContact(testCase.phoneNumber);

    expect(response.status).toBe(200);
    expect(response.data).toEqual(testCase.expectedResponse);
    expect(personSearchScope.isDone()).toBe(true);
    expect(firstEnrichment.dealScope.isDone()).toBe(true);
    expect(firstEnrichment.leadScope.isDone()).toBe(true);
    expect(secondEnrichment.dealScope.isDone()).toBe(true);
    expect(secondEnrichment.leadScope.isDone()).toBe(true);

    const cachedContact = await findCachedContact(testCase.phoneNumber);
    expect(cachedContact).not.toBeNull();
    expect(cachedContact.data).toEqual(testCase.expectedContacts);
  });

  test('creates a contact through the real connector with the expected CRM request', async () => {
    const testCase = contactLifecycleCases.create;
    let crmRequestBody;
    const createContactScope = nock(apiBaseUrl)
      .matchHeader('authorization', expectedAuthorization)
      .post('/v1/persons', body => {
        crmRequestBody = body;
        return true;
      })
      .reply(201, testCase.crmResponse, pipedriveRateLimitHeaders);

    const response = await client.post(
      '/contact',
      testCase.acRequestBody,
      { params: { jwtToken } },
    );

    expect(response.status).toBe(200);
    expect(response.data).toEqual(testCase.expectedResponse);
    expect(createContactScope.isDone()).toBe(true);
    expect(crmRequestBody).toEqual(testCase.expectedCrmRequestBody);
    expect(await findCachedContact(testCase.phoneNumber)).toBeNull();
  });
});

export {};
