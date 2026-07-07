const { LOG_DETAILS_FORMAT_TYPE } = require('../../lib/constants');
const tsConstants = require('../../lib/constants.ts');

describe('constants', () => {
  test('keeps TypeScript implementation aligned with compatibility JS entrypoint', () => {
    expect(tsConstants.LOG_DETAILS_FORMAT_TYPE).toEqual(LOG_DETAILS_FORMAT_TYPE);
  });

  test('exports log details format values', () => {
    expect(LOG_DETAILS_FORMAT_TYPE).toEqual({
      PLAIN_TEXT: 'text/plain',
      HTML: 'text/html',
      MARKDOWN: 'text/markdown',
    });
  });
});
