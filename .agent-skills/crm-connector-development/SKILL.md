---
name: crm-connector-development
description: Use this skill when creating, modifying, or debugging CRM connectors for the RingCentral App Connect extension. This includes implementing connector interfaces, handling OAuth/API key authentication, contact matching, call logging, and message logging.
---

# CRM Connector Development

## Overview

CRM connectors live in `src/connectors/<crm-name>/index.js` and implement standardized interfaces to connect RingCentral App Connect with external CRM platforms.

## Required Connector Interfaces

Every connector MUST implement these interfaces:

| Interface | Purpose |
|-----------|---------|
| `getAuthType()` | Returns `'oauth'` or `'apiKey'` |
| `getOauthInfo()` | OAuth credentials (clientId, clientSecret, accessTokenUri, redirectUri) |
| `getUserInfo({ authHeader, hostname })` | Fetch and return user profile from CRM |
| `unAuthorize({ user })` | Logout/revoke tokens |
| `findContact({ user, authHeader, phoneNumber, isExtension })` | Match contacts by phone number |
| `findContactWithName({ user, authHeader, name })` | Search contacts by name |
| `createContact({ user, authHeader, phoneNumber, newContactName })` | Create new contact |
| `createCallLog({ user, contactInfo, authHeader, callLog, additionalSubmission, aiNote, transcript, composedLogDetails, hashedAccountId })` | Log a call |
| `updateCallLog({ user, existingCallLog, authHeader, subject, duration, additionalSubmission, composedLogDetails, hashedAccountId })` | Update existing call log |
| `getCallLog({ user, callLogId, authHeader })` | Retrieve call log details |
| `createMessageLog({ user, contactInfo, sharedSMSLogContent, authHeader, message, additionalSubmission, recordingLink, faxDocLink })` | Log SMS/voicemail/fax |
| `updateMessageLog({ user, contactInfo, sharedSMSLogContent, existingMessageLog, message, authHeader, additionalSubmission })` | Update message log |
| `getLogFormatType()` | Return log format: `LOG_DETAILS_FORMAT_TYPE.HTML`, `MARKDOWN`, or `PLAIN_TEXT` |
| `getUserList({ user, authHeader })` | List CRM users for admin mapping |
| `upsertCallDisposition({ user, existingCallLog, authHeader, dispositions })` | Set call disposition |

## Connector File Structure

```javascript
// src/connectors/<crm-name>/index.js
const axios = require('axios');
const moment = require('moment');
const { parsePhoneNumber } = require('awesome-phonenumber');
const jwt = require('@app-connect/core/lib/jwt');
const { UserModel } = require('@app-connect/core/models/userModel');
const { AdminConfigModel } = require('@app-connect/core/models/adminConfigModel');
const { LOG_DETAILS_FORMAT_TYPE } = require('@app-connect/core/lib/constants');
const logger = require('@app-connect/core/lib/logger');
const { handleDatabaseError } = require('@app-connect/core/lib/errorHandler');

function getAuthType() {
    return 'oauth'; // or 'apiKey'
}

function getLogFormatType() {
    return LOG_DETAILS_FORMAT_TYPE.HTML; // or MARKDOWN, PLAIN_TEXT
}

// ... implement all interfaces

// Export all interfaces
exports.getAuthType = getAuthType;
exports.getOauthInfo = getOauthInfo;
exports.getUserInfo = getUserInfo;
// ... export all other functions
```

## Standard Response Formats

### Success Response with Return Message
```javascript
return {
    successful: true,
    returnMessage: {
        messageType: 'success', // 'success' | 'warning' | 'danger'
        message: 'Operation completed',
        ttl: 2000 // milliseconds to display
    }
};
```

### Contact Match Response
```javascript
return {
    successful: true,
    matchedContactInfo: [
        {
            id: 'crm-contact-id',
            name: 'Contact Name',
            phone: phoneNumber,
            type: 'contact', // or 'lead', 'candidate', etc.
            organization: 'Company Name',
            additionalInfo: { deals: [...], leads: [...] },
            mostRecentActivityDate: '2024-01-01'
        }
    ],
    extraDataTracking: { /* rate limit info */ }
};
```

### Call Log Response
```javascript
return {
    logId: 'crm-log-id',
    returnMessage: {
        message: 'Call logged',
        messageType: 'success',
        ttl: 2000
    },
    extraDataTracking: {
        withSmartNoteLog: true,
        withTranscript: true
    }
};
```

## User Assignment Pattern

For server-side logging with user assignment:

```javascript
let assigneeId = null;
if (additionalSubmission?.isAssignedToUser) {
    // Try token-based assignment first
    if (additionalSubmission.adminAssignedUserToken) {
        try {
            const unAuthData = jwt.decodeJwt(additionalSubmission.adminAssignedUserToken);
            const assigneeUser = await UserModel.findByPk(unAuthData.id);
            if (assigneeUser) {
                assigneeId = assigneeUser.platformAdditionalInfo.id;
            }
        } catch (e) {
            logger.error('Error decoding admin assigned user token', { stack: e.stack });
        }
    }
    
    // Fallback to admin config mapping
    if (!assigneeId) {
        const adminConfig = await AdminConfigModel.findByPk(hashedAccountId);
        assigneeId = adminConfig.userMappings?.find(mapping => 
            typeof mapping.rcExtensionId === 'string' 
                ? mapping.rcExtensionId == additionalSubmission.adminAssignedUserRcId 
                : mapping.rcExtensionId.includes(additionalSubmission.adminAssignedUserRcId)
        )?.crmUserId;
    }
}
```

## Rate Limit Tracking

Always track API rate limits in `extraDataTracking`:

```javascript
extraDataTracking = {
    ratelimitRemaining: response.headers['x-ratelimit-remaining'],
    ratelimitAmount: response.headers['x-ratelimit-limit'],
    ratelimitReset: response.headers['x-ratelimit-reset']
};
```

## Phone Number Handling

Use `awesome-phonenumber` for parsing:

```javascript
const { parsePhoneNumber } = require('awesome-phonenumber');

const phoneNumberObj = parsePhoneNumber(phoneNumber);
if (phoneNumberObj.valid) {
    const significantNumber = phoneNumberObj.number.significant;
    // Use for searching without country code
}
```

## Error Handling

Use the logger for errors and return user-friendly messages:

```javascript
try {
    // API call
} catch (e) {
    logger.error('Error description', { stack: e.stack });
    return {
        successful: false,
        returnMessage: {
            messageType: 'warning',
            message: 'User-friendly error message',
            details: [
                {
                    title: 'Details',
                    items: [
                        { id: '1', type: 'text', text: 'Detailed explanation' }
                    ]
                }
            ],
            ttl: 3000
        }
    };
}
```

## Reference Connectors

- `src/connectors/pipedrive/index.js` - OAuth connector with deals/leads
- `src/connectors/bullhorn/index.js` - Complex connector with candidates
- `src/connectors/insightly/index.js` - API key connector
- `src/connectors/redtail/index.js` - Simple OAuth pattern

