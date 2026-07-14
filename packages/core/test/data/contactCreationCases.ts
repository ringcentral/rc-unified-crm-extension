const createContactOAuthRefreshFailureCase = {
  user: {
    id: 'create-oauth-expired-user',
    platform: 'testCRM',
    accessToken: 'expired-access-token',
    refreshToken: 'expired-refresh-token',
    hostname: 'tenant.crm.example.com',
    platformAdditionalInfo: {
      tokenUrl: 'https://auth.crm.example.com/oauth/token',
    },
  },
  input: {
    platform: 'testCRM',
    userId: 'create-oauth-expired-user',
    phoneNumber: '+14155550200',
    newContactName: 'Expired OAuth Contact',
    newContactType: 'Contact',
    additionalSubmission: {
      source: 'oauth-expiry-test',
    },
  },
  oauthInfo: {
    clientId: 'oauth-client-id',
    clientSecret: 'oauth-client-secret',
    accessTokenUri: 'https://auth.crm.example.com/oauth/token',
    authorizationUri: 'https://auth.crm.example.com/oauth/authorize',
  },
  expectedReturnMessage: {
    message: 'User session expired. Please connect again.',
    messageType: 'warning',
    ttl: 5000,
  },
};

const createContactProxyForwardingCases = [
  {
    label: 'nested assignment metadata',
    user: {
      id: 'create-proxy-user-1',
      platform: 'testCRM',
      accessToken: 'proxy-api-key-1',
      platformAdditionalInfo: {
        proxyId: 'create-proxy-1',
      },
    },
    input: {
      platform: 'testCRM',
      userId: 'create-proxy-user-1',
      phoneNumber: '+442079460100',
      newContactName: 'Avery Morgan',
      newContactType: 'Lead',
      additionalSubmission: {
        adminAssignedUserRcId: 'ext-201',
        customFields: {
          source: 'Web campaign',
          consentGranted: true,
        },
        tags: ['priority', 'international'],
      },
    },
    proxyConfig: {
      id: 'create-proxy-1',
      baseUrl: 'https://proxy-one.crm.example.com',
      operations: {
        createContact: {
          method: 'POST',
          path: '/contacts',
        },
      },
    },
    basicAuth: 'encoded-proxy-key-1',
    providerResult: {
      contactInfo: {
        id: 'proxy-created-contact-1',
        name: 'Avery Morgan',
        type: 'Lead',
      },
      returnMessage: {
        message: 'Lead created through proxy',
        messageType: 'success',
        ttl: 2500,
      },
      extraDataTracking: {
        requestId: 'proxy-request-1',
        providerStatus: 201,
      },
    },
  },
  {
    label: 'falsey metadata values',
    user: {
      id: 'create-proxy-user-2',
      platform: 'testCRM',
      accessToken: 'proxy-api-key-2',
      platformAdditionalInfo: {
        proxyId: 'create-proxy-2',
      },
    },
    input: {
      platform: 'testCRM',
      userId: 'create-proxy-user-2',
      phoneNumber: '+81312345678',
      newContactName: 'Kai Tanaka',
      newContactType: 'Company',
      additionalSubmission: {
        score: 0,
        optedIn: false,
        note: '',
        optionalOwner: null,
      },
    },
    proxyConfig: {
      id: 'create-proxy-2',
      baseUrl: 'https://proxy-two.crm.example.com',
      operations: {
        createContact: {
          method: 'PUT',
          path: '/people',
        },
      },
    },
    basicAuth: 'encoded-proxy-key-2',
    providerResult: {
      contactInfo: {
        id: 'proxy-created-contact-2',
        name: 'Kai Tanaka',
        type: 'Company',
      },
      returnMessage: null,
      extraDataTracking: {
        requestId: 'proxy-request-2',
        providerStatus: 200,
      },
    },
  },
];

module.exports = {
  createContactOAuthRefreshFailureCase,
  createContactProxyForwardingCases,
};

export {};
