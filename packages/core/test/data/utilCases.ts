const hashSerializationCases = [
  { label: 'numeric zero', value: 0, secret: 'secret-key' },
  { label: 'negative number', value: -42, secret: 'secret-key' },
  { label: 'maximum safe integer', value: Number.MAX_SAFE_INTEGER, secret: 'secret-key' },
  { label: 'null value', value: null, secret: 'secret-key' },
  { label: 'undefined value', value: undefined, secret: 'secret-key' },
  { label: 'empty value', value: '', secret: 'secret-key' },
  { label: 'whitespace value', value: ' \r\n\t ', secret: 'secret-key' },
  { label: 'Unicode value', value: '客户-José-🚀', secret: 'secret-key' },
  { label: 'separator characters', value: 'tenant:user:extension', secret: 'secret:key' },
  { label: 'URL value', value: 'https://example.com/a?q=1&next=%2Fhome#part', secret: 'secret-key' },
  { label: 'long value', value: 'x'.repeat(8192), secret: 'secret-key' },
  { label: 'empty secret', value: 'value', secret: '' },
  { label: 'null secret', value: 'value', secret: null },
  { label: 'undefined secret', value: 'value', secret: undefined },
  { label: 'Unicode secret', value: 'value', secret: '秘密-🔐' },
];

const durationFormattingCases = [
  { seconds: 0, expected: '0 seconds' },
  { seconds: 1, expected: '1 second' },
  { seconds: 2, expected: '2 seconds' },
  { seconds: 59, expected: '59 seconds' },
  { seconds: 59.5, expected: '59.5 seconds' },
  { seconds: 60, expected: '1 minute' },
  { seconds: 60.5, expected: '1 minute, 0.5 seconds' },
  { seconds: 61, expected: '1 minute, 1 second' },
  { seconds: 119, expected: '1 minute, 59 seconds' },
  { seconds: 120, expected: '2 minutes' },
  { seconds: 3599, expected: '59 minutes, 59 seconds' },
  { seconds: 3600, expected: '1 hour' },
  { seconds: 3601, expected: '1 hour, 1 second' },
  { seconds: 3660, expected: '1 hour, 1 minute' },
  { seconds: 3661, expected: '1 hour, 1 minute, 1 second' },
  { seconds: 7199, expected: '1 hour, 59 minutes, 59 seconds' },
  { seconds: 7200, expected: '2 hours' },
  { seconds: 7322, expected: '2 hours, 2 minutes, 2 seconds' },
  { seconds: 86399, expected: '23 hours, 59 minutes, 59 seconds' },
  { seconds: 86400, expected: '24 hours' },
  { seconds: '0', expected: '0 seconds' },
  { seconds: '60', expected: '1 minute' },
  { seconds: '3661', expected: '1 hour, 1 minute, 1 second' },
  { seconds: '', expected: '0 seconds' },
  { seconds: '   ', expected: '0 seconds' },
  { seconds: null, expected: '0 seconds' },
];

const nonNumericDurationInputs = [
  'not a number',
  '12 seconds',
  'NaN',
  undefined,
];

const mostRecentDateCases = [
  { label: 'empty collection', values: [], expected: 0 },
  { label: 'Unix epoch', values: [0], expected: 0 },
  { label: 'negative pre-epoch values', values: [-1, -1000, -86400000], expected: 0 },
  { label: 'mixed pre- and post-epoch values', values: [-1, 0, 1], expected: 1 },
  { label: 'unordered duplicates', values: [5000, 1000, 5000, 3000], expected: 5000 },
  { label: 'falsy gaps', values: [null, 0, undefined, 2500, null], expected: 2500 },
  { label: 'fractional timestamps', values: [1000.25, 1000.75, 1000.5], expected: 1000.75 },
  { label: 'maximum safe timestamp', values: [1, Number.MAX_SAFE_INTEGER, 2], expected: Number.MAX_SAFE_INTEGER },
  { label: 'NaN among valid timestamps', values: [1000, NaN, 2000], expected: 2000 },
  { label: 'all non-comparable values', values: [null, undefined, NaN, -1], expected: 0 },
];

const mediaLinkInputs = [
  'https://media.ringcentral.com/audio/file.mp3',
  'https://media.ringcentral.com/a path/file name.wav',
  'https://media.ringcentral.com/file?q=a+b&next=%2Fhome#fragment',
  'https://media.ringcentral.com/客户/录音📞.mp3',
  'relative/media/path?download=true',
  '  surrounding whitespace  ',
  'data:text/plain,not-a-real-media-url',
];

module.exports = {
  hashSerializationCases,
  durationFormattingCases,
  nonNumericDurationInputs,
  mostRecentDateCases,
  mediaLinkInputs,
};

export {};
