const axios = require('axios');
const nock = require('nock');
const { validateAdminRole, upsertAdminSettings, getAdminSettings, getServerLoggingSettings, updateServerLoggingSettings } = require('../src/core/admin');
const { AdminConfigModel } = require('../src/models/adminConfigModel');
const { encode } = require('../src/lib/encode');

jest.mock('axios');
jest.mock('../src/models/adminConfigModel');

describe('admin.js tests', () => {
    const originalSecretKey = process.env.APP_SERVER_SECRET_KEY;
    
    beforeEach(() => {
        jest.clearAllMocks();
        // Set up environment variable for encryption
        process.env.APP_SERVER_SECRET_KEY = 'test-secret-key-for-testing-purposes';
    });

    afterAll(() => {
        // Restore original environment variable
        if (originalSecretKey) {
            process.env.APP_SERVER_SECRET_KEY = originalSecretKey;
        } else {
            delete process.env.APP_SERVER_SECRET_KEY;
        }
    });

    describe('validateAdminRole', () => {
        test('should validate admin role successfully', async () => {
            const rcAccessToken = 'testAccessToken';
            const rcExtensionResponse = {
                data: {
                    permissions: {
                        admin: {
                            enabled: true
                        }
                    },
                    account: {
                        id: 'testAccountId'
                    },
                    id: 'testExtensionId'
                }
            };

            axios.get.mockResolvedValue(rcExtensionResponse);

            const result = await validateAdminRole({ rcAccessToken });

            expect(result.isValidated).toBe(true);
            expect(result.rcAccountId).toBe('testAccountId');
        });

        test('should validate admin role with dev pass list', async () => {
            process.env.ADMIN_EXTENSION_ID_DEV_PASS_LIST = 'testExtensionId';
            const rcAccessToken = 'testAccessToken';
            const rcExtensionResponse = {
                data: {
                    permissions: {
                        admin: {
                            enabled: false
                        }
                    },
                    account: {
                        id: 'testAccountId'
                    },
                    id: 'testExtensionId'
                }
            };

            axios.get.mockResolvedValue(rcExtensionResponse);

            const result = await validateAdminRole({ rcAccessToken });

            expect(result.isValidated).toBe(true);
            expect(result.rcAccountId).toBe('testAccountId');
        });
    });

    describe('upsertAdminSettings', () => {
        test('should update existing admin settings', async () => {
            const hashedRcAccountId = 'testHashedRcAccountId';
            const adminSettings = { setting1: 'value1' };
            const existingAdminConfig = {
                update: jest.fn()
            };

            AdminConfigModel.findByPk.mockResolvedValue(existingAdminConfig);

            await upsertAdminSettings({ hashedRcAccountId, adminSettings });

            expect(existingAdminConfig.update).toHaveBeenCalledWith(adminSettings);
        });

        test('should create new admin settings', async () => {
            const hashedRcAccountId = 'testHashedRcAccountId';
            const adminSettings = { setting1: 'value1' };

            AdminConfigModel.findByPk.mockResolvedValue(null);
            AdminConfigModel.create.mockResolvedValue({});

            await upsertAdminSettings({ hashedRcAccountId, adminSettings });

            expect(AdminConfigModel.create).toHaveBeenCalledWith({
                id: hashedRcAccountId,
                ...adminSettings
            });
        });
    });

    describe('getAdminSettings', () => {
        test('should get existing admin settings', async () => {
            const hashedRcAccountId = 'testHashedRcAccountId';
            const existingAdminConfig = { setting1: 'value1' };

            AdminConfigModel.findByPk.mockResolvedValue(existingAdminConfig);

            const result = await getAdminSettings({ hashedRcAccountId });

            expect(result).toBe(existingAdminConfig);
        });

        test('should return null if no admin settings found', async () => {
            const hashedRcAccountId = 'testHashedRcAccountId';

            AdminConfigModel.findByPk.mockResolvedValue(null);

            const result = await getAdminSettings({ hashedRcAccountId });

            expect(result).toBeNull();
        });
    });

    describe('getServerLoggingSettings', () => {
        beforeEach(() => {
            jest.clearAllMocks();
        });

        test('should get server logging settings successfully with bullhorn adapter', async () => {
            const testUsername = 'test_username';
            const testPassword = 'test_password';
            
            const user = {
                platform: 'bullhorn',
                platformAdditionalInfo: {
                    encodedApiUsername: encode(testUsername),
                    encodedApiPassword: encode(testPassword)
                }
            };

            const result = await getServerLoggingSettings({ user });

            expect(result).toEqual({
                apiUsername: testUsername,
                apiPassword: testPassword
            });
        });

        test('should handle missing encoded credentials in bullhorn adapter', async () => {
            const user = {
                platform: 'bullhorn',
                platformAdditionalInfo: {}
            };

            const result = await getServerLoggingSettings({ user });

            expect(result).toEqual({
                apiUsername: '',
                apiPassword: ''
            });
        });

        test('should return empty object when platform module does not have getServerLoggingSettings', async () => {
            const user = {
                platform: 'mock', // mock adapter doesn't have getServerLoggingSettings
                platformAdditionalInfo: {}
            };

            const result = await getServerLoggingSettings({ user });

            expect(result).toEqual({});
        });

        test('should handle platform module loading error', async () => {
            const user = {
                platform: 'nonExistentPlatform',
                platformAdditionalInfo: {}
            };

            // The getServerLoggingSettings function will try to require a non-existent module
            // This should throw an error when trying to load the module
            await expect(getServerLoggingSettings({ user })).rejects.toThrow();
        });
    });

    describe('updateServerLoggingSettings', () => {
        beforeEach(() => {
            jest.clearAllMocks();
        });

        test('should update server logging settings successfully with bullhorn adapter', async () => {
            const testUsername = 'new_username';
            const testPassword = 'new_password';
            
            const mockUser = {
                platform: 'bullhorn',
                platformAdditionalInfo: {
                    existingProperty: 'existingValue'
                },
                save: jest.fn().mockResolvedValue(true)
            };

            const additionalFieldValues = {
                apiUsername: testUsername,
                apiPassword: testPassword
            };

            const result = await updateServerLoggingSettings({ user: mockUser, additionalFieldValues });

            expect(mockUser.save).toHaveBeenCalled();
            expect(mockUser.platformAdditionalInfo.encodedApiUsername).toBeDefined();
            expect(mockUser.platformAdditionalInfo.encodedApiPassword).toBeDefined();
            expect(mockUser.platformAdditionalInfo.existingProperty).toBe('existingValue'); // Should preserve existing properties
            expect(result).toEqual({
                successful: true,
                returnMessage: {
                    messageType: 'success',
                    message: 'Server logging settings updated',
                    ttl: 5000
                }
            });
        });

        test('should handle empty credentials in bullhorn adapter', async () => {
            const mockUser = {
                platform: 'bullhorn',
                platformAdditionalInfo: {},
                save: jest.fn().mockResolvedValue(true)
            };

            const additionalFieldValues = {
                apiUsername: '',
                apiPassword: ''
            };

            const result = await updateServerLoggingSettings({ user: mockUser, additionalFieldValues });

            expect(mockUser.save).toHaveBeenCalled();
            expect(mockUser.platformAdditionalInfo.encodedApiUsername).toBe('');
            expect(mockUser.platformAdditionalInfo.encodedApiPassword).toBe('');
            expect(result.successful).toBe(true);
        });

        test('should handle partial credentials in bullhorn adapter', async () => {
            const mockUser = {
                platform: 'bullhorn',
                platformAdditionalInfo: {},
                save: jest.fn().mockResolvedValue(true)
            };

            const additionalFieldValues = {
                apiUsername: 'test_user',
                apiPassword: '' // empty password
            };

            const result = await updateServerLoggingSettings({ user: mockUser, additionalFieldValues });

            expect(mockUser.save).toHaveBeenCalled();
            expect(mockUser.platformAdditionalInfo.encodedApiUsername).toBeDefined();
            expect(mockUser.platformAdditionalInfo.encodedApiPassword).toBe('');
            expect(result.successful).toBe(true);
        });

        test('should return empty object when platform module does not have updateServerLoggingSettings', async () => {
            const mockUser = {
                platform: 'mock', // mock adapter doesn't have updateServerLoggingSettings
                platformAdditionalInfo: {},
                save: jest.fn().mockResolvedValue(true)
            };

            const additionalFieldValues = {
                apiUsername: 'test_user',
                apiPassword: 'test_password'
            };

            const result = await updateServerLoggingSettings({ user: mockUser, additionalFieldValues });

            expect(mockUser.save).not.toHaveBeenCalled();
            expect(result).toEqual({});
        });

        test('should handle platform module loading error', async () => {
            const mockUser = {
                platform: 'nonExistentPlatform',
                platformAdditionalInfo: {},
                save: jest.fn().mockResolvedValue(true)
            };

            const additionalFieldValues = {
                apiUsername: 'test_user',
                apiPassword: 'test_password'
            };

            // The updateServerLoggingSettings function will try to require a non-existent module
            // This should throw an error when trying to load the module
            await expect(updateServerLoggingSettings({ user: mockUser, additionalFieldValues })).rejects.toThrow();
        });

        test('should handle user.save() error', async () => {
            const mockUser = {
                platform: 'bullhorn',
                platformAdditionalInfo: {},
                save: jest.fn().mockRejectedValue(new Error('Database save failed'))
            };

            const additionalFieldValues = {
                apiUsername: 'test_user',
                apiPassword: 'test_password'
            };

            await expect(updateServerLoggingSettings({ user: mockUser, additionalFieldValues })).rejects.toThrow('Database save failed');
        });
    });
});