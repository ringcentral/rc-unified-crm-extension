const contactNameForwardingCases = [
  { label: 'ASCII full name', name: 'John Doe' },
  { label: 'leading and trailing whitespace', name: '  Jane Smith  ' },
  { label: 'accented Latin name', name: 'José Álvarez' },
  { label: 'CJK name', name: '王小明' },
  { label: 'Arabic name', name: 'ليلى العبدالله' },
  { label: 'apostrophe and hyphen', name: "O'Connor-Smith" },
  { label: 'reserved punctuation', name: 'Tenant/User + CRM & Co.' },
  { label: 'emoji and joiner sequence', name: '👩‍💼 Customer 🚀' },
  { label: 'long value', name: 'x'.repeat(4096) },
];

const invalidContactNameCases = [
  { label: 'missing name', name: undefined, expected: 'Name is required' },
  { label: 'null name', name: null, expected: 'Name is required' },
  { label: 'empty name', name: '', expected: 'Name is required' },
  { label: 'whitespace name', name: ' \t ', expected: 'Name is required' },
  { label: 'numeric name', name: 42, expected: 'Name must be a string' },
  { label: 'boolean name', name: false, expected: 'Name must be a string' },
  { label: 'object name', name: { first: 'Jane' }, expected: 'Name must be a string' },
  { label: 'array name', name: ['Jane', 'Doe'], expected: 'Name must be a string' },
];

const invalidFindByNameCapabilityCases = [
  { label: 'missing capability', connector: {} },
  { label: 'null capability', connector: { findContactWithName: null } },
  { label: 'string capability', connector: { findContactWithName: 'yes' } },
  { label: 'object capability', connector: { findContactWithName: {} } },
];

module.exports = {
  contactNameForwardingCases,
  invalidContactNameCases,
  invalidFindByNameCapabilityCases,
};

export {};
