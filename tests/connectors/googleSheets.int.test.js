/* eslint-disable no-undef */
/**
 * Comprehensive integration tests for Google Sheets connector
 * Tests all exported functions with success and error scenarios
 */

const nock = require('nock');
const googleSheets = require('../../src/connectors/googleSheets');
const { createMockUser, createMockContact, createMockCallLog, createMockMessage, createMockExistingCallLog, createMockExistingMessageLog } = require('../fixtures/connectorMocks');

// Mock dependencies
jest.mock('@app-connect/core/lib/jwt', () => ({
    decodeJwt: jest.fn().mockReturnValue({ id: 'decoded-user-id' })
}));

jest.mock('@app-connect/core/models/userModel', () => ({
    UserModel: {
        findByPk: jest.fn()
    }
}));

jest.mock('@app-connect/core/models/adminConfigModel', () => ({
    AdminConfigModel: {
        findByPk: jest.fn()
    }
}));

const { UserModel } = require('@app-connect/core/models/userModel');
const { AdminConfigModel } = require('@app-connect/core/models/adminConfigModel');

describe('Google Sheets Connector', () => {
    const sheetsApiUrl = 'https://sheets.googleapis.com';
    const userInfoApiUrl = 'https://www.googleapis.com';
    const hostname = 'sheets.googleapis.com';
    const authHeader = 'Bearer test-access-token';
    const spreadsheetId = 'test-spreadsheet-id';
    const googleSheetsUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=0`;
    
    let mockUser;

    beforeEach(() => {
        nock.cleanAll();
        jest.clearAllMocks();
        
        // Use the correct environment variable names from the connector
        process.env.GOOGLESHEET_CLIENT_ID = 'test-client-id';
        process.env.GOOGLESHEET_CLIENT_SECRET = 'test-client-secret';
        process.env.GOOGLESHEET_REDIRECT_URI = 'https://example.com/callback';
        process.env.GOOGLESHEET_TOKEN_URI = 'https://oauth2.googleapis.com/token';
        
        mockUser = createMockUser({
            id: '12345-googleSheets',
            hostname,
            platform: 'googleSheets',
            timezoneOffset: '-05:00',
            userSettings: {
                googleSheetsUrl: {
                    value: googleSheetsUrl
                }
            },
            platformAdditionalInfo: {
                email: 'test@gmail.com',
                name: 'Test User'
            }
        });
    });

    afterEach(() => {
        nock.cleanAll();
    });

    // ==================== getAuthType ====================
    describe('getAuthType', () => {
        it('should return oauth', () => {
            expect(googleSheets.getAuthType()).toBe('oauth');
        });
    });

    // ==================== getLogFormatType ====================
    describe('getLogFormatType', () => {
        it('should return PLAIN_TEXT format type', () => {
            const result = googleSheets.getLogFormatType();
            expect(result).toBe('text/plain');
        });
    });

    // ==================== getOauthInfo ====================
    describe('getOauthInfo', () => {
        it('should return OAuth configuration', async () => {
            const result = await googleSheets.getOauthInfo({});

            expect(result.clientId).toBe('test-client-id');
            expect(result.clientSecret).toBe('test-client-secret');
            expect(result.redirectUri).toBe('https://example.com/callback');
            expect(result.accessTokenUri).toBe('https://oauth2.googleapis.com/token');
        });
    });

    // ==================== getUserInfo ====================
    describe('getUserInfo', () => {
        it('should return user info on successful API call', async () => {
            nock(userInfoApiUrl)
                .get('/oauth2/v3/userinfo')
                .reply(200, {
                    sub: '12345678901234567890',
                    name: 'Test User',
                    email: 'test@gmail.com'
                });

            const result = await googleSheets.getUserInfo({ 
                authHeader, 
                hostname,
                query: { rcAccountId: 'test-rc-account' }
            });

            expect(result.successful).toBe(true);
            expect(result.platformUserInfo.id).toBe('12345678901234567890-googleSheets');
            expect(result.platformUserInfo.name).toBe('Test User');
        });

        it('should throw error on API failure', async () => {
            nock(userInfoApiUrl)
                .get('/oauth2/v3/userinfo')
                .reply(401, { error: 'Unauthorized' });

            await expect(googleSheets.getUserInfo({ 
                authHeader, 
                hostname,
                query: { rcAccountId: 'test-rc-account' }
            })).rejects.toThrow();
        });
    });

    // ==================== unAuthorize ====================
    describe('unAuthorize', () => {
        it('should revoke token and clear user credentials', async () => {
            nock('https://oauth2.googleapis.com')
                .post('/revoke', 'token=test-access-token')
                .reply(200, {});

            const user = createMockUser({
                id: '12345-googleSheets',
                accessToken: 'test-access-token',
                refreshToken: 'test-refresh-token',
                destroy: jest.fn().mockResolvedValue(true)
            });

            const result = await googleSheets.unAuthorize({ user });

            expect(result.returnMessage.messageType).toBe('success');
            expect(result.returnMessage.message).toBe('Logged out of GoogleSheet');
            expect(user.destroy).toHaveBeenCalled();
        });

        it('should return warning on revoke failure', async () => {
            nock('https://oauth2.googleapis.com')
                .post('/revoke', 'token=test-access-token')
                .reply(400, { error: 'invalid_token' });

            const user = createMockUser({
                id: '12345-googleSheets',
                accessToken: 'test-access-token',
                refreshToken: 'test-refresh-token',
                destroy: jest.fn().mockResolvedValue(true)
            });

            const result = await googleSheets.unAuthorize({ user });

            expect(result.returnMessage.messageType).toBe('warning');
        });
    });

    // ==================== findContact ====================
    describe('findContact', () => {
        it('should return empty array for extension numbers', async () => {
            const result = await googleSheets.findContact({
                user: mockUser,
                authHeader,
                phoneNumber: '1234',
                overridingFormat: '',
                isExtension: 'true'
            });

            expect(result.successful).toBe(false);
            expect(result.matchedContactInfo).toEqual([]);
        });

        it('should find contacts in spreadsheet by phone number', async () => {
            // Get spreadsheet to find sheets
            nock(sheetsApiUrl)
                .get(`/v4/spreadsheets/${spreadsheetId}`)
                .reply(200, {
                    sheets: [
                        { properties: { title: 'Contacts', sheetId: 0 } },
                        { properties: { title: 'Call Logs', sheetId: 1 } }
                    ]
                });

            // Get contact sheet values - phone numbers must match E.164 format exactly
            nock(sheetsApiUrl)
                .get(`/v4/spreadsheets/${spreadsheetId}/values/Contacts`)
                .reply(200, {
                    values: [
                        ['ID', 'Sheet Id', 'Contact name', 'Phone', 'Company'],
                        ['1', 'sheet-123', 'John Doe', '+14155551234', 'Test Corp'],
                        ['2', 'sheet-123', 'Jane Smith', '+14155555678', 'Other Corp']
                    ]
                });

            const result = await googleSheets.findContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+14155551234', // Use E.164 format without spaces
                overridingFormat: '',
                isExtension: 'false'
            });

            expect(result.successful).toBe(true);
            expect(result.matchedContactInfo.length).toBeGreaterThan(0);
            expect(result.matchedContactInfo[0].name).toBe('John Doe');
        });

        it('should include create new contact option', async () => {
            nock(sheetsApiUrl)
                .get(`/v4/spreadsheets/${spreadsheetId}`)
                .reply(200, {
                    sheets: [
                        { properties: { title: 'Contacts', sheetId: 0 } }
                    ]
                });

            nock(sheetsApiUrl)
                .get(`/v4/spreadsheets/${spreadsheetId}/values/Contacts`)
                .reply(200, {
                    values: [
                        ['ID', 'Sheet Id', 'Contact name', 'Phone']
                    ]
                });

            const result = await googleSheets.findContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+1 4155559999',
                overridingFormat: '',
                isExtension: 'false'
            });

            expect(result.successful).toBe(true);
            const createNewOption = result.matchedContactInfo.find(c => c.id === 'createNewContact');
            expect(createNewOption).toBeDefined();
            expect(createNewOption.isNewContact).toBe(true);
        });

        it('should return error for missing Contacts sheet', async () => {
            nock(sheetsApiUrl)
                .get(`/v4/spreadsheets/${spreadsheetId}`)
                .reply(200, {
                    sheets: [
                        { properties: { title: 'Call Logs', sheetId: 1 } }
                    ]
                });

            const result = await googleSheets.findContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+1 4155551234',
                overridingFormat: '',
                isExtension: 'false'
            });

            expect(result.successful).toBe(false);
            expect(result.returnMessage.messageType).toBe('warning');
            expect(result.returnMessage.message).toBe('Invalid SheetName');
        });

        it('should return error when no spreadsheet configured', async () => {
            const userWithoutSheet = createMockUser({
                ...mockUser,
                userSettings: {}
            });

            const result = await googleSheets.findContact({
                user: userWithoutSheet,
                authHeader,
                phoneNumber: '+1 4155551234',
                overridingFormat: '',
                isExtension: 'false'
            });

            expect(result.successful).toBe(false);
            expect(result.returnMessage.messageType).toBe('warning');
            expect(result.returnMessage.message).toBe('No sheet selected to search for contacts');
        });
    });

    // ==================== createContact ====================
    describe('createContact', () => {
        it('should create a new contact in spreadsheet', async () => {
            // Get spreadsheet info
            nock(sheetsApiUrl)
                .get(`/v4/spreadsheets/${spreadsheetId}`)
                .reply(200, {
                    sheets: [
                        { properties: { title: 'Contacts', sheetId: 0 } }
                    ]
                });

            // Get current contacts to determine next ID
            nock(sheetsApiUrl)
                .get(`/v4/spreadsheets/${spreadsheetId}/values/Contacts`)
                .reply(200, {
                    values: [
                        ['ID', 'Sheet Id', 'Contact name', 'Phone'],
                        ['1', 'sheet-123', 'Existing Contact', '+14155550000']
                    ]
                });

            // Get column indexes
            nock(sheetsApiUrl)
                .get(`/v4/spreadsheets/${spreadsheetId}/values/Contacts!1:1`)
                .reply(200, {
                    values: [['ID', 'Sheet Id', 'Contact name', 'Phone']]
                });

            // Append new row
            nock(sheetsApiUrl)
                .post(`/v4/spreadsheets/${spreadsheetId}/values/Contacts!A1:append`)
                .query({ valueInputOption: 'RAW' })
                .reply(200, {
                    updates: {
                        updatedRows: 1,
                        updatedRange: 'Contacts!A3:D3'
                    }
                });

            const result = await googleSheets.createContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+14155551234',
                newContactName: 'John Doe'
            });

            expect(result.contactInfo.id).toBeDefined();
            expect(result.contactInfo.name).toBe('John Doe');
            expect(result.returnMessage.messageType).toBe('success');
        });

        it('should return error when no spreadsheet configured', async () => {
            const userWithoutSheet = createMockUser({
                ...mockUser,
                userSettings: {}
            });

            const result = await googleSheets.createContact({
                user: userWithoutSheet,
                authHeader,
                phoneNumber: '+14155551234',
                newContactName: 'New Contact'
            });

            expect(result.successful).toBe(false);
            expect(result.returnMessage.messageType).toBe('warning');
        });
    });

    // ==================== createCallLog ====================
    describe('createCallLog', () => {
        const mockContact = createMockContact({ id: '1', name: 'John Doe', phoneNumber: '+14155551234' });
        const mockCallLogData = createMockCallLog();

        it('should create a call log in spreadsheet', async () => {
            // Get spreadsheet info
            nock(sheetsApiUrl)
                .get(`/v4/spreadsheets/${spreadsheetId}`)
                .reply(200, {
                    sheets: [
                        { properties: { title: 'Contacts', sheetId: 0 } },
                        { properties: { title: 'Call Logs', sheetId: 1 } }
                    ]
                });

            // Get current call logs - URL encoded space
            nock(sheetsApiUrl)
                .get(`/v4/spreadsheets/${spreadsheetId}/values/Call%20Logs`)
                .reply(200, {
                    values: [
                        ['ID', 'Sheet Id', 'Subject', 'Notes', 'Contact name', 'Phone', 'Start time', 'End time', 'Duration', 'Session Id', 'Direction', 'Incoming Phone Number', 'Outgoing Phone Number', 'Transcript', 'Smart summary', 'RingSense Summary', 'RingSense Transcript', 'RingSense AI Score', 'RingSense Bulleted Summary', 'RingSense Link', 'Call Result', 'Call Recording']
                    ]
                });

            // Get column indexes - URL encoded space
            nock(sheetsApiUrl)
                .get(`/v4/spreadsheets/${spreadsheetId}/values/Call%20Logs!1:1`)
                .reply(200, {
                    values: [['ID', 'Sheet Id', 'Subject', 'Notes', 'Contact name', 'Phone', 'Start time', 'End time', 'Duration', 'Session Id', 'Direction', 'Incoming Phone Number', 'Outgoing Phone Number', 'Transcript', 'Smart summary', 'RingSense Summary', 'RingSense Transcript', 'RingSense AI Score', 'RingSense Bulleted Summary', 'RingSense Link', 'Call Result', 'Call Recording']]
                });

            // Append new row - URL encoded space
            nock(sheetsApiUrl)
                .post(`/v4/spreadsheets/${spreadsheetId}/values/Call%20Logs!A1:append`)
                .query({ valueInputOption: 'RAW' })
                .reply(200, {
                    updates: {
                        updatedRows: 1,
                        updatedRange: "'Call Logs'!A2:K2"
                    }
                });

            const result = await googleSheets.createCallLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                callLog: mockCallLogData,
                note: 'Test note',
                additionalSubmission: null,
                aiNote: 'AI note',
                transcript: 'Transcript'
            });

            expect(result.logId).toBeDefined();
            expect(result.returnMessage.messageType).toBe('success');
        });

        it('should return error when no spreadsheet configured', async () => {
            const userWithoutSheet = createMockUser({
                ...mockUser,
                userSettings: {}
            });

            const result = await googleSheets.createCallLog({
                user: userWithoutSheet,
                contactInfo: mockContact,
                authHeader,
                callLog: mockCallLogData,
                note: 'Test note',
                additionalSubmission: null,
                aiNote: null,
                transcript: null
            });

            expect(result.successful).toBe(false);
            expect(result.returnMessage.messageType).toBe('warning');
        });

        it('should return error when Call Logs sheet is missing', async () => {
            nock(sheetsApiUrl)
                .get(`/v4/spreadsheets/${spreadsheetId}`)
                .reply(200, {
                    sheets: [
                        { properties: { title: 'Contacts', sheetId: 0 } }
                    ]
                });

            const result = await googleSheets.createCallLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                callLog: mockCallLogData,
                note: 'Test note',
                additionalSubmission: null,
                aiNote: null,
                transcript: null
            });

            expect(result.successful).toBe(false);
            expect(result.returnMessage.messageType).toBe('warning');
            expect(result.returnMessage.message).toBe('Invalid SheetName');
        });
    });

    // ==================== updateCallLog ====================
    describe('updateCallLog', () => {
        const existingCallLog = createMockExistingCallLog({ thirdPartyLogId: '1' });

        it('should update an existing call log row', async () => {
            // Get spreadsheet info
            nock(sheetsApiUrl)
                .get(`/v4/spreadsheets/${spreadsheetId}`)
                .reply(200, {
                    sheets: [
                        { properties: { title: 'Call Logs', sheetId: 1 } }
                    ]
                });

            // Get current call logs - URL encoded space
            nock(sheetsApiUrl)
                .get(`/v4/spreadsheets/${spreadsheetId}/values/Call%20Logs`)
                .reply(200, {
                    values: [
                        ['ID', 'Sheet Id', 'Subject', 'Notes', 'Contact name', 'Phone', 'Start time', 'End time', 'Duration', 'Session Id', 'Direction', 'Call Result', 'Call Recording', 'Transcript', 'Smart summary', 'RingSense Transcript', 'RingSense Summary', 'RingSense AI Score', 'RingSense Bulleted Summary', 'RingSense Link'],
                        ['1', 'sheet-123', 'Existing Call', 'Existing notes', 'John Doe', '+14155551234', '2024-01-15', '2024-01-15', '300', 'session-123', 'Outbound', 'Connected', '', '', '', '', '', '', '', '']
                    ]
                });

            // Batch update
            nock(sheetsApiUrl)
                .post(`/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`)
                .reply(200, { responses: [] });

            const result = await googleSheets.updateCallLog({
                user: mockUser,
                existingCallLog,
                authHeader,
                recordingLink: 'https://recording.example.com/123',
                subject: 'Updated Subject',
                note: 'Updated note',
                startTime: Date.now(),
                duration: 600,
                result: 'Connected',
                aiNote: 'AI note',
                transcript: 'Transcript'
            });

            expect(result.returnMessage.messageType).toBe('success');
            expect(result.updatedNote).toBe('Updated note');
        });

        it('should return error when call log not found', async () => {
            nock(sheetsApiUrl)
                .get(`/v4/spreadsheets/${spreadsheetId}`)
                .reply(200, {
                    sheets: [
                        { properties: { title: 'Call Logs', sheetId: 1 } }
                    ]
                });

            // URL encoded space
            nock(sheetsApiUrl)
                .get(`/v4/spreadsheets/${spreadsheetId}/values/Call%20Logs`)
                .reply(200, {
                    values: [
                        ['ID', 'Subject', 'Notes', 'Duration', 'Call Result', 'Call Recording', 'Transcript', 'Smart summary']
                    ]
                });

            const result = await googleSheets.updateCallLog({
                user: mockUser,
                existingCallLog,
                authHeader,
                recordingLink: null,
                subject: 'Updated Subject',
                note: 'Updated note',
                startTime: Date.now(),
                duration: 600,
                result: 'Connected',
                aiNote: null,
                transcript: null
            });

            expect(result.successful).toBe(false);
            expect(result.returnMessage.messageType).toBe('warning');
        });
    });

    // ==================== getCallLog ====================
    describe('getCallLog', () => {
        it('should retrieve call log details from spreadsheet', async () => {
            nock(sheetsApiUrl)
                .get(`/v4/spreadsheets/${spreadsheetId}`)
                .reply(200, {
                    sheets: [
                        { properties: { title: 'Call Logs', sheetId: 1 } }
                    ]
                });

            // URL encoded space
            nock(sheetsApiUrl)
                .get(`/v4/spreadsheets/${spreadsheetId}/values/Call%20Logs`)
                .reply(200, {
                    values: [
                        ['ID', 'Sheet Id', 'Subject', 'Notes', 'Contact name', 'Phone', 'Start time', 'End time', 'Duration', 'Session Id', 'Direction'],
                        ['1', 'sheet-123', 'Test Call', 'Test note', 'John Doe', '+14155551234', '2024-01-15', '2024-01-15', '300', 'session-123', 'Outbound']
                    ]
                });

            // Batch get for subject and notes
            nock(sheetsApiUrl)
                .get(`/v4/spreadsheets/${spreadsheetId}/values:batchGet`)
                .query(true)
                .reply(200, {
                    valueRanges: [
                        { values: [['Test Call']] },
                        { values: [['Test note']] }
                    ]
                });

            const result = await googleSheets.getCallLog({
                user: mockUser,
                callLogId: '1',
                authHeader
            });

            expect(result.callLogInfo.subject).toBe('Test Call');
            expect(result.callLogInfo.note).toBe('Test note');
        });

        it('should return warning when call log not found', async () => {
            nock(sheetsApiUrl)
                .get(`/v4/spreadsheets/${spreadsheetId}`)
                .reply(200, {
                    sheets: [
                        { properties: { title: 'Call Logs', sheetId: 1 } }
                    ]
                });

            // URL encoded space
            nock(sheetsApiUrl)
                .get(`/v4/spreadsheets/${spreadsheetId}/values/Call%20Logs`)
                .reply(200, {
                    values: [
                        ['ID', 'Subject', 'Notes', 'Contact name']
                    ]
                });

            const result = await googleSheets.getCallLog({
                user: mockUser,
                callLogId: '999',
                authHeader
            });

            expect(result.returnMessage.messageType).toBe('warning');
            expect(result.returnMessage.message).toBe('Call log not found');
        });
    });

    // ==================== createMessageLog ====================
    describe('createMessageLog', () => {
        const mockContact = createMockContact({ id: '1', name: 'John Doe', phoneNumber: '+14155551234' });
        const mockMessageData = createMockMessage();

        it('should create an SMS message log in spreadsheet', async () => {
            nock(sheetsApiUrl)
                .get(`/v4/spreadsheets/${spreadsheetId}`)
                .reply(200, {
                    sheets: [
                        { properties: { title: 'Message Logs', sheetId: 2 } }
                    ]
                });

            // URL encoded space
            nock(sheetsApiUrl)
                .get(`/v4/spreadsheets/${spreadsheetId}/values/Message%20Logs`)
                .reply(200, {
                    values: [
                        ['ID', 'Sheet Id', 'Subject', 'Contact name', 'Message', 'Phone', 'Message Type', 'Message Time', 'Direction']
                    ]
                });

            // Get column indexes - URL encoded space
            nock(sheetsApiUrl)
                .get(`/v4/spreadsheets/${spreadsheetId}/values/Message%20Logs!1:1`)
                .reply(200, {
                    values: [['ID', 'Sheet Id', 'Subject', 'Contact name', 'Message', 'Phone', 'Message Type', 'Message Time', 'Direction']]
                });

            // URL encoded space
            nock(sheetsApiUrl)
                .post(`/v4/spreadsheets/${spreadsheetId}/values/Message%20Logs!A1:append`)
                .query({ valueInputOption: 'RAW' })
                .reply(200, { updates: { updatedRows: 1 } });

            const result = await googleSheets.createMessageLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                message: mockMessageData,
                additionalSubmission: null,
                recordingLink: null,
                faxDocLink: null
            });

            expect(result.logId).toBeDefined();
            expect(result.returnMessage.message).toBe('Message logged');
        });

        it('should create Message Logs sheet if missing', async () => {
            nock(sheetsApiUrl)
                .get(`/v4/spreadsheets/${spreadsheetId}`)
                .reply(200, {
                    sheets: [
                        { properties: { title: 'Contacts', sheetId: 0 } }
                    ]
                });

            // Create new sheet
            nock(sheetsApiUrl)
                .post(`/v4/spreadsheets/${spreadsheetId}:batchUpdate`)
                .reply(200, {});

            // Add header row - uses single quotes around sheet name with space
            nock(sheetsApiUrl)
                .post(`/v4/spreadsheets/${spreadsheetId}/values/'Message%20Logs'!A1:append`)
                .query({ valueInputOption: 'RAW' })
                .reply(200, { updates: { updatedRows: 1 } });

            // Get message logs values - URL encoded space
            nock(sheetsApiUrl)
                .get(`/v4/spreadsheets/${spreadsheetId}/values/Message%20Logs`)
                .reply(200, {
                    values: [
                        ['ID', 'Sheet Id', 'Subject', 'Contact name', 'Message', 'Phone', 'Message Type', 'Message Time', 'Direction']
                    ]
                });

            // Get column indexes - URL encoded space
            nock(sheetsApiUrl)
                .get(`/v4/spreadsheets/${spreadsheetId}/values/Message%20Logs!1:1`)
                .reply(200, {
                    values: [['ID', 'Sheet Id', 'Subject', 'Contact name', 'Message', 'Phone', 'Message Type', 'Message Time', 'Direction']]
                });

            // Append message row - URL encoded space
            nock(sheetsApiUrl)
                .post(`/v4/spreadsheets/${spreadsheetId}/values/Message%20Logs!A1:append`)
                .query({ valueInputOption: 'RAW' })
                .reply(200, { updates: { updatedRows: 1 } });

            const result = await googleSheets.createMessageLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                message: mockMessageData,
                additionalSubmission: null,
                recordingLink: null,
                faxDocLink: null
            });

            expect(result.logId).toBeDefined();
        });

        it('should create a voicemail message log', async () => {
            nock(sheetsApiUrl)
                .get(`/v4/spreadsheets/${spreadsheetId}`)
                .reply(200, {
                    sheets: [
                        { properties: { title: 'Message Logs', sheetId: 2 } }
                    ]
                });

            // URL encoded space
            nock(sheetsApiUrl)
                .get(`/v4/spreadsheets/${spreadsheetId}/values/Message%20Logs`)
                .reply(200, { 
                    values: [['ID', 'Sheet Id', 'Subject', 'Contact name', 'Message', 'Phone', 'Message Type', 'Message Time', 'Direction']] 
                });

            // URL encoded space
            nock(sheetsApiUrl)
                .get(`/v4/spreadsheets/${spreadsheetId}/values/Message%20Logs!1:1`)
                .reply(200, {
                    values: [['ID', 'Sheet Id', 'Subject', 'Contact name', 'Message', 'Phone', 'Message Type', 'Message Time', 'Direction']]
                });

            // URL encoded space
            nock(sheetsApiUrl)
                .post(`/v4/spreadsheets/${spreadsheetId}/values/Message%20Logs!A1:append`)
                .query({ valueInputOption: 'RAW' })
                .reply(200, { updates: { updatedRows: 1 } });

            const result = await googleSheets.createMessageLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                message: mockMessageData,
                additionalSubmission: null,
                recordingLink: 'https://recording.example.com/voicemail.mp3',
                faxDocLink: null
            });

            expect(result.logId).toBeDefined();
        });

        it('should create a fax message log', async () => {
            nock(sheetsApiUrl)
                .get(`/v4/spreadsheets/${spreadsheetId}`)
                .reply(200, {
                    sheets: [
                        { properties: { title: 'Message Logs', sheetId: 2 } }
                    ]
                });

            // URL encoded space
            nock(sheetsApiUrl)
                .get(`/v4/spreadsheets/${spreadsheetId}/values/Message%20Logs`)
                .reply(200, { 
                    values: [['ID', 'Sheet Id', 'Subject', 'Contact name', 'Message', 'Phone', 'Message Type', 'Message Time', 'Direction']] 
                });

            // URL encoded space
            nock(sheetsApiUrl)
                .get(`/v4/spreadsheets/${spreadsheetId}/values/Message%20Logs!1:1`)
                .reply(200, {
                    values: [['ID', 'Sheet Id', 'Subject', 'Contact name', 'Message', 'Phone', 'Message Type', 'Message Time', 'Direction']]
                });

            // URL encoded space
            nock(sheetsApiUrl)
                .post(`/v4/spreadsheets/${spreadsheetId}/values/Message%20Logs!A1:append`)
                .query({ valueInputOption: 'RAW' })
                .reply(200, { updates: { updatedRows: 1 } });

            const result = await googleSheets.createMessageLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                message: mockMessageData,
                additionalSubmission: null,
                recordingLink: null,
                faxDocLink: 'https://fax.example.com/document.pdf'
            });

            expect(result.logId).toBeDefined();
        });
    });

    // ==================== updateMessageLog ====================
    describe('updateMessageLog', () => {
        const mockContact = createMockContact({ id: '1', name: 'John Doe', phoneNumber: '+14155551234' });
        const mockMessageData = createMockMessage();
        const existingMessageLog = createMockExistingMessageLog({ thirdPartyLogId: '1' });

        it('should update an existing message log row', async () => {
            nock(sheetsApiUrl)
                .get(`/v4/spreadsheets/${spreadsheetId}`)
                .reply(200, {
                    sheets: [
                        { properties: { title: 'Message Logs', sheetId: 2 } }
                    ]
                });

            // URL encoded space
            nock(sheetsApiUrl)
                .get(`/v4/spreadsheets/${spreadsheetId}/values/Message%20Logs`)
                .reply(200, {
                    values: [
                        ['ID', 'Sheet Id', 'Subject', 'Contact name', 'Message', 'Phone', 'Message Type', 'Message Time', 'Direction'],
                        ['1', 'sheet-123', 'SMS', 'John Doe', '\nConversation summary\nMonday, January 15, 2024\nParticipants\n    Test User\n    John Doe\n\nConversation(1 messages)\nBEGIN\n------------\nJohn Doe (+14155551234) 10:00 AM\nFirst message\n\n------------\nEND\n\n--- Created via RingCentral App Connect', '+14155551234', 'SMS', '2024-01-15', 'Inbound']
                    ]
                });

            nock(sheetsApiUrl)
                .post(`/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`)
                .reply(200, { responses: [] });

            await googleSheets.updateMessageLog({
                user: mockUser,
                contactInfo: mockContact,
                existingMessageLog,
                message: { ...mockMessageData, subject: 'Second message' },
                authHeader
            });

            // No return value to check, but no error means success
        });
    });

    // ==================== Error Scenarios ====================
    describe('Error Scenarios', () => {
        it('should return warning for API errors (not throw)', async () => {
            nock(sheetsApiUrl)
                .get(`/v4/spreadsheets/${spreadsheetId}`)
                .reply(401, { error: { message: 'Unauthorized' } });

            const result = await googleSheets.findContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+1 4155551234',
                overridingFormat: '',
                isExtension: 'false'
            });

            // The connector catches errors and returns a warning
            expect(result.successful).toBe(false);
            expect(result.returnMessage.messageType).toBe('warning');
        });

        it('should handle network errors gracefully', async () => {
            nock(sheetsApiUrl)
                .get(`/v4/spreadsheets/${spreadsheetId}`)
                .replyWithError('Network error');

            const result = await googleSheets.findContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+1 4155551234',
                overridingFormat: '',
                isExtension: 'false'
            });

            expect(result.successful).toBe(false);
            expect(result.returnMessage.messageType).toBe('warning');
        });
    });

    // ==================== Missing Spreadsheet Configuration ====================
    describe('Missing Spreadsheet Configuration', () => {
        it('should handle user without spreadsheet configured', async () => {
            const userWithoutSpreadsheet = createMockUser({
                ...mockUser,
                userSettings: {}
            });

            const result = await googleSheets.findContact({
                user: userWithoutSpreadsheet,
                authHeader,
                phoneNumber: '+1 4155551234',
                overridingFormat: '',
                isExtension: 'false'
            });

            expect(result.successful).toBe(false);
            expect(result.returnMessage.messageType).toBe('warning');
            expect(result.returnMessage.message).toContain('sheet');
        });
    });

    // ==================== upsertCallDisposition ====================
    describe('upsertCallDisposition', () => {
        it('should return existing log ID', async () => {
            const existingCallLog = createMockExistingCallLog({ thirdPartyLogId: '123' });

            const result = await googleSheets.upsertCallDisposition({
                user: mockUser,
                existingCallLog,
                authHeader,
                dispositions: {}
            });

            expect(result.logId).toBe('123');
        });
    });
});

