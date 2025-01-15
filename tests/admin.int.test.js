const axios = require('axios');
const nock = require('nock');
const { validateAdminRole, upsertAdminSettings, getAdminSettings } = require('../src/core/admin');
const { AdminConfigModel } = require('../src/models/adminConfigModel');

jest.mock('axios');
jest.mock('../src/models/adminConfigModel');

describe('admin.js tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
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
});