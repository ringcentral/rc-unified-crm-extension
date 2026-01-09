/* eslint-disable no-undef */
/**
 * Comprehensive integration tests for Google Sheets Extra module
 * Tests file picker, sheet creation, admin configuration functions
 */

const nock = require('nock');
const googleSheetsExtra = require('../../src/connectors/googleSheets/extra');
const { createMockUser } = require('../fixtures/connectorMocks');

// Mock dependencies
jest.mock('@app-connect/core/lib/oauth', () => ({
    getOAuthApp: jest.fn().mockReturnValue({}),
    checkAndRefreshAccessToken: jest.fn().mockImplementation((app, user) => Promise.resolve(user))
}));

jest.mock('@app-connect/core/handlers/admin', () => ({
    getAdminSettings: jest.fn(),
    upsertAdminSettings: jest.fn()
}));

jest.mock('@app-connect/core/lib/util', () => ({
    getHashValue: jest.fn().mockReturnValue('hashed-account-id')
}));

jest.mock('fs', () => ({
    ...jest.requireActual('fs'),
    readFileSync: jest.fn().mockReturnValue('<html>{clientId}{key}{accessToken}{projectId}{serverUrl}{rcAccessToken}</html>')
}));

const adminCore = require('@app-connect/core/handlers/admin');

describe('Google Sheets Extra Module', () => {
    const driveApiUrl = 'https://www.googleapis.com';
    const sheetsApiUrl = 'https://sheets.googleapis.com';
    let mockUser;

    beforeEach(() => {
        nock.cleanAll();
        jest.clearAllMocks();

        // Set up environment variables
        process.env.GOOGLESHEET_CLIENT_ID = 'test-client-id';
        process.env.GOOGLESHEET_CLIENT_SECRET = 'test-client-secret';
        process.env.GOOGLESHEET_KEY = 'test-key';
        process.env.GOOGLESHEET_PROJECT_ID = 'test-project-id';
        process.env.APP_SERVER = 'https://app.example.com';
        process.env.GOOGLESHEET_REDIRECT_URI = 'https://example.com/callback';
        process.env.GOOGLESHEET_TOKEN_URI = 'https://oauth2.googleapis.com/token';
        process.env.HASH_KEY = 'test-hash-key';

        mockUser = createMockUser({
            id: '12345-googleSheets',
            hostname: 'sheets.googleapis.com',
            platform: 'googleSheets',
            accessToken: 'test-access-token',
            refreshToken: 'test-refresh-token',
            timezoneOffset: '-05:00',
            userSettings: {
                googleSheetsUrl: { value: 'https://docs.google.com/spreadsheets/d/test-sheet-id' },
                googleSheetsName: { value: 'Test Sheet' }
            },
            platformAdditionalInfo: {}
        });
    });

    afterEach(() => {
        nock.cleanAll();
    });

    // ==================== renderPickerFile ====================
    describe('renderPickerFile', () => {
        it('should render picker file with replaced placeholders', async () => {
            const result = await googleSheetsExtra.renderPickerFile({ user: mockUser });

            expect(result).toContain('test-client-id');
            expect(result).toContain('test-key');
            expect(result).toContain('test-access-token');
            expect(result).toContain('test-project-id');
            expect(result).toContain('https://app.example.com');
        });

        it('should refresh access token if needed', async () => {
            const oauth = require('@app-connect/core/lib/oauth');
            oauth.checkAndRefreshAccessToken.mockResolvedValue({
                ...mockUser,
                accessToken: 'refreshed-token'
            });

            const result = await googleSheetsExtra.renderPickerFile({ user: mockUser });

            expect(oauth.checkAndRefreshAccessToken).toHaveBeenCalled();
            expect(result).toContain('refreshed-token');
        });
    });

    // ==================== renderAdminPickerFile ====================
    describe('renderAdminPickerFile', () => {
        it('should render admin picker file with replaced placeholders including rcAccessToken', async () => {
            // Reset oauth mock to return the original user
            const oauth = require('@app-connect/core/lib/oauth');
            oauth.checkAndRefreshAccessToken.mockResolvedValue(mockUser);

            const result = await googleSheetsExtra.renderAdminPickerFile({
                user: mockUser,
                rcAccessToken: 'test-rc-token'
            });

            expect(result).toContain('test-client-id');
            expect(result).toContain('test-key');
            expect(result).toContain('test-access-token');
            expect(result).toContain('test-project-id');
            expect(result).toContain('https://app.example.com');
            expect(result).toContain('test-rc-token');
        });

        it('should refresh access token if needed', async () => {
            const oauth = require('@app-connect/core/lib/oauth');
            oauth.checkAndRefreshAccessToken.mockResolvedValue({
                ...mockUser,
                accessToken: 'refreshed-token'
            });

            const result = await googleSheetsExtra.renderAdminPickerFile({
                user: mockUser,
                rcAccessToken: 'test-rc-token'
            });

            expect(oauth.checkAndRefreshAccessToken).toHaveBeenCalled();
            expect(result).toContain('refreshed-token');
        });
    });

    // ==================== createNewSheet ====================
    describe('createNewSheet', () => {
        it('should create a new sheet when it does not exist', async () => {
            // Reset oauth mock to return the same user object (so save is called on it)
            const oauth = require('@app-connect/core/lib/oauth');
            oauth.checkAndRefreshAccessToken.mockResolvedValue(mockUser);

            // Mock Google Drive API - list spreadsheets (empty)
            nock(driveApiUrl)
                .get('/drive/v3/files')
                .query(true)
                .reply(200, { files: [] });

            // Mock Google Sheets API - create spreadsheet
            nock(sheetsApiUrl)
                .post('/v4/spreadsheets')
                .reply(200, {
                    spreadsheetId: 'new-sheet-id',
                    spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/new-sheet-id/edit',
                    properties: { title: 'RingCentral App Connect Sheet' }
                });

            // Mock append headers for all 3 sheets
            nock(sheetsApiUrl)
                .post(/\/v4\/spreadsheets\/new-sheet-id\/values\/.*:append/)
                .query(true)
                .times(3)
                .reply(200, { updates: { updatedRows: 1 } });

            const result = await googleSheetsExtra.createNewSheet({
                user: mockUser,
                data: { name: 'RingCentral App Connect Sheet' }
            });

            expect(result.successful).toBe(true);
            expect(result.sheetName).toBe('RingCentral App Connect Sheet');
            expect(result.sheetUrl).toBe('https://docs.google.com/spreadsheets/d/new-sheet-id/edit');
            expect(mockUser.save).toHaveBeenCalled();
        });

        it('should return existing sheet if it already exists', async () => {
            // Mock Google Drive API - list spreadsheets with existing sheet
            nock(driveApiUrl)
                .get('/drive/v3/files')
                .query(true)
                .reply(200, {
                    files: [{
                        id: 'existing-sheet-id',
                        name: 'Existing Sheet',
                        webViewLink: 'https://docs.google.com/spreadsheets/d/existing-sheet-id/edit'
                    }]
                });

            const result = await googleSheetsExtra.createNewSheet({
                user: mockUser,
                data: { name: 'Existing Sheet' }
            });

            expect(result.successful).toBe(true);
            expect(result.sheetName).toBe('Existing Sheet');
            expect(result.sheetUrl).toBe('https://docs.google.com/spreadsheets/d/existing-sheet-id/edit');
        });

        it('should use default name when no name provided', async () => {
            nock(driveApiUrl)
                .get('/drive/v3/files')
                .query(true)
                .reply(200, { files: [] });

            nock(sheetsApiUrl)
                .post('/v4/spreadsheets')
                .reply(200, {
                    spreadsheetId: 'default-sheet-id',
                    spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/default-sheet-id/edit',
                    properties: { title: 'RingCentral App Connect Sheet' }
                });

            nock(sheetsApiUrl)
                .post(/\/v4\/spreadsheets\/default-sheet-id\/values\/.*:append/)
                .query(true)
                .times(3)
                .reply(200, { updates: { updatedRows: 1 } });

            const result = await googleSheetsExtra.createNewSheet({
                user: mockUser,
                data: {}
            });

            expect(result.successful).toBe(true);
            expect(result.sheetName).toBe('RingCentral App Connect Sheet');
        });

        it('should handle API errors gracefully', async () => {
            nock(driveApiUrl)
                .get('/drive/v3/files')
                .query(true)
                .reply(500, { error: 'Internal error' });

            await expect(googleSheetsExtra.createNewSheet({
                user: mockUser,
                data: { name: 'Test Sheet' }
            })).rejects.toThrow();
        });
    });

    // ==================== removeSheet ====================
    describe('removeSheet', () => {
        it('should clear sheet settings from user', async () => {
            const userWithSettings = createMockUser({
                ...mockUser,
                userSettings: {
                    googleSheetsName: { value: 'Test Sheet' },
                    googleSheetsUrl: { value: 'https://docs.google.com/spreadsheets/d/test-id' }
                }
            });

            await googleSheetsExtra.removeSheet({ user: userWithSettings });

            // The function modifies userSettings but doesn't save
            expect(userWithSettings.userSettings.googleSheetsName.value).toBe('');
            expect(userWithSettings.userSettings.googleSheetsUrl.value).toBe('');
        });
    });

    // ==================== updateSelectedSheet ====================
    describe('updateSelectedSheet', () => {
        it('should update user settings with selected sheet', async () => {
            const result = await googleSheetsExtra.updateSelectedSheet({
                user: mockUser,
                data: {
                    sheetData: {
                        name: 'Selected Sheet',
                        url: 'https://docs.google.com/spreadsheets/d/selected-sheet-id'
                    }
                }
            });

            expect(result.successful).toBe(true);
            expect(result.sheetName).toBe('Selected Sheet');
            expect(result.sheetUrl).toBe('https://docs.google.com/spreadsheets/d/selected-sheet-id');
            expect(mockUser.save).toHaveBeenCalled();
        });

        it('should handle undefined sheet name gracefully', async () => {
            const result = await googleSheetsExtra.updateSelectedSheet({
                user: mockUser,
                data: {
                    sheetData: {
                        url: 'https://docs.google.com/spreadsheets/d/sheet-id'
                    }
                }
            });

            expect(result.successful).toBe(true);
            expect(result.sheetName).toBeUndefined();
            expect(result.sheetUrl).toBe('https://docs.google.com/spreadsheets/d/sheet-id');
        });
    });

    // ==================== setAdminGoogleSheetsConfig ====================
    describe('setAdminGoogleSheetsConfig', () => {
        it('should set admin configuration with new settings', async () => {
            adminCore.getAdminSettings.mockResolvedValue({ userSettings: {} });
            adminCore.upsertAdminSettings.mockResolvedValue(true);

            const result = await googleSheetsExtra.setAdminGoogleSheetsConfig({
                rcAccountId: 'rc-account-123',
                sheetName: 'Admin Sheet',
                sheetUrl: 'https://docs.google.com/spreadsheets/d/admin-sheet-id',
                customizable: true
            });

            expect(result.successful).toBe(true);
            expect(result.sheetName).toBe('Admin Sheet');
            expect(result.sheetUrl).toBe('https://docs.google.com/spreadsheets/d/admin-sheet-id');
            expect(adminCore.upsertAdminSettings).toHaveBeenCalledWith({
                hashedRcAccountId: 'hashed-account-id',
                adminSettings: expect.objectContaining({
                    userSettings: {
                        googleSheetsUrl: {
                            value: 'https://docs.google.com/spreadsheets/d/admin-sheet-id',
                            customizable: true
                        },
                        googleSheetsName: {
                            value: 'Admin Sheet',
                            customizable: true
                        }
                    }
                })
            });
        });

        it('should merge with existing admin settings', async () => {
            adminCore.getAdminSettings.mockResolvedValue({
                userSettings: {
                    existingSetting: { value: 'existing' }
                },
                otherConfig: 'value'
            });
            adminCore.upsertAdminSettings.mockResolvedValue(true);

            await googleSheetsExtra.setAdminGoogleSheetsConfig({
                rcAccountId: 'rc-account-123',
                sheetName: 'Admin Sheet',
                sheetUrl: 'https://docs.google.com/spreadsheets/d/admin-sheet-id',
                customizable: false
            });

            expect(adminCore.upsertAdminSettings).toHaveBeenCalledWith({
                hashedRcAccountId: 'hashed-account-id',
                adminSettings: expect.objectContaining({
                    otherConfig: 'value',
                    userSettings: {
                        existingSetting: { value: 'existing' },
                        googleSheetsUrl: {
                            value: 'https://docs.google.com/spreadsheets/d/admin-sheet-id',
                            customizable: false
                        },
                        googleSheetsName: {
                            value: 'Admin Sheet',
                            customizable: false
                        }
                    }
                })
            });
        });

        it('should handle null existing settings', async () => {
            adminCore.getAdminSettings.mockResolvedValue(null);
            adminCore.upsertAdminSettings.mockResolvedValue(true);

            const result = await googleSheetsExtra.setAdminGoogleSheetsConfig({
                rcAccountId: 'rc-account-123',
                sheetName: 'Admin Sheet',
                sheetUrl: 'https://docs.google.com/spreadsheets/d/admin-sheet-id',
                customizable: true
            });

            expect(result.successful).toBe(true);
        });
    });

    // ==================== getAdminGoogleSheetsConfig ====================
    describe('getAdminGoogleSheetsConfig', () => {
        it('should return admin Google Sheets configuration', async () => {
            adminCore.getAdminSettings.mockResolvedValue({
                userSettings: {
                    googleSheetsUrl: { value: 'https://docs.google.com/spreadsheets/d/admin-sheet', customizable: true },
                    googleSheetsName: { value: 'Admin Sheet', customizable: true }
                }
            });

            const result = await googleSheetsExtra.getAdminGoogleSheetsConfig({
                rcAccountId: 'rc-account-123'
            });

            expect(result.googleSheetsUrl).toEqual({
                value: 'https://docs.google.com/spreadsheets/d/admin-sheet',
                customizable: true
            });
            expect(result.googleSheetsName).toEqual({
                value: 'Admin Sheet',
                customizable: true
            });
        });

        it('should return null for missing config', async () => {
            adminCore.getAdminSettings.mockResolvedValue(null);

            const result = await googleSheetsExtra.getAdminGoogleSheetsConfig({
                rcAccountId: 'rc-account-123'
            });

            expect(result.googleSheetsUrl).toBeNull();
            expect(result.googleSheetsName).toBeNull();
        });

        it('should return null for empty userSettings', async () => {
            adminCore.getAdminSettings.mockResolvedValue({ userSettings: {} });

            const result = await googleSheetsExtra.getAdminGoogleSheetsConfig({
                rcAccountId: 'rc-account-123'
            });

            // When userSettings is empty, accessing undefined properties with || null returns null
            expect(result.googleSheetsUrl).toBeNull();
            expect(result.googleSheetsName).toBeNull();
        });
    });

    // ==================== Error Scenarios ====================
    describe('Error Scenarios', () => {
        it('should handle listSpreadsheets API errors', async () => {
            nock(driveApiUrl)
                .get('/drive/v3/files')
                .query(true)
                .replyWithError('Network error');

            await expect(googleSheetsExtra.createNewSheet({
                user: mockUser,
                data: { name: 'Test Sheet' }
            })).rejects.toThrow();
        });

        it('should handle createSpreadsheetWithHeaders errors gracefully', async () => {
            nock(driveApiUrl)
                .get('/drive/v3/files')
                .query(true)
                .reply(200, { files: [] });

            // Spreadsheet creation fails
            nock(sheetsApiUrl)
                .post('/v4/spreadsheets')
                .reply(403, { error: 'Insufficient permissions' });

            await expect(googleSheetsExtra.createNewSheet({
                user: mockUser,
                data: { name: 'Test Sheet' }
            })).rejects.toThrow();
        });
    });
});

