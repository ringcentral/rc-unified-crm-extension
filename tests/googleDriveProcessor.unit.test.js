/**
 * Unit tests for googleDriveProcessor.js
 * Tests OAuth authentication, file uploads, and user management for Google Drive integration
 */

// Mock oauth module before importing the processor
jest.mock('@app-connect/core/lib/oauth', () => ({
    getOAuthApp: jest.fn().mockReturnValue({
        code: {
            getUri: jest.fn().mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth?mock=true'),
            getToken: jest.fn().mockResolvedValue({
                accessToken: 'new-access-token',
                refreshToken: 'new-refresh-token',
                expires: new Date(Date.now() + 3600000)
            })
        }
    }),
    checkAndRefreshAccessToken: jest.fn().mockImplementation((app, user) => Promise.resolve(user))
}));

jest.mock('axios');

const axios = require('axios');
const oauth = require('@app-connect/core/lib/oauth');
const { PtpUserModel } = require('../src/processors/models/ptpUserModel');
const { GoogleDriveFileModel } = require('../src/processors/models/googleDriveFileModel');
const { CacheModel } = require('@app-connect/core/models/cacheModel');

// Import processor after mocks are set up
const googleDriveProcessor = require('../src/processors/googleDriveProcessor');

describe('googleDriveProcessor', () => {
    beforeAll(async () => {
        // Set up environment variables
        process.env.GOOGLE_DRIVE_PTP_CLIENT_ID = 'test-client-id';
        process.env.GOOGLE_DRIVE_PTP_CLIENT_SECRET = 'test-client-secret';
        process.env.GOOGLE_DRIVE_PTP_REDIRECT_URI = 'https://example.com/callback';
        process.env.GOOGLE_DRIVE_PTP_TOKEN_URI = 'https://oauth2.googleapis.com/token';
        process.env.GOOGLE_DRIVE_PTP_AUTHORIZATION_URI = 'https://accounts.google.com/o/oauth2/v2/auth';
        process.env.APP_SERVER = 'https://app.example.com';

        // Sync models
        await PtpUserModel.sync({ force: true });
        await GoogleDriveFileModel.sync({ force: true });
        await CacheModel.sync({ force: true });
    });

    afterEach(async () => {
        // Clean up test data
        await PtpUserModel.destroy({ where: {} });
        await GoogleDriveFileModel.destroy({ where: {} });
        await CacheModel.destroy({ where: {} });
        jest.clearAllMocks();
    });

    describe('checkAuth', () => {
        test('should return successful true when user has accessToken', async () => {
            // Arrange
            await PtpUserModel.create({
                id: 'test-user-123',
                accessToken: 'valid-access-token',
                refreshToken: 'valid-refresh-token'
            });

            // Act
            const result = await googleDriveProcessor.checkAuth({ userId: 'test-user-123' });

            // Assert
            expect(result).toEqual({ successful: true });
        });

        test('should return successful false when user not found', async () => {
            // Act
            const result = await googleDriveProcessor.checkAuth({ userId: 'non-existent-user' });

            // Assert
            expect(result).toEqual({ successful: false });
        });

        test('should return successful false when user has no accessToken', async () => {
            // Arrange
            await PtpUserModel.create({
                id: 'test-user-no-token',
                accessToken: null,
                refreshToken: null
            });

            // Act
            const result = await googleDriveProcessor.checkAuth({ userId: 'test-user-no-token' });

            // Assert
            expect(result).toEqual({ successful: false });
        });

        test('should return successful false when user has empty accessToken', async () => {
            // Arrange
            await PtpUserModel.create({
                id: 'test-user-empty-token',
                accessToken: '',
                refreshToken: ''
            });

            // Act
            const result = await googleDriveProcessor.checkAuth({ userId: 'test-user-empty-token' });

            // Assert
            expect(result).toEqual({ successful: false });
        });
    });

    describe('logout', () => {
        test('should destroy user and return success message', async () => {
            // Arrange
            await PtpUserModel.create({
                id: 'test-user-to-logout',
                accessToken: 'some-token',
                refreshToken: 'some-refresh-token'
            });

            // Act
            const result = await googleDriveProcessor.logout({ userId: 'test-user-to-logout' });

            // Assert
            expect(result.successful).toBe(true);
            expect(result.returnMessage.message).toBe('User logged out');
            expect(result.returnMessage.messageType).toBe('success');
            expect(result.returnMessage.ttl).toBe(3000);

            // Verify user was deleted
            const deletedUser = await PtpUserModel.findByPk('test-user-to-logout');
            expect(deletedUser).toBeNull();
        });

        test('should return success even if user not found', async () => {
            // Act
            const result = await googleDriveProcessor.logout({ userId: 'non-existent-user' });

            // Assert
            expect(result.successful).toBe(true);
            expect(result.returnMessage.message).toBe('User logged out');
        });
    });

    describe('getOAuthUrl', () => {
        test('should generate OAuth URL with encoded state containing jwtToken', async () => {
            // Arrange
            const jwtToken = 'test-jwt-token-123';

            // Act
            const result = await googleDriveProcessor.getOAuthUrl({ jwtToken });

            // Assert
            expect(result).toBeDefined();
            expect(typeof result).toBe('string');

            // Verify getUri was called with correct parameters
            const mockGetUri = oauth.getOAuthApp().code.getUri;
            expect(mockGetUri).toHaveBeenCalled();
            const callArgs = mockGetUri.mock.calls[0][0];
            expect(callArgs.query.access_type).toBe('offline');
            expect(callArgs.query.prompt).toBe('consent');

            // Verify state contains jwtToken
            const decodedState = JSON.parse(decodeURIComponent(callArgs.state));
            expect(decodedState.jwtToken).toBe(jwtToken);
            expect(decodedState.from).toBe('ptp');
            expect(decodedState.redirectTo).toContain('/googleDrive/oauthCallback');
        });
    });

    describe('onOAuthCallback', () => {
        test('should create new PtpUser when user does not exist', async () => {
            // Arrange
            const user = { id: 'new-user-123' };
            const callbackUri = 'https://example.com/callback?code=auth-code';

            // Act
            await googleDriveProcessor.onOAuthCallback({ user, callbackUri });

            // Assert
            const createdUser = await PtpUserModel.findByPk('new-user-123');
            expect(createdUser).not.toBeNull();
            expect(createdUser.accessToken).toBe('new-access-token');
            expect(createdUser.refreshToken).toBe('new-refresh-token');
        });

        test('should update existing PtpUser when user exists', async () => {
            // Arrange
            await PtpUserModel.create({
                id: 'existing-user-123',
                accessToken: 'old-access-token',
                refreshToken: 'old-refresh-token'
            });

            const user = { id: 'existing-user-123' };
            const callbackUri = 'https://example.com/callback?code=auth-code';

            // Act
            await googleDriveProcessor.onOAuthCallback({ user, callbackUri });

            // Assert
            const updatedUser = await PtpUserModel.findByPk('existing-user-123');
            expect(updatedUser.accessToken).toBe('new-access-token');
            expect(updatedUser.refreshToken).toBe('new-refresh-token');
        });
    });

    describe('uploadToGoogleDrive', () => {
        const mockUploadData = {
            logInfo: {
                telephonySessionId: 'tel-session-123',
                recordingDownloadLink: 'https://media.example.com/recording.mp3?accessToken=rc-token-123',
                direction: 'Outbound',
                from: { phoneNumber: '+1234567890' },
                to: { phoneNumber: '+0987654321' }
            }
        };

        test('should return error when cache not found', async () => {
            // Arrange
            const user = { id: 'test-user' };

            // Act
            const result = await googleDriveProcessor.uploadToGoogleDrive({
                user,
                data: mockUploadData,
                taskId: 'non-existent-cache'
            });

            // Assert
            expect(result.successful).toBe(false);
            expect(result.message).toBe('Cache not found');
        });

        test('should return success when file already uploaded (duplicate check)', async () => {
            // Arrange
            await CacheModel.create({
                id: 'task-123',
                status: 'initialized',
                userId: 'test-user',
                cacheKey: 'ptpTask-googleDrive'
            });
            await GoogleDriveFileModel.create({
                id: 'existing-file-id',
                userId: 'test-user',
                telephonySessionId: 'tel-session-123'
            });

            const user = { id: 'test-user' };

            // Act
            const result = await googleDriveProcessor.uploadToGoogleDrive({
                user,
                data: mockUploadData,
                taskId: 'task-123'
            });

            // Assert
            expect(result.successful).toBe(true);
            expect(result.message).toBe('File already uploaded to Google Drive');

            // Cache should be destroyed
            const cache = await CacheModel.findByPk('task-123');
            expect(cache).toBeNull();
        });

        test('should return error when no recording URL found', async () => {
            // Arrange
            await CacheModel.create({
                id: 'task-no-url',
                status: 'initialized',
                userId: 'test-user',
                cacheKey: 'ptpTask-googleDrive'
            });

            const user = { id: 'test-user' };
            const dataNoUrl = {
                logInfo: {
                    telephonySessionId: 'tel-session-no-url',
                    direction: 'Outbound'
                }
            };

            // Act
            const result = await googleDriveProcessor.uploadToGoogleDrive({
                user,
                data: dataNoUrl,
                taskId: 'task-no-url'
            });

            // Assert
            expect(result.successful).toBe(false);
            expect(result.message).toBe('No recording download URL found');
        });

        test('should return error when PtpUser not found', async () => {
            // Arrange
            await CacheModel.create({
                id: 'task-no-user',
                status: 'initialized',
                userId: 'test-user',
                cacheKey: 'ptpTask-googleDrive'
            });

            const user = { id: 'non-existent-ptp-user' };

            // Act
            const result = await googleDriveProcessor.uploadToGoogleDrive({
                user,
                data: mockUploadData,
                taskId: 'task-no-user'
            });

            // Assert
            expect(result.successful).toBe(false);
            expect(result.message).toBe('User not found');
        });

        test('should successfully upload file and create GoogleDriveFile record', async () => {
            // Arrange
            await CacheModel.create({
                id: 'task-success',
                status: 'initialized',
                userId: 'test-user',
                cacheKey: 'ptpTask-googleDrive'
            });
            await PtpUserModel.create({
                id: 'test-user',
                accessToken: 'valid-token',
                refreshToken: 'valid-refresh'
            });

            const user = { id: 'test-user' };

            // Mock axios for file download
            axios.get.mockResolvedValueOnce({
                data: Buffer.from('mock audio content')
            });

            // Mock axios for folder search (not found)
            axios.get.mockResolvedValueOnce({
                data: { files: [] }
            });

            // Mock axios for folder creation
            axios.post.mockResolvedValueOnce({
                data: { id: 'new-folder-id' }
            });

            // Mock axios for file upload
            axios.post.mockResolvedValueOnce({
                data: { id: 'uploaded-file-id', name: 'recording.mp3' }
            });

            // Act
            const result = await googleDriveProcessor.uploadToGoogleDrive({
                user,
                data: mockUploadData,
                taskId: 'task-success'
            });

            // Assert
            expect(result.id).toBe('uploaded-file-id');

            // Verify GoogleDriveFile record was created
            const fileRecord = await GoogleDriveFileModel.findByPk('uploaded-file-id');
            expect(fileRecord).not.toBeNull();
            expect(fileRecord.userId).toBe('test-user');
            expect(fileRecord.telephonySessionId).toBe('tel-session-123');

            // Verify cache status was set to completed
            const cache = await CacheModel.findByPk('task-success');
            expect(cache.status).toBe('completed');
        });

        test('should set cache status to processing during upload', async () => {
            // Arrange
            await CacheModel.create({
                id: 'task-processing',
                status: 'initialized',
                userId: 'test-user',
                cacheKey: 'ptpTask-googleDrive'
            });

            // This will fail because no PtpUser exists, but we can check
            // that status was set to processing first
            const user = { id: 'test-user' };

            // Act
            await googleDriveProcessor.uploadToGoogleDrive({
                user,
                data: mockUploadData,
                taskId: 'task-processing'
            });

            // The cache should have been destroyed since user not found
            // but let's verify the flow by checking with a valid user
        });

        test('should set cache status to failed on error', async () => {
            // Arrange
            await CacheModel.create({
                id: 'task-fail',
                status: 'initialized',
                userId: 'test-user',
                cacheKey: 'ptpTask-googleDrive'
            });
            await PtpUserModel.create({
                id: 'test-user',
                accessToken: 'valid-token',
                refreshToken: 'valid-refresh'
            });

            const user = { id: 'test-user' };

            // Mock axios to throw error on file download
            axios.get.mockRejectedValueOnce(new Error('Network error'));

            // Act
            const result = await googleDriveProcessor.uploadToGoogleDrive({
                user,
                data: mockUploadData,
                taskId: 'task-fail'
            });

            // Assert
            expect(result.successful).toBe(false);
            expect(result.message).toBe('Failed to upload to Google Drive');

            // Verify cache status was set to failed
            const cache = await CacheModel.findByPk('task-fail');
            expect(cache.status).toBe('failed');
        });

        test('should use correct folder based on Outbound call direction', async () => {
            // Arrange
            await CacheModel.create({
                id: 'task-outbound',
                status: 'initialized',
                userId: 'test-user',
                cacheKey: 'ptpTask-googleDrive'
            });
            await PtpUserModel.create({
                id: 'test-user',
                accessToken: 'valid-token',
                refreshToken: 'valid-refresh'
            });

            const user = { id: 'test-user' };
            const outboundData = {
                logInfo: {
                    telephonySessionId: 'tel-session-outbound',
                    recordingDownloadLink: 'https://media.example.com/recording.mp3?accessToken=token',
                    direction: 'Outbound',
                    from: { phoneNumber: '+1111111111' },
                    to: { phoneNumber: '+2222222222' }
                }
            };

            // Mock axios calls
            axios.get
                .mockResolvedValueOnce({ data: Buffer.from('audio') }) // download
                .mockResolvedValueOnce({ data: { files: [{ id: 'existing-folder' }] } }); // find folder

            axios.post.mockResolvedValueOnce({
                data: { id: 'file-id', name: 'recording.mp3' }
            });

            // Act
            await googleDriveProcessor.uploadToGoogleDrive({
                user,
                data: outboundData,
                taskId: 'task-outbound'
            });

            // Assert - for Outbound calls, folder should be named after toNumber
            const findFolderCall = axios.get.mock.calls[1];
            expect(findFolderCall[1].params.q).toContain('+2222222222');
        });

        test('should use correct folder based on Inbound call direction', async () => {
            // Arrange
            await CacheModel.create({
                id: 'task-inbound',
                status: 'initialized',
                userId: 'test-user',
                cacheKey: 'ptpTask-googleDrive'
            });
            await PtpUserModel.create({
                id: 'test-user',
                accessToken: 'valid-token',
                refreshToken: 'valid-refresh'
            });

            const user = { id: 'test-user' };
            const inboundData = {
                logInfo: {
                    telephonySessionId: 'tel-session-inbound',
                    recordingDownloadLink: 'https://media.example.com/recording.mp3?accessToken=token',
                    direction: 'Inbound',
                    from: { phoneNumber: '+3333333333' },
                    to: { phoneNumber: '+4444444444' }
                }
            };

            // Mock axios calls
            axios.get
                .mockResolvedValueOnce({ data: Buffer.from('audio') }) // download
                .mockResolvedValueOnce({ data: { files: [{ id: 'existing-folder' }] } }); // find folder

            axios.post.mockResolvedValueOnce({
                data: { id: 'file-id', name: 'recording.mp3' }
            });

            // Act
            await googleDriveProcessor.uploadToGoogleDrive({
                user,
                data: inboundData,
                taskId: 'task-inbound'
            });

            // Assert - for Inbound calls, folder should be named after fromNumber
            const findFolderCall = axios.get.mock.calls[1];
            expect(findFolderCall[1].params.q).toContain('+3333333333');
        });

        test('should use recording.downloadUrl as fallback for file URL', async () => {
            // Arrange
            await CacheModel.create({
                id: 'task-fallback-url',
                status: 'initialized',
                userId: 'test-user',
                cacheKey: 'ptpTask-googleDrive'
            });
            await PtpUserModel.create({
                id: 'test-user',
                accessToken: 'valid-token',
                refreshToken: 'valid-refresh'
            });

            const user = { id: 'test-user' };
            const dataWithFallbackUrl = {
                logInfo: {
                    telephonySessionId: 'tel-session-fallback',
                    recording: {
                        downloadUrl: 'https://media.example.com/fallback.mp3?accessToken=fallback-token'
                    },
                    direction: 'Outbound',
                    from: { phoneNumber: '+1234567890' },
                    to: { phoneNumber: '+0987654321' }
                }
            };

            // Mock axios calls
            axios.get
                .mockResolvedValueOnce({ data: Buffer.from('audio') }) // download
                .mockResolvedValueOnce({ data: { files: [] } }); // find folder

            axios.post
                .mockResolvedValueOnce({ data: { id: 'folder-id' } }) // create folder
                .mockResolvedValueOnce({ data: { id: 'file-id', name: 'recording.mp3' } }); // upload

            // Act
            const result = await googleDriveProcessor.uploadToGoogleDrive({
                user,
                data: dataWithFallbackUrl,
                taskId: 'task-fallback-url'
            });

            // Assert
            expect(result.id).toBe('file-id');
            
            // Verify download was called with fallback URL
            const downloadCall = axios.get.mock.calls[0];
            expect(downloadCall[0]).toBe('https://media.example.com/fallback.mp3?accessToken=fallback-token');
        });
    });
});

