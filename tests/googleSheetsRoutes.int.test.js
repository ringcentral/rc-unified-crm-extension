/* eslint-disable no-undef */
/**
 * Integration tests for Google Sheets specific routes in src/index.js
 * Tests all Google Sheets endpoints including file picker, sheet management, and admin routes
 */

const request = require('supertest');
const nock = require('nock');
const { getServer } = require('../src/index');
const jwt = require('@app-connect/core/lib/jwt');
const { UserModel } = require('@app-connect/core/models/userModel');

// Mock dependencies
jest.mock('@app-connect/core/lib/oauth', () => ({
    getOAuthApp: jest.fn().mockReturnValue({}),
    checkAndRefreshAccessToken: jest.fn().mockImplementation((app, user) => Promise.resolve(user))
}));

jest.mock('@app-connect/core/handlers/admin', () => ({
    validateAdminRole: jest.fn(),
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

// Test data
const testUserId = 'test-google-user-123';
const googleSub = '12345678901234567890';

describe('Google Sheets Routes', () => {
    let mockUser;
    let validJwt;

    beforeAll(async () => {
        // Set up environment variables
        process.env.GOOGLESHEET_CLIENT_ID = 'test-client-id';
        process.env.GOOGLESHEET_CLIENT_SECRET = 'test-client-secret';
        process.env.GOOGLESHEET_KEY = 'test-key';
        process.env.GOOGLESHEET_PROJECT_ID = 'test-project-id';
        process.env.APP_SERVER = 'https://app.example.com';
        process.env.GOOGLESHEET_REDIRECT_URI = 'https://example.com/callback';
        process.env.GOOGLESHEET_TOKEN_URI = 'https://oauth2.googleapis.com/token';
        process.env.HASH_KEY = 'test-hash-key';

        // Create test user
        mockUser = await UserModel.create({
            id: testUserId,
            hostname: 'sheets.googleapis.com',
            platform: 'googleSheets',
            accessToken: 'test-access-token',
            refreshToken: 'test-refresh-token',
            rcUserNumber: '+1234567890',
            timezoneOffset: '+00:00',
            userSettings: {
                googleSheetsUrl: { value: 'https://docs.google.com/spreadsheets/d/test-id' },
                googleSheetsName: { value: 'Test Sheet' }
            },
            platformAdditionalInfo: {}
        });

        validJwt = jwt.generateJwt({ id: testUserId, platform: 'googleSheets' });
    });

    afterAll(async () => {
        await UserModel.destroy({ where: { id: testUserId } });
        await UserModel.destroy({ where: { id: `${googleSub}-googleSheets` } });
    });

    beforeEach(() => {
        nock.cleanAll();
        jest.clearAllMocks();
    });

    // ==================== GET /googleSheets/filePicker ====================
    describe('GET /googleSheets/filePicker', () => {
        it('should return file picker HTML with valid token', async () => {
            const res = await request(getServer())
                .get(`/googleSheets/filePicker?token=${validJwt}`);

            expect(res.status).toBe(200);
            expect(res.text).toContain('test-client-id');
        });

        it('should return 400 when token is missing', async () => {
            const res = await request(getServer())
                .get('/googleSheets/filePicker');

            expect(res.status).toBe(400);
            expect(res.text).toBe('Please go to Settings and authorize CRM platform');
        });

        it('should return 400 when user not found', async () => {
            const invalidJwt = jwt.generateJwt({ id: 'non-existent-user', platform: 'googleSheets' });

            const res = await request(getServer())
                .get(`/googleSheets/filePicker?token=${invalidJwt}`);

            expect(res.status).toBe(400);
        });

        it('should return 400 on invalid jwt format', async () => {
            // Invalid JWT format returns 400 (user not found after decode returns empty)
            const res = await request(getServer())
                .get('/googleSheets/filePicker?token=invalid.jwt.token');

            expect(res.status).toBe(400);
        });
    });

    // ==================== POST /googleSheets/sheet ====================
    describe('POST /googleSheets/sheet', () => {
        it('should create new sheet with valid token', async () => {
            // Mock Google Drive API - list spreadsheets
            nock('https://www.googleapis.com')
                .get('/drive/v3/files')
                .query(true)
                .reply(200, { files: [] });

            // Mock Google Sheets API - create spreadsheet
            nock('https://sheets.googleapis.com')
                .post('/v4/spreadsheets')
                .reply(200, {
                    spreadsheetId: 'new-sheet-id',
                    spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/new-sheet-id',
                    properties: { title: 'RingCentral App Connect Sheet' }
                });

            // Mock append headers
            nock('https://sheets.googleapis.com')
                .post(/\/v4\/spreadsheets\/new-sheet-id\/values\/.*:append/)
                .query(true)
                .times(3)
                .reply(200, { updates: { updatedRows: 1 } });

            const res = await request(getServer())
                .post(`/googleSheets/sheet?jwtToken=${validJwt}`)
                .send({ name: 'RingCentral App Connect Sheet' });

            expect(res.status).toBe(200);
            expect(res.body.name).toBeDefined();
            expect(res.body.url).toBeDefined();
        });

        it('should return existing sheet if it already exists', async () => {
            // Mock Google Drive API - list spreadsheets with existing sheet
            nock('https://www.googleapis.com')
                .get('/drive/v3/files')
                .query(true)
                .reply(200, {
                    files: [{
                        id: 'existing-sheet-id',
                        name: 'Test Sheet',
                        webViewLink: 'https://docs.google.com/spreadsheets/d/existing-sheet-id'
                    }]
                });

            const res = await request(getServer())
                .post(`/googleSheets/sheet?jwtToken=${validJwt}`)
                .send({ name: 'Test Sheet' });

            expect(res.status).toBe(200);
            expect(res.body.name).toBe('Test Sheet');
        });

        it('should return 400 when jwtToken is missing', async () => {
            const res = await request(getServer())
                .post('/googleSheets/sheet')
                .send({ name: 'Test Sheet' });

            expect(res.status).toBe(400);
            expect(res.text).toBe('Please go to Settings and authorize CRM platform');
        });

        it('should return 400 when user not found', async () => {
            const invalidJwt = jwt.generateJwt({ id: 'non-existent-user', platform: 'googleSheets' });

            const res = await request(getServer())
                .post(`/googleSheets/sheet?jwtToken=${invalidJwt}`)
                .send({ name: 'Test Sheet' });

            expect(res.status).toBe(400);
        });

        it('should return 400 on invalid jwt format', async () => {
            // Invalid JWT format returns 400 (user not found after decode)
            const res = await request(getServer())
                .post('/googleSheets/sheet?jwtToken=invalid.jwt')
                .send({ name: 'Test Sheet' });

            expect(res.status).toBe(400);
        });
    });

    // ==================== DELETE /googleSheets/sheet ====================
    describe('DELETE /googleSheets/sheet', () => {
        it('should remove sheet with valid token', async () => {
            const res = await request(getServer())
                .delete(`/googleSheets/sheet?jwtToken=${validJwt}`);

            expect(res.status).toBe(200);
            expect(res.text).toBe('Sheet removed');
        });

        it('should return 400 when jwtToken is missing', async () => {
            const res = await request(getServer())
                .delete('/googleSheets/sheet');

            expect(res.status).toBe(400);
            expect(res.text).toBe('Please go to Settings and authorize CRM platform');
        });

        it('should return 400 when user not found', async () => {
            const invalidJwt = jwt.generateJwt({ id: 'non-existent-user', platform: 'googleSheets' });

            const res = await request(getServer())
                .delete(`/googleSheets/sheet?jwtToken=${invalidJwt}`);

            expect(res.status).toBe(400);
        });

        it('should return 400 on invalid jwt format', async () => {
            // Invalid JWT format returns 400 (user not found after decode)
            const res = await request(getServer())
                .delete('/googleSheets/sheet?jwtToken=invalid.jwt');

            expect(res.status).toBe(400);
        });
    });

    // ==================== POST /googleSheets/selectedSheet ====================
    describe('POST /googleSheets/selectedSheet', () => {
        beforeEach(async () => {
            // Create user that matches the Google user ID pattern
            await UserModel.findOrCreate({
                where: { id: `${googleSub}-googleSheets` },
                defaults: {
                    id: `${googleSub}-googleSheets`,
                    hostname: 'sheets.googleapis.com',
                    platform: 'googleSheets',
                    accessToken: 'test-access-token',
                    refreshToken: 'test-refresh-token',
                    rcUserNumber: '+1234567890',
                    timezoneOffset: '+00:00',
                    userSettings: {},
                    platformAdditionalInfo: {}
                }
            });
        });

        it('should update selected sheet with valid access token', async () => {
            // Mock Google user info API
            nock('https://www.googleapis.com')
                .get('/oauth2/v3/userinfo')
                .reply(200, {
                    sub: googleSub,
                    name: 'Test User',
                    email: 'test@gmail.com'
                });

            const res = await request(getServer())
                .post('/googleSheets/selectedSheet')
                .send({
                    accessToken: 'valid-google-access-token',
                    sheetData: {
                        name: 'Selected Sheet',
                        url: 'https://docs.google.com/spreadsheets/d/selected-sheet-id'
                    }
                });

            expect(res.status).toBe(200);
            expect(res.body.message).toBe('Sheet selected');
        });

        it('should return 400 when user not found', async () => {
            // Mock Google user info API with different sub
            nock('https://www.googleapis.com')
                .get('/oauth2/v3/userinfo')
                .reply(200, {
                    sub: 'unknown-google-sub',
                    name: 'Unknown User',
                    email: 'unknown@gmail.com'
                });

            const res = await request(getServer())
                .post('/googleSheets/selectedSheet')
                .send({
                    accessToken: 'valid-google-access-token',
                    sheetData: {
                        name: 'Selected Sheet',
                        url: 'https://docs.google.com/spreadsheets/d/selected-sheet-id'
                    }
                });

            expect(res.status).toBe(400);
            expect(res.text).toBe('User not found');
        });
    });

    // ==================== Admin Routes ====================
    describe('Admin Google Sheets Routes', () => {
        // ==================== GET /admin/googleSheets/filePicker ====================
        describe('GET /admin/googleSheets/filePicker', () => {
            it('should return admin file picker HTML with valid token', async () => {
                const res = await request(getServer())
                    .get(`/admin/googleSheets/filePicker?jwtToken=${validJwt}&rcAccessToken=test-rc-token`);

                expect(res.status).toBe(200);
                expect(res.text).toContain('test-client-id');
            });

            it('should return 400 when jwtToken is missing', async () => {
                const res = await request(getServer())
                    .get('/admin/googleSheets/filePicker');

                expect(res.status).toBe(400);
                expect(res.text).toBe('Please authorize admin access');
            });

            it('should return 400 when user not found', async () => {
                const invalidJwt = jwt.generateJwt({ id: 'non-existent-user', platform: 'googleSheets' });

                const res = await request(getServer())
                    .get(`/admin/googleSheets/filePicker?jwtToken=${invalidJwt}&rcAccessToken=test-rc-token`);

                expect(res.status).toBe(400);
                expect(res.text).toBe('User not found');
            });

            it('should return 400 on invalid jwt format', async () => {
                // Invalid JWT format returns 400 (user not found after decode)
                const res = await request(getServer())
                    .get('/admin/googleSheets/filePicker?jwtToken=invalid.jwt&rcAccessToken=test-rc-token');

                expect(res.status).toBe(400);
            });
        });

        // ==================== POST /admin/googleSheets/sheet ====================
        describe('POST /admin/googleSheets/sheet', () => {
            it('should create admin sheet with valid admin role', async () => {
                adminCore.validateAdminRole.mockResolvedValue({ isValidated: true, rcAccountId: 'rc-account-123' });
                adminCore.getAdminSettings.mockResolvedValue({ userSettings: {} });
                adminCore.upsertAdminSettings.mockResolvedValue(true);

                // Mock Google Drive API
                nock('https://www.googleapis.com')
                    .get('/drive/v3/files')
                    .query(true)
                    .reply(200, { files: [] });

                // Mock Google Sheets API
                nock('https://sheets.googleapis.com')
                    .post('/v4/spreadsheets')
                    .reply(200, {
                        spreadsheetId: 'admin-sheet-id',
                        spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/admin-sheet-id',
                        properties: { title: 'Admin Sheet' }
                    });

                // Mock append headers
                nock('https://sheets.googleapis.com')
                    .post(/\/v4\/spreadsheets\/admin-sheet-id\/values\/.*:append/)
                    .query(true)
                    .times(3)
                    .reply(200, { updates: { updatedRows: 1 } });

                const res = await request(getServer())
                    .post(`/admin/googleSheets/sheet?jwtToken=${validJwt}&rcAccessToken=test-rc-token`)
                    .send({ name: 'Admin Sheet', customizable: true });

                expect(res.status).toBe(200);
                expect(res.body.name).toBeDefined();
            });

            it('should return 401 when admin validation fails', async () => {
                adminCore.validateAdminRole.mockResolvedValue({ isValidated: false });

                const res = await request(getServer())
                    .post(`/admin/googleSheets/sheet?jwtToken=${validJwt}&rcAccessToken=test-rc-token`)
                    .send({ name: 'Admin Sheet' });

                expect(res.status).toBe(401);
                expect(res.text).toBe('Admin validation failed');
            });

            it('should return 400 when user not found', async () => {
                const invalidJwt = jwt.generateJwt({ id: 'non-existent-user', platform: 'googleSheets' });

                const res = await request(getServer())
                    .post(`/admin/googleSheets/sheet?jwtToken=${invalidJwt}&rcAccessToken=test-rc-token`)
                    .send({ name: 'Admin Sheet' });

                expect(res.status).toBe(400);
                expect(res.text).toBe('User not found');
            });

            it('should return 500 when sheet creation fails', async () => {
                adminCore.validateAdminRole.mockResolvedValue({ isValidated: true, rcAccountId: 'rc-account-123' });

                // Mock Google Drive API to return error
                nock('https://www.googleapis.com')
                    .get('/drive/v3/files')
                    .query(true)
                    .reply(500, { error: 'Internal error' });

                const res = await request(getServer())
                    .post(`/admin/googleSheets/sheet?jwtToken=${validJwt}&rcAccessToken=test-rc-token`)
                    .send({ name: 'Admin Sheet' });

                expect(res.status).toBe(500);
            });
        });

        // ==================== POST /admin/googleSheets/selectedSheet ====================
        describe('POST /admin/googleSheets/selectedSheet', () => {
            beforeEach(async () => {
                await UserModel.findOrCreate({
                    where: { id: `${googleSub}-googleSheets` },
                    defaults: {
                        id: `${googleSub}-googleSheets`,
                        hostname: 'sheets.googleapis.com',
                        platform: 'googleSheets',
                        accessToken: 'test-access-token',
                        refreshToken: 'test-refresh-token',
                        rcUserNumber: '+1234567890',
                        timezoneOffset: '+00:00',
                        userSettings: {},
                        platformAdditionalInfo: {}
                    }
                });
            });

            it('should update admin selected sheet with valid admin role', async () => {
                adminCore.validateAdminRole.mockResolvedValue({ isValidated: true, rcAccountId: 'rc-account-123' });
                adminCore.getAdminSettings.mockResolvedValue({ userSettings: {} });
                adminCore.upsertAdminSettings.mockResolvedValue(true);

                nock('https://www.googleapis.com')
                    .get('/oauth2/v3/userinfo')
                    .reply(200, {
                        sub: googleSub,
                        name: 'Test User',
                        email: 'test@gmail.com'
                    });

                const res = await request(getServer())
                    .post(`/admin/googleSheets/selectedSheet?rcAccessToken=test-rc-token`)
                    .send({
                        accessToken: 'valid-google-access-token',
                        sheetData: {
                            name: 'Admin Selected Sheet',
                            url: 'https://docs.google.com/spreadsheets/d/admin-selected-id'
                        },
                        customizable: true
                    });

                expect(res.status).toBe(200);
                expect(res.body.message).toBe('Admin sheet configuration saved');
            });

            it('should return 401 when admin validation fails', async () => {
                adminCore.validateAdminRole.mockResolvedValue({ isValidated: false });

                nock('https://www.googleapis.com')
                    .get('/oauth2/v3/userinfo')
                    .reply(200, {
                        sub: googleSub,
                        name: 'Test User',
                        email: 'test@gmail.com'
                    });

                const res = await request(getServer())
                    .post(`/admin/googleSheets/selectedSheet?rcAccessToken=test-rc-token`)
                    .send({
                        accessToken: 'valid-google-access-token',
                        sheetData: {
                            name: 'Admin Selected Sheet',
                            url: 'https://docs.google.com/spreadsheets/d/admin-selected-id'
                        }
                    });

                expect(res.status).toBe(401);
                expect(res.text).toBe('Admin validation failed');
            });

            it('should return 400 when user not found', async () => {
                nock('https://www.googleapis.com')
                    .get('/oauth2/v3/userinfo')
                    .reply(200, {
                        sub: 'unknown-sub',
                        name: 'Unknown User',
                        email: 'unknown@gmail.com'
                    });

                const res = await request(getServer())
                    .post(`/admin/googleSheets/selectedSheet?rcAccessToken=test-rc-token`)
                    .send({
                        accessToken: 'valid-google-access-token',
                        sheetData: {
                            name: 'Admin Selected Sheet',
                            url: 'https://docs.google.com/spreadsheets/d/admin-selected-id'
                        }
                    });

                expect(res.status).toBe(400);
                expect(res.text).toBe('User not found');
            });

            it('should return 500 on internal error', async () => {
                // Mock Google API to fail
                nock('https://www.googleapis.com')
                    .get('/oauth2/v3/userinfo')
                    .reply(500, { error: 'Internal error' });

                const res = await request(getServer())
                    .post(`/admin/googleSheets/selectedSheet?rcAccessToken=test-rc-token`)
                    .send({
                        accessToken: 'valid-google-access-token',
                        sheetData: { name: 'Sheet', url: 'https://...' }
                    });

                expect(res.status).toBe(500);
            });
        });

        // ==================== GET /admin/googleSheets/config ====================
        describe('GET /admin/googleSheets/config', () => {
            it('should return admin config with valid admin role', async () => {
                adminCore.validateAdminRole.mockResolvedValue({ isValidated: true, rcAccountId: 'rc-account-123' });
                adminCore.getAdminSettings.mockResolvedValue({
                    userSettings: {
                        googleSheetsUrl: { value: 'https://docs.google.com/spreadsheets/d/admin-sheet' },
                        googleSheetsName: { value: 'Admin Sheet' }
                    }
                });

                const res = await request(getServer())
                    .get(`/admin/googleSheets/config?jwtToken=${validJwt}&rcAccessToken=test-rc-token`);

                expect(res.status).toBe(200);
                expect(res.body.googleSheetsUrl).toBeDefined();
                expect(res.body.googleSheetsName).toBeDefined();
            });

            it('should return 401 when admin validation fails', async () => {
                adminCore.validateAdminRole.mockResolvedValue({ isValidated: false });

                const res = await request(getServer())
                    .get(`/admin/googleSheets/config?jwtToken=${validJwt}&rcAccessToken=test-rc-token`);

                expect(res.status).toBe(401);
                expect(res.text).toBe('Admin validation failed');
            });

            it('should return 400 when jwtToken is missing', async () => {
                const res = await request(getServer())
                    .get('/admin/googleSheets/config');

                expect(res.status).toBe(400);
                expect(res.text).toBe('Please authorize admin access');
            });

            it('should return 400 when user not found', async () => {
                const invalidJwt = jwt.generateJwt({ id: 'non-existent-user', platform: 'googleSheets' });

                const res = await request(getServer())
                    .get(`/admin/googleSheets/config?jwtToken=${invalidJwt}&rcAccessToken=test-rc-token`);

                expect(res.status).toBe(400);
                expect(res.text).toBe('User not found');
            });

            it('should return 400 on invalid jwt format', async () => {
                // Invalid JWT format returns 400 (user not found after decode)
                const res = await request(getServer())
                    .get('/admin/googleSheets/config?jwtToken=invalid.jwt&rcAccessToken=test-rc-token');

                expect(res.status).toBe(400);
            });
        });
    });
});

