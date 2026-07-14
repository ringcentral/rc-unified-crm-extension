const userAutoMatchRuleCases = [
  {
    label: 'email-only match',
    crmUser: {
      id: 'crm-email-only',
      name: 'CRM Email User',
      email: 'email-match@example.com',
    },
    rcExtensions: [
      {
        id: 'ext-email-only',
        name: 'Different RC Name',
        email: 'email-match@example.com',
        extensionNumber: '201',
      },
    ],
    expectedExtensionIds: ['ext-email-only'],
  },
  {
    label: 'exact-name-only match',
    crmUser: {
      id: 'crm-exact-name',
      name: 'Exact Shared Name',
      email: 'crm-name@example.com',
    },
    rcExtensions: [
      {
        id: 'ext-exact-name',
        name: 'Exact Shared Name',
        email: 'rc-name@example.com',
        extensionNumber: '202',
      },
    ],
    expectedExtensionIds: ['ext-exact-name'],
  },
  {
    label: 'composed first-and-last-name match',
    crmUser: {
      id: 'crm-composed-name',
      name: 'Morgan Rivera',
      email: 'crm-composed@example.com',
    },
    rcExtensions: [
      {
        id: 'ext-composed-name',
        firstName: 'Morgan',
        lastName: 'Rivera',
        email: 'rc-composed@example.com',
        extensionNumber: '203',
      },
    ],
    expectedExtensionIds: ['ext-composed-name'],
  },
  {
    label: 'ambiguous match resolves to the first RC extension',
    crmUser: {
      id: 'crm-ambiguous',
      name: 'Shared Mapping Name',
      email: 'shared-mapping@example.com',
    },
    rcExtensions: [
      {
        id: 'ext-name-first',
        name: 'Shared Mapping Name',
        email: 'first-extension@example.com',
        extensionNumber: '204',
      },
      {
        id: 'ext-email-second',
        name: 'Different Name',
        email: 'shared-mapping@example.com',
        extensionNumber: '205',
      },
    ],
    expectedExtensionIds: ['ext-name-first'],
  },
  {
    label: 'unmatched identity remains unmapped',
    crmUser: {
      id: 'crm-unmatched',
      name: 'Unmatched CRM User',
      email: 'unmatched-crm@example.com',
    },
    rcExtensions: [
      {
        id: 'ext-unrelated',
        firstName: 'Unrelated',
        lastName: 'RC User',
        email: 'unrelated-rc@example.com',
        extensionNumber: '206',
      },
    ],
    expectedExtensionIds: [],
  },
];

const incrementalUserMappingPersistenceCases = [
  {
    label: 'existing extension array remains flat when a new match is appended',
    initialMappings: [
      {
        crmUserId: 'crm-existing-array',
        rcExtensionId: ['ext-existing-1', 'ext-existing-2'],
      },
    ],
    crmUsers: [
      {
        id: 'crm-existing-array',
        name: 'Existing Array User',
        email: 'existing-array@example.com',
      },
      {
        id: 'crm-new-array',
        name: 'New Array User',
        email: 'new-array@example.com',
      },
    ],
    rcExtensions: [
      {
        id: 'ext-existing-1',
        name: 'Existing RC One',
        email: 'existing-one@example.com',
        extensionNumber: '301',
      },
      {
        id: 'ext-existing-2',
        name: 'Existing RC Two',
        email: 'existing-two@example.com',
        extensionNumber: '302',
      },
      {
        id: 'ext-new-array',
        name: 'New Array User',
        email: 'new-array@example.com',
        extensionNumber: '303',
      },
    ],
    expectedResultExtensionIdsByCrmUser: {
      'crm-existing-array': ['ext-existing-1', 'ext-existing-2'],
      'crm-new-array': ['ext-new-array'],
    },
    expectedPersistedMappings: [
      {
        crmUserId: 'crm-existing-array',
        rcExtensionId: ['ext-existing-1', 'ext-existing-2'],
      },
      {
        crmUserId: 'crm-new-array',
        rcExtensionId: ['ext-new-array'],
      },
    ],
  },
  {
    label: 'legacy scalar extension is normalized when a new match is appended',
    initialMappings: [
      {
        crmUserId: 'crm-existing-scalar',
        rcExtensionId: 'ext-existing-scalar',
      },
    ],
    crmUsers: [
      {
        id: 'crm-existing-scalar',
        name: 'Existing Scalar User',
        email: 'existing-scalar@example.com',
      },
      {
        id: 'crm-new-scalar',
        name: 'New Scalar User',
        email: 'new-scalar@example.com',
      },
    ],
    rcExtensions: [
      {
        id: 'ext-existing-scalar',
        name: 'Existing Scalar RC',
        email: 'existing-scalar@example.com',
        extensionNumber: '304',
      },
      {
        id: 'ext-new-scalar',
        name: 'New Scalar User',
        email: 'new-scalar@example.com',
        extensionNumber: '305',
      },
    ],
    expectedResultExtensionIdsByCrmUser: {
      'crm-existing-scalar': ['ext-existing-scalar'],
      'crm-new-scalar': ['ext-new-scalar'],
    },
    expectedPersistedMappings: [
      {
        crmUserId: 'crm-existing-scalar',
        rcExtensionId: ['ext-existing-scalar'],
      },
      {
        crmUserId: 'crm-new-scalar',
        rcExtensionId: ['ext-new-scalar'],
      },
    ],
  },
];

module.exports = {
  userAutoMatchRuleCases,
  incrementalUserMappingPersistenceCases,
};

export {};
