const pipedriveRateLimitHeaders = {
  'x-ratelimit-remaining': '99',
  'x-ratelimit-limit': '100',
  'x-ratelimit-reset': '60',
};

const createNewContactOption = {
  id: 'createNewContact',
  name: 'Create new contact...',
  isNewContact: true,
};

const unmatchedContactCase = {
  phoneNumber: '+14155550101',
  phoneSearchTerm: '4155550101',
  crmSearchResponse: {
    data: {
      items: [],
    },
  },
  expectedResponse: {
    successful: true,
    returnMessage: {
      message: 'Contact not found',
      messageType: 'warning',
      ttl: 5000,
    },
    contact: [createNewContactOption],
  },
};

const oneMatchedContact = {
  id: 1101,
  name: 'Ada Lovelace',
  phone: '+14155550102',
  createdDate: '2026-07-01T10:00:00Z',
  mostRecentActivityDate: '2026-07-02T11:00:00Z',
  organization: 'Analytical Engines',
  additionalInfo: {
    deals: [{ const: 2101, title: 'Engine renewal' }],
    leads: [{ const: 'lead-3101', title: 'Expansion lead' }],
  },
  type: 'contact',
};

const oneMatchCase = {
  phoneNumber: '+14155550102',
  phoneSearchTerm: '4155550102',
  crmSearchResponse: {
    data: {
      items: [{
        item: {
          id: 1101,
          name: 'Ada Lovelace',
          add_time: '2026-07-01T10:00:00Z',
          update_time: '2026-07-02T11:00:00Z',
          organization: { name: 'Analytical Engines' },
        },
      }],
    },
  },
  enrichments: [{
    personId: 1101,
    crmDealsResponse: {
      data: [{ id: 2101, title: 'Engine renewal' }],
    },
    crmLeadsResponse: {
      data: [{ id: 'lead-3101', title: 'Expansion lead' }],
    },
  }],
  expectedContacts: [oneMatchedContact, createNewContactOption],
  expectedResponse: {
    successful: true,
    contact: [oneMatchedContact, createNewContactOption],
  },
  expectedCachedResponse: {
    successful: true,
    returnMessage: null,
    contact: [oneMatchedContact, createNewContactOption],
  },
};

const firstMultipleMatchedContact = {
  id: 1201,
  name: 'Grace Hopper',
  phone: '+14155550103',
  createdDate: '2026-07-03T10:00:00Z',
  mostRecentActivityDate: '2026-07-04T11:00:00Z',
  organization: 'Compiler Labs',
  additionalInfo: {
    deals: [{ const: 2201, title: 'Compiler modernization' }],
  },
  type: 'contact',
};

const secondMultipleMatchedContact = {
  id: 1202,
  name: 'Rear Admiral Hopper',
  phone: '+14155550103',
  createdDate: '2026-07-05T12:00:00Z',
  mostRecentActivityDate: '2026-07-06T13:00:00Z',
  organization: '',
  additionalInfo: {
    leads: [{ const: 'lead-3202', title: 'Navy systems lead' }],
  },
  type: 'contact',
};

const multipleMatchCase = {
  phoneNumber: '+14155550103',
  phoneSearchTerm: '4155550103',
  crmSearchResponse: {
    data: {
      items: [
        {
          item: {
            id: 1201,
            name: 'Grace Hopper',
            add_time: '2026-07-03T10:00:00Z',
            update_time: '2026-07-04T11:00:00Z',
            organization: { name: 'Compiler Labs' },
          },
        },
        {
          item: {
            id: 1202,
            name: 'Rear Admiral Hopper',
            add_time: '2026-07-05T12:00:00Z',
            update_time: '2026-07-06T13:00:00Z',
            organization: null,
          },
        },
      ],
    },
  },
  enrichments: [
    {
      personId: 1201,
      crmDealsResponse: {
        data: [{ id: 2201, title: 'Compiler modernization' }],
      },
      crmLeadsResponse: {
        data: [],
      },
    },
    {
      personId: 1202,
      crmDealsResponse: {
        data: [],
      },
      crmLeadsResponse: {
        data: [{ id: 'lead-3202', title: 'Navy systems lead' }],
      },
    },
  ],
  expectedContacts: [
    firstMultipleMatchedContact,
    secondMultipleMatchedContact,
    createNewContactOption,
  ],
  expectedResponse: {
    successful: true,
    contact: [
      firstMultipleMatchedContact,
      secondMultipleMatchedContact,
      createNewContactOption,
    ],
  },
};

const createContactCase = {
  phoneNumber: '+14155550104',
  newContactName: 'Katherine Johnson',
  acRequestBody: {
    phoneNumber: '+14155550104',
    newContactName: 'Katherine Johnson',
    newContactType: 'contact',
  },
  expectedCrmRequestBody: {
    name: 'Katherine Johnson',
    phone: '+14155550104',
  },
  crmResponse: {
    data: {
      id: 1301,
      name: 'Katherine Johnson',
      phone: [{ value: '+14155550104', primary: true }],
    },
  },
  expectedResponse: {
    successful: true,
    returnMessage: {
      message: 'Contact created.',
      messageType: 'success',
      ttl: 2000,
    },
    contact: {
      id: 1301,
      name: 'Katherine Johnson',
    },
  },
};

const contactLifecycleCases = {
  unmatched: unmatchedContactCase,
  oneMatch: oneMatchCase,
  multipleMatches: multipleMatchCase,
  create: createContactCase,
};

module.exports = {
  contactLifecycleCases,
  pipedriveRateLimitHeaders,
};

export {};
