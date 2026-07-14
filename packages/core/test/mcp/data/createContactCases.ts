const { invalidContactPhoneNumberCases } = require('./contactToolCases');

const createContactForwardingCases = [
  {
    label: 'NANP E.164 number with an ASCII name',
    phoneNumber: '+14155550100',
    newContactName: 'Jane Doe',
    expectedName: 'Jane Doe',
  },
  {
    label: 'UK E.164 number with an accented name',
    phoneNumber: '+442071838750',
    newContactName: 'José Álvarez',
    expectedName: 'José Álvarez',
  },
  {
    label: 'Japan E.164 number with a CJK name',
    phoneNumber: '+81312345678',
    newContactName: '山田 太郎',
    expectedName: '山田 太郎',
  },
  {
    label: 'name with punctuation',
    phoneNumber: '+33142278186',
    newContactName: "Anne-Marie O'Connor & Co.",
    expectedName: "Anne-Marie O'Connor & Co.",
  },
  {
    label: 'leading and trailing name whitespace',
    phoneNumber: '+61293744000',
    newContactName: '  Customer Name  ',
    expectedName: '  Customer Name  ',
  },
  {
    label: 'omitted name fallback',
    phoneNumber: '+14155550101',
    newContactName: undefined,
    expectedName: '+14155550101',
  },
  {
    label: 'null name fallback',
    phoneNumber: '+14155550102',
    newContactName: null,
    expectedName: '+14155550102',
  },
  {
    label: 'empty name fallback',
    phoneNumber: '+14155550103',
    newContactName: '',
    expectedName: '+14155550103',
  },
  {
    label: 'whitespace-only name fallback',
    phoneNumber: '+14155550104',
    newContactName: ' \r\n\t ',
    expectedName: '+14155550104',
  },
  {
    label: 'long name',
    phoneNumber: '+14155550105',
    newContactName: `Customer-${'x'.repeat(4096)}`,
    expectedName: `Customer-${'x'.repeat(4096)}`,
  },
  {
    label: 'shortest structurally valid E.164 number',
    phoneNumber: '+12',
    newContactName: 'Short Boundary',
    expectedName: 'Short Boundary',
  },
  {
    label: 'maximum-length E.164 number',
    phoneNumber: '+123456789012345',
    newContactName: 'Long Boundary',
    expectedName: 'Long Boundary',
  },
];

const createContactSuccessCases = [
  {
    label: 'Unicode success message and structured contact',
    createResult: {
      successful: true,
      returnMessage: { message: '联系人已创建 🚀' },
      contact: { id: 0, name: 'José 客户', active: false },
    },
    expectedMessage: '联系人已创建 🚀',
  },
  {
    label: 'empty success message',
    createResult: { successful: true, returnMessage: { message: '' }, contact: null },
    expectedMessage: 'Contact created successfully',
  },
  {
    label: 'null return message',
    createResult: { successful: true, returnMessage: null, contact: [] },
    expectedMessage: 'Contact created successfully',
  },
  {
    label: 'missing return message',
    createResult: { successful: true, contact: 0 },
    expectedMessage: 'Contact created successfully',
  },
];

const createContactFailureCases = [
  {
    label: 'explicit failure message',
    createResult: { successful: false, returnMessage: { message: '创建失败' } },
    expected: '创建失败',
  },
  {
    label: 'empty failure message',
    createResult: { successful: false, returnMessage: { message: '' } },
    expected: 'Failed to create contact',
  },
  {
    label: 'null failure message',
    createResult: { successful: false, returnMessage: null },
    expected: 'Failed to create contact',
  },
  {
    label: 'missing failure message',
    createResult: { successful: false },
    expected: 'Failed to create contact',
  },
  {
    label: 'truthy non-boolean success flag',
    createResult: { successful: 'true', contact: { id: 'must-not-be-success' } },
    expected: 'Failed to create contact',
  },
  {
    label: 'numeric success flag',
    createResult: { successful: 1, contact: { id: 'must-not-be-success' } },
    expected: 'Failed to create contact',
  },
];

const invalidCreatePhoneCases = [
  ...invalidContactPhoneNumberCases,
  { label: 'phone without plus prefix', phoneNumber: '14155550100', expected: 'Phone number must be in E.164 format' },
  { label: 'phone containing spaces', phoneNumber: '+1 415 555 0100', expected: 'Phone number must be in E.164 format' },
  { label: 'hyphenated phone', phoneNumber: '+1-415-555-0100', expected: 'Phone number must be in E.164 format' },
  { label: 'parenthesized phone', phoneNumber: '+1(415)5550100', expected: 'Phone number must be in E.164 format' },
  { label: 'double-plus phone', phoneNumber: '++14155550100', expected: 'Phone number must be in E.164 format' },
  { label: 'zero country code phone', phoneNumber: '+0123456789', expected: 'Phone number must be in E.164 format' },
  { label: 'country-code-only phone', phoneNumber: '+1', expected: 'Phone number must be in E.164 format' },
  { label: 'overlong phone', phoneNumber: '+1234567890123456', expected: 'Phone number must be in E.164 format' },
  { label: 'full-width digit phone', phoneNumber: '+１２３４５６７８９０', expected: 'Phone number must be in E.164 format' },
  { label: 'phone with extension', phoneNumber: '+14155550100x42', expected: 'Phone number must be in E.164 format' },
  { label: 'phone with leading padding', phoneNumber: ' +14155550100', expected: 'Phone number must be in E.164 format' },
  { label: 'phone with trailing padding', phoneNumber: '+14155550100 ', expected: 'Phone number must be in E.164 format' },
  { label: 'phone with decimal punctuation', phoneNumber: '+1.4155550100', expected: 'Phone number must be in E.164 format' },
];

const invalidCreateNameCases = [
  { label: 'numeric name', newContactName: 42 },
  { label: 'boolean name', newContactName: false },
  { label: 'object name', newContactName: { first: 'Jane' } },
  { label: 'array name', newContactName: ['Jane', 'Doe'] },
];

const invalidCreateCapabilityCases = [
  { label: 'missing capability', connector: {} },
  { label: 'null capability', connector: { createContact: null } },
  { label: 'string capability', connector: { createContact: 'yes' } },
  { label: 'object capability', connector: { createContact: {} } },
];

module.exports = {
  createContactForwardingCases,
  createContactSuccessCases,
  createContactFailureCases,
  invalidCreatePhoneCases,
  invalidCreateNameCases,
  invalidCreateCapabilityCases,
};

export {};
