/**
 * Shared mock fixtures for connector integration tests
 * Contains common mock data used across all connector tests
 */

// Common user data
const mockUser = {
    id: 'test-user-123',
    hostname: 'test.example.com',
    platform: 'test',
    accessToken: 'test-access-token',
    refreshToken: 'test-refresh-token',
    rcUserNumber: '1234567890',
    rcAccountId: 'test-rc-account-id',
    timezoneOffset: '+00:00',
    userSettings: {},
    platformAdditionalInfo: {},
    save: jest.fn().mockResolvedValue(true),
    update: jest.fn().mockResolvedValue(true),
    destroy: jest.fn().mockResolvedValue(true)
};

// Common contact data
const mockContact = {
    id: 'contact-123',
    name: 'John Doe',
    phone: '+14155551234',
    phoneNumber: '+14155551234',
    email: 'john.doe@example.com',
    type: 'contact',
    organization: 'Test Corp'
};

// Common call log data
const mockCallLog = {
    sessionId: 'session-123',
    startTime: new Date('2024-01-15T10:00:00Z').getTime(),
    duration: 300, // 5 minutes
    direction: 'Outbound',
    result: 'Connected',
    from: {
        phoneNumber: '+14155551234',
        name: 'John Doe'
    },
    to: {
        phoneNumber: '+14155555678',
        name: 'Jane Smith'
    },
    recording: {
        link: 'https://recording.example.com/123'
    },
    customSubject: null
};

// Common message data
const mockMessage = {
    id: 'message-123',
    conversationId: 'conv-123',
    creationTime: new Date('2024-01-15T10:00:00Z').toISOString(),
    direction: 'Inbound',
    subject: 'Test message content',
    from: {
        phoneNumber: '+14155551234',
        name: 'John Doe',
        location: 'San Francisco, CA'
    },
    to: [{
        phoneNumber: '+14155555678',
        name: 'Jane Smith',
        location: 'Los Angeles, CA'
    }],
    messageStatus: 'Delivered',
    faxPageCount: 0
};

// Common existing call log record (from database)
const mockExistingCallLog = {
    id: 'log-123',
    sessionId: 'session-123',
    thirdPartyLogId: 'third-party-log-123',
    platform: 'test',
    userId: 'test-user-123'
};

// Common existing message log record
const mockExistingMessageLog = {
    id: 'msg-log-123',
    conversationId: 'conv-123',
    thirdPartyLogId: 'third-party-msg-123',
    conversationLogId: 'conv-log-123',
    platform: 'test',
    userId: 'test-user-123'
};

// Common admin config
const mockAdminConfig = {
    id: 'admin-config-123',
    userMappings: [
        {
            rcExtensionId: 'ext-123',
            crmUserId: 'crm-user-123'
        }
    ]
};

// Common additional submission data
const mockAdditionalSubmission = {
    isAssignedToUser: false,
    adminAssignedUserToken: null,
    adminAssignedUserRcId: null
};

// Auth header helpers
const mockAuthHeader = 'Bearer test-access-token';
const mockBasicAuthHeader = 'Basic dGVzdC1hcGkta2V5Og=='; // base64 of 'test-api-key:'

// Common API response patterns
const mockSuccessResponse = {
    successful: true,
    returnMessage: {
        messageType: 'success',
        message: 'Operation completed successfully',
        ttl: 2000
    }
};

const mockErrorResponse = {
    successful: false,
    returnMessage: {
        messageType: 'warning',
        message: 'Operation failed',
        ttl: 3000
    }
};

// Rate limit headers
const mockRateLimitHeaders = {
    'x-ratelimit-remaining': '100',
    'x-ratelimit-limit': '1000',
    'x-ratelimit-reset': '3600'
};

// Bullhorn-specific rate limit headers
const mockBullhornRateLimitHeaders = {
    'ratelimit-remaining': '100',
    'ratelimit-limit': '1000',
    'ratelimit-reset': '3600'
};

// ============ Platform-Specific Mock Data ============

// Pipedrive specific mocks
const pipedriveUserInfo = {
    data: {
        data: {
            id: 12345,
            name: 'Test User',
            email: 'test@pipedrive.com',
            timezone_name: 'America/New_York',
            timezone_offset: '-05:00',
            company_id: 1,
            company_name: 'Test Company',
            company_domain: 'testcompany'
        }
    }
};

const pipedrivePersonSearch = {
    data: {
        data: {
            items: [
                {
                    item: {
                        id: 101,
                        name: 'John Doe',
                        phone: '+14155551234',
                        organization: { name: 'Test Org' },
                        update_time: '2024-01-15T10:00:00Z'
                    }
                }
            ]
        }
    }
};

const pipedriveDeals = {
    data: {
        data: [
            { id: 201, title: 'Test Deal', status: 'open' }
        ]
    }
};

const pipedriveLeads = {
    data: {
        data: [
            { id: 301, title: 'Test Lead' }
        ]
    }
};

const pipedriveActivity = {
    data: {
        data: {
            id: 401,
            subject: 'Test Call',
            note: 'Test note content',
            deal_id: 201,
            lead_id: null
        },
        related_objects: {
            person: {
                '101': { name: 'John Doe' }
            }
        }
    }
};

const pipedriveActivityTypes = {
    data: {
        data: [
            { name: 'SMS', key_string: 'sms', active_flag: true },
            { name: 'Call', key_string: 'call', active_flag: true }
        ]
    }
};

// Bullhorn specific mocks
const bullhornLoginResponse = {
    data: {
        BhRestToken: 'bh-rest-token-123',
        restUrl: 'https://rest.bullhorn.com/rest-services/test/'
    }
};

const bullhornUserQuery = {
    data: {
        data: [{
            id: 123,
            name: 'Test User',
            masterUserID: 456,
            timeZoneOffsetEST: -300
        }]
    }
};

const bullhornPing = {
    data: {
        sessionExpires: Date.now() + 3600000 // 1 hour from now
    }
};

const bullhornContactSearch = {
    data: {
        data: [{
            id: 101,
            name: 'John Doe',
            email: 'john@example.com',
            phone: '+14155551234',
            dateAdded: Date.now(),
            dateLastModified: Date.now(),
            dateLastVisit: Date.now()
        }]
    }
};

const bullhornCandidateSearch = {
    data: {
        data: [{
            id: 102,
            name: 'Jane Smith',
            email: 'jane@example.com',
            phone: '+14155555678',
            dateAdded: Date.now(),
            dateLastComment: Date.now(),
            dateLastModified: Date.now()
        }]
    }
};

const bullhornLeadSearch = {
    data: {
        data: [{
            id: 103,
            name: 'Bob Wilson',
            email: 'bob@example.com',
            phone: '+14155559999',
            status: 'Open',
            dateAdded: Date.now(),
            dateLastComment: Date.now(),
            dateLastModified: Date.now()
        }]
    }
};

const bullhornCommentActionList = {
    data: {
        commentActionList: ['Call', 'Email', 'Meeting', 'Note']
    }
};

const bullhornNote = {
    data: {
        data: {
            comments: '<b>Test Note</b>',
            commentingPerson: { id: 123 },
            candidates: { total: 0, data: [] },
            clientContacts: { total: 1, data: [{ firstName: 'John', lastName: 'Doe' }] },
            action: 'Call'
        },
        changedEntityId: 501
    }
};

// Clio specific mocks
const clioUserInfo = {
    data: {
        data: {
            id: 12345,
            name: 'Test User',
            time_zone: 'America/New_York'
        }
    }
};

const clioContacts = {
    data: {
        data: [
            {
                id: 101,
                name: 'John Doe',
                type: 'Person',
                updated_at: '2024-01-15T10:00:00Z'
            }
        ]
    }
};

const clioMatters = {
    data: {
        data: [
            {
                id: 201,
                display_number: 'MAT-001',
                description: 'Test Matter',
                status: 'Open'
            }
        ]
    }
};

const clioRelationships = {
    data: {
        data: [
            {
                matter: {
                    id: 202,
                    display_number: 'MAT-002',
                    description: 'Related Matter',
                    status: 'Open'
                }
            }
        ]
    }
};

const clioCommunication = {
    data: {
        data: {
            id: 301,
            subject: 'Test Call',
            body: 'Test note content',
            matter: { id: 201 },
            senders: [{ id: 101, type: 'Person' }],
            receivers: [{ id: 12345, type: 'User' }]
        }
    }
};

const clioActivity = {
    data: {
        data: {
            id: 401,
            quantity: 300
        }
    }
};

const clioUserList = {
    data: {
        data: [
            { id: 1, name: 'User One', first_name: 'User', last_name: 'One', email: 'user1@example.com' },
            { id: 2, name: 'User Two', first_name: 'User', last_name: 'Two', email: 'user2@example.com' }
        ]
    }
};

// Insightly specific mocks
const insightlyUserInfo = {
    data: {
        USER_ID: 12345,
        FIRST_NAME: 'Test',
        LAST_NAME: 'User',
        TIMEZONE_ID: 'Eastern Standard Time'
    }
};

const insightlyContactSearch = {
    data: [{
        CONTACT_ID: 101,
        FIRST_NAME: 'John',
        LAST_NAME: 'Doe',
        PHONE: '+14155551234',
        PHONE_MOBILE: '+14155551235',
        TITLE: 'Engineer',
        LAST_ACTIVITY_DATE_UTC: '2024-01-15T10:00:00Z',
        DATE_UPDATED_UTC: '2024-01-15T10:00:00Z',
        LINKS: []
    }]
};

const insightlyLeadSearch = {
    data: [{
        LEAD_ID: 102,
        FIRST_NAME: 'Jane',
        LAST_NAME: 'Smith',
        PHONE: '+14155555678',
        MOBILE: '+14155555679',
        TITLE: 'Manager',
        LAST_ACTIVITY_DATE_UTC: '2024-01-15T10:00:00Z',
        DATE_UPDATED_UTC: '2024-01-15T10:00:00Z',
        LINKS: []
    }]
};

const insightlyEvent = {
    data: {
        EVENT_ID: 201,
        TITLE: 'Test Call',
        DETAILS: 'Test note content',
        LINKS: [{ LINK_OBJECT_NAME: 'contact', LINK_OBJECT_ID: 101 }]
    }
};

const insightlyUserList = {
    data: [
        { USER_ID: 1, FIRST_NAME: 'User', LAST_NAME: 'One', EMAIL_ADDRESS: 'user1@example.com' },
        { USER_ID: 2, FIRST_NAME: 'User', LAST_NAME: 'Two', EMAIL_ADDRESS: 'user2@example.com' }
    ]
};

// Netsuite specific mocks
const netsuiteCurrentUser = {
    data: {
        name: 'Test User',
        email: 'test@netsuite.com',
        subsidiary: '1'
    }
};

const netsuiteOneWorld = {
    data: {
        oneWorldEnabled: true
    }
};

const netsuitePermissions = {
    data: {
        permissionResults: {
            LIST_CONTACT: true,
            REPO_ANALYTICS: true,
            TRAN_SALESORD: true,
            LIST_CUSTJOB: true,
            ADMI_LOGIN_OAUTH2: true,
            ADMI_RESTWEBSERVICES: true,
            LIST_CALL: true,
            LIST_SUBSIDIARY: true
        }
    }
};

const netsuiteContactQuery = {
    data: {
        items: [{
            id: 101,
            firstname: 'John',
            middlename: '',
            lastname: 'Doe',
            entitytitle: 'John Doe',
            phone: '+14155551234',
            company: 201,
            lastmodifieddate: '2024-01-15T10:00:00Z'
        }]
    }
};

const netsuiteCustomerQuery = {
    data: {
        items: [{
            id: 102,
            firstname: 'Jane',
            middlename: '',
            lastname: 'Smith',
            entitytitle: 'Jane Smith',
            phone: '+14155555678',
            lastmodifieddate: '2024-01-15T10:00:00Z'
        }]
    }
};

const netsuitePhoneCall = {
    data: {
        id: 301,
        title: 'Test Call',
        message: 'Test note content',
        phone: '+14155551234',
        status: 'COMPLETE'
    }
};

const netsuiteTimezone = {
    data: {
        userTimezone: 'America/New_York'
    }
};

const netsuiteUserList = {
    data: {
        items: [
            { id: 1, firstname: 'User', middlename: '', lastname: 'One', email: 'user1@example.com', giveaccess: true, isinactive: false },
            { id: 2, firstname: 'User', middlename: '', lastname: 'Two', email: 'user2@example.com', giveaccess: true, isinactive: false }
        ]
    }
};

// Redtail specific mocks
const redtailAuthResponse = {
    data: {
        authenticated_user: {
            user_key: 'redtail-user-key-123',
            id: 12345,
            first_name: 'Test',
            last_name: 'User'
        }
    }
};

const redtailContactSearch = {
    data: {
        contacts: [{
            id: 101,
            first_name: 'John',
            middle_name: '',
            last_name: 'Doe',
            full_name: 'John Doe',
            job_title: 'Engineer',
            updated_at: '2024-01-15T10:00:00Z'
        }]
    }
};

const redtailCategories = {
    data: {
        categories: [
            { id: 1, name: 'Client', deleted: false },
            { id: 2, name: 'Prospect', deleted: false },
            { id: 3, name: 'Lead', deleted: false }
        ]
    }
};

const redtailActivity = {
    data: {
        activity: {
            id: 201,
            subject: 'Test Call',
            description: 'Test note content',
            category_id: 1,
            linked_contacts: [{ contact_id: 101, first_name: 'John', last_name: 'Doe' }]
        }
    }
};

const redtailDatabaseUsers = {
    data: {
        database_users: [
            { id: 1, first_name: 'User', last_name: 'One' },
            { id: 2, first_name: 'User', last_name: 'Two' }
        ]
    }
};

// Google Sheets specific mocks
const googleUserInfo = {
    data: {
        sub: '12345678901234567890',
        name: 'Test User',
        email: 'test@gmail.com'
    }
};

const googleSpreadsheet = {
    data: {
        sheets: [
            { properties: { title: 'Contacts', sheetId: 0 } },
            { properties: { title: 'Call Logs', sheetId: 1 } },
            { properties: { title: 'Message Logs', sheetId: 2 } }
        ]
    }
};

const googleSheetValues = {
    data: {
        values: [
            ['ID', 'Sheet Id', 'Contact name', 'Phone'],
            ['1', 'sheet-123', 'John Doe', '+14155551234'],
            ['2', 'sheet-123', 'Jane Smith', '+14155555678']
        ]
    }
};

const googleCallLogValues = {
    data: {
        values: [
            ['ID', 'Sheet Id', 'Subject', 'Notes', 'Contact name', 'Phone', 'Start time', 'End time', 'Duration', 'Session Id', 'Direction'],
            ['1', 'sheet-123', 'Test Call', 'Test note', 'John Doe', '+14155551234', '2024-01-15T10:00:00Z', '2024-01-15T10:05:00Z', '300', 'session-123', 'Outbound']
        ]
    }
};

const googleAppendResponse = {
    data: {
        updates: {
            updatedRows: 1,
            updatedRange: 'Sheet1!A2:K2'
        }
    }
};

// Helper functions
function createMockUser(overrides = {}) {
    return {
        ...mockUser,
        ...overrides,
        save: jest.fn().mockResolvedValue(true),
        update: jest.fn().mockResolvedValue(true),
        destroy: jest.fn().mockResolvedValue(true)
    };
}

function createMockContact(overrides = {}) {
    return { ...mockContact, ...overrides };
}

function createMockCallLog(overrides = {}) {
    return { ...mockCallLog, ...overrides };
}

function createMockMessage(overrides = {}) {
    return { ...mockMessage, ...overrides };
}

function createMockExistingCallLog(overrides = {}) {
    return { ...mockExistingCallLog, ...overrides };
}

function createMockExistingMessageLog(overrides = {}) {
    return { ...mockExistingMessageLog, ...overrides };
}

// Export all mocks
module.exports = {
    // Common mocks
    mockUser,
    mockContact,
    mockCallLog,
    mockMessage,
    mockExistingCallLog,
    mockExistingMessageLog,
    mockAdminConfig,
    mockAdditionalSubmission,
    mockAuthHeader,
    mockBasicAuthHeader,
    mockSuccessResponse,
    mockErrorResponse,
    mockRateLimitHeaders,
    mockBullhornRateLimitHeaders,
    
    // Platform-specific mocks
    pipedrive: {
        userInfo: pipedriveUserInfo,
        personSearch: pipedrivePersonSearch,
        deals: pipedriveDeals,
        leads: pipedriveLeads,
        activity: pipedriveActivity,
        activityTypes: pipedriveActivityTypes
    },
    bullhorn: {
        loginResponse: bullhornLoginResponse,
        userQuery: bullhornUserQuery,
        ping: bullhornPing,
        contactSearch: bullhornContactSearch,
        candidateSearch: bullhornCandidateSearch,
        leadSearch: bullhornLeadSearch,
        commentActionList: bullhornCommentActionList,
        note: bullhornNote
    },
    clio: {
        userInfo: clioUserInfo,
        contacts: clioContacts,
        matters: clioMatters,
        relationships: clioRelationships,
        communication: clioCommunication,
        activity: clioActivity,
        userList: clioUserList
    },
    insightly: {
        userInfo: insightlyUserInfo,
        contactSearch: insightlyContactSearch,
        leadSearch: insightlyLeadSearch,
        event: insightlyEvent,
        userList: insightlyUserList
    },
    netsuite: {
        currentUser: netsuiteCurrentUser,
        oneWorld: netsuiteOneWorld,
        permissions: netsuitePermissions,
        contactQuery: netsuiteContactQuery,
        customerQuery: netsuiteCustomerQuery,
        phoneCall: netsuitePhoneCall,
        timezone: netsuiteTimezone,
        userList: netsuiteUserList
    },
    redtail: {
        authResponse: redtailAuthResponse,
        contactSearch: redtailContactSearch,
        categories: redtailCategories,
        activity: redtailActivity,
        databaseUsers: redtailDatabaseUsers
    },
    googleSheets: {
        userInfo: googleUserInfo,
        spreadsheet: googleSpreadsheet,
        sheetValues: googleSheetValues,
        callLogValues: googleCallLogValues,
        appendResponse: googleAppendResponse
    },
    
    // Helper functions
    createMockUser,
    createMockContact,
    createMockCallLog,
    createMockMessage,
    createMockExistingCallLog,
    createMockExistingMessageLog
};

