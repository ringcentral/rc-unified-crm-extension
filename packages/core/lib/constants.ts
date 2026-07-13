import type { LogDetailsFormatType } from '../types';

const LOG_DETAILS_FORMAT_TYPE = {
    PLAIN_TEXT: 'text/plain',
    HTML: 'text/html',
    MARKDOWN: 'text/markdown'
} as const satisfies Record<string, LogDetailsFormatType>;

export {
    LOG_DETAILS_FORMAT_TYPE
};
