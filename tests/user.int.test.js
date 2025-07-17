const axios = require('axios');
const { AdminConfigModel } = require('@app-connect/core/models/adminConfigModel');
const { getHashValue } = require('@app-connect/core/lib/util');
const { getUserSettingsByAdmin, updateUserSettings } = require('@app-connect/core/handlers/user');

jest.mock('axios');
jest.mock('@app-connect/core/models/adminConfigModel');
jest.mock('@app-connect/core/lib/util');

describe('user.js tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('userSettingsByAdmin', () => {
        test('should return user settings by admin successfully', async () => {
            const rcAccessToken = 'testAccessToken';
            const rcExtensionResponse = {
                data: {
                    account: {
                        id: 'testAccountId'
                    }
                }
            };
            const hashedRcAccountId = 'testHashedRcAccountId';
            const adminConfig = {
                customAdapter: 'http://example.com/adapter',
                userSettings: { theme: 'dark' }
            };

            axios.get.mockResolvedValue(rcExtensionResponse);
            getHashValue.mockReturnValue(hashedRcAccountId);
            AdminConfigModel.findByPk.mockResolvedValue(adminConfig);

            const result = await getUserSettingsByAdmin({ rcAccessToken });

            expect(result).toEqual({
                customManifestUrl: 'http://example.com/adapter',
                userSettings: { theme: 'dark' }
            });
            expect(axios.get).toHaveBeenCalledWith(
                'https://platform.ringcentral.com/restapi/v1.0/account/~/extension/~',
                { headers: { Authorization: `Bearer ${rcAccessToken}` } }
            );
            expect(getHashValue).toHaveBeenCalledWith('testAccountId', process.env.HASH_KEY);
            expect(AdminConfigModel.findByPk).toHaveBeenCalledWith(hashedRcAccountId);
        });

        test('should return empty settings if admin config not found', async () => {
            const rcAccessToken = 'testAccessToken';
            const rcExtensionResponse = {
                data: {
                    account: {
                        id: 'testAccountId'
                    }
                }
            };
            const hashedRcAccountId = 'testHashedRcAccountId';

            axios.get.mockResolvedValue(rcExtensionResponse);
            getHashValue.mockReturnValue(hashedRcAccountId);
            AdminConfigModel.findByPk.mockResolvedValue(null);

            const result = await getUserSettingsByAdmin({ rcAccessToken });

            expect(result).toEqual({
                customManifestUrl: undefined,
                userSettings: undefined
            });
            expect(axios.get).toHaveBeenCalledWith(
                'https://platform.ringcentral.com/restapi/v1.0/account/~/extension/~',
                { headers: { Authorization: `Bearer ${rcAccessToken}` } }
            );
            expect(getHashValue).toHaveBeenCalledWith('testAccountId', process.env.HASH_KEY);
            expect(AdminConfigModel.findByPk).toHaveBeenCalledWith(hashedRcAccountId);
        });
    });
});