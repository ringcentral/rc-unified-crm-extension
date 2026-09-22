import type { LogDetailsFormatType } from '../types';

const LOG_DETAILS_FORMAT_TYPE = {
    PLAIN_TEXT: 'text/plain',
    HTML: 'text/html',
    MARKDOWN: 'text/markdown'
} as const satisfies Record<string, LogDetailsFormatType>;

// Machine-readable reasons a client can act on, carried as `errorCode` on a failing response.
//
// SESSION_REVOKED accompanies a 401 and means the stored CRM OAuth token could not be refreshed.
// SESSION_INVALID rides on an in-band 200 failure and means the credential is missing or the CRM
// rejected it. Both mean reconnecting the CRM is the only fix, so a client should prompt for that
// rather than retry. Adding the code never changes a status code, so existing clients that ignore
// it keep their current behavior.
const CRM_ERROR_CODE = {
    SESSION_REVOKED: 'CRM_SESSION_REVOKED',
    SESSION_INVALID: 'CRM_SESSION_INVALID'
} as const;

export {
    CRM_ERROR_CODE,
    LOG_DETAILS_FORMAT_TYPE
};
