const phoneSearchForwardingCases = [
  {
    label: 'NANP E.164 number',
    phoneNumber: '+14155550100',
    overridingFormat: undefined,
    isExtension: undefined,
    expectedFormat: '',
    expectedExtension: false,
  },
  {
    label: 'UK E.164 number',
    phoneNumber: '+442071838750',
    overridingFormat: undefined,
    isExtension: false,
    expectedFormat: '',
    expectedExtension: false,
  },
  {
    label: 'Japan E.164 number',
    phoneNumber: '+81312345678',
    overridingFormat: '+81 (0)3-1234-5678',
    isExtension: false,
    expectedFormat: '+81 (0)3-1234-5678',
    expectedExtension: false,
  },
  {
    label: 'formatted national number',
    phoneNumber: '(415) 555-0100',
    overridingFormat: '',
    isExtension: false,
    expectedFormat: '',
    expectedExtension: false,
  },
  {
    label: 'extension number',
    phoneNumber: '101',
    overridingFormat: 'ext. 101',
    isExtension: true,
    expectedFormat: 'ext. 101',
    expectedExtension: true,
  },
  {
    label: 'zero-like extension',
    phoneNumber: '0',
    overridingFormat: '0000',
    isExtension: true,
    expectedFormat: '0000',
    expectedExtension: true,
  },
  {
    label: 'full-width Unicode digits',
    phoneNumber: '＋１４１５５５５０１００',
    overridingFormat: '国際番号',
    isExtension: false,
    expectedFormat: '国際番号',
    expectedExtension: false,
  },
  {
    label: 'punctuation-heavy dial string',
    phoneNumber: '+1-415-555-0100;ext=42',
    overridingFormat: '+1 (415) 555-0100 x42',
    isExtension: false,
    expectedFormat: '+1 (415) 555-0100 x42',
    expectedExtension: false,
  },
];

const invalidPhoneSearchOptionCases = [
  { field: 'overridingFormat', value: null, expected: 'Overriding format must be a string' },
  { field: 'overridingFormat', value: 123, expected: 'Overriding format must be a string' },
  { field: 'overridingFormat', value: false, expected: 'Overriding format must be a string' },
  { field: 'overridingFormat', value: {}, expected: 'Overriding format must be a string' },
  { field: 'isExtension', value: null, expected: 'isExtension must be a boolean' },
  { field: 'isExtension', value: 'true', expected: 'isExtension must be a boolean' },
  { field: 'isExtension', value: 1, expected: 'isExtension must be a boolean' },
  { field: 'isExtension', value: {}, expected: 'isExtension must be a boolean' },
];

const invalidFindByPhoneCapabilityCases = [
  { label: 'missing capability', connector: {} },
  { label: 'null capability', connector: { findContact: null } },
  { label: 'string capability', connector: { findContact: 'yes' } },
  { label: 'object capability', connector: { findContact: {} } },
];

module.exports = {
  phoneSearchForwardingCases,
  invalidPhoneSearchOptionCases,
  invalidFindByPhoneCapabilityCases,
};

export {};
