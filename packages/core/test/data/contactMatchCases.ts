const contactMatchCardinalityCases = [
  {
    label: 'null result as unmatched',
    matchedContactInfo: null,
    connectorSuccessful: false,
    expectedRealContactCount: 0,
    shouldCache: false,
  },
  {
    label: 'empty result as unmatched',
    matchedContactInfo: [],
    connectorSuccessful: true,
    expectedRealContactCount: 0,
    shouldCache: false,
  },
  {
    label: 'create-contact placeholder only as unmatched',
    matchedContactInfo: [
      {
        id: 'create-new-contact',
        name: 'Create new contact',
        type: 'Contact',
        isNewContact: true,
      },
    ],
    connectorSuccessful: true,
    expectedRealContactCount: 0,
    shouldCache: false,
  },
  {
    label: 'exactly one real contact',
    matchedContactInfo: [
      {
        id: 'contact-one',
        name: 'Maya Patel',
        type: 'Contact',
      },
    ],
    connectorSuccessful: true,
    expectedRealContactCount: 1,
    shouldCache: true,
  },
  {
    label: 'multiple real contacts',
    matchedContactInfo: [
      {
        id: 'contact-multiple-1',
        name: 'Jordan Lee',
        type: 'Contact',
      },
      {
        id: 'contact-multiple-2',
        name: 'Jordan Lee',
        type: 'Lead',
      },
    ],
    connectorSuccessful: true,
    expectedRealContactCount: 2,
    shouldCache: true,
  },
  {
    label: 'real contact mixed with a create-contact placeholder',
    matchedContactInfo: [
      {
        id: 'contact-mixed-1',
        name: "Siobhan O'Connor",
        type: 'Candidate',
      },
      {
        id: 'create-new-mixed-contact',
        name: 'Create new contact',
        type: 'Contact',
        isNewContact: true,
      },
    ],
    connectorSuccessful: true,
    expectedRealContactCount: 1,
    shouldCache: true,
  },
];

const phoneContactMatchCases = contactMatchCardinalityCases.map((testCase, index) => ({
  ...testCase,
  phoneNumber: `+141555501${String(index).padStart(2, '0')}`,
}));

const nameContactMatchCases = contactMatchCardinalityCases.map((testCase, index) => ({
  ...testCase,
  name: `Cardinality Search ${index}`,
}));

module.exports = {
  phoneContactMatchCases,
  nameContactMatchCases,
};

export {};
