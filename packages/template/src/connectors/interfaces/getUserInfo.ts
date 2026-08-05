const axios = require('axios');

// For params, if OAuth, then accessToken, refreshToken, tokenExpiry; If apiKey, then apiKey
// ------------
// - additionalInfo: contains custom additional fields on auth page (eg. username and password for redtail)
// ------------
// Optional input params:
// - oauth: tokenUrl, apiUrl, hostname
// - apiKey: hostname
async function getUserInfo({ authHeader, additionalInfo }) {
    try {
        //--------------------------------------
        //--- TODO: Add CRM API call here ------
        //--------------------------------------
        // const userInfoResponse = await axios.get('https://api.crm.com/user/me', {
        //     headers: {
        //         'Authorization': authHeader
        //     }
        // });
        const mockUserInfoResponse = {
            data: {
                id: 'testUserId',
                name: 'Test User',
                time_zone: 'America/Los_Angeles',
                time_zone_offset: 0
            }
        }

        const id = mockUserInfoResponse.data.id;
        const name = mockUserInfoResponse.data.name;
        const timezoneName = mockUserInfoResponse.data.time_zone ?? ''; // Optional. Whether or not you want to log with regards to the user's timezone
        const timezoneOffset = mockUserInfoResponse.data.time_zone_offset ?? null; // Optional. Whether or not you want to log with regards to the user's timezone. It will need to be converted to a format that CRM platform uses,
        return {
            successful: true,
            platformUserInfo: {
                id,
                name,
                timezoneName,
                timezoneOffset,
                platformAdditionalInfo: {}  // this should save whatever extra info you want to save against the user
            },
            returnMessage: {
                messageType: 'success',
                message: 'Connected to TestCRM.',
                ttl: 1000
            }
        };
    }
    catch (e) {
        return {
            successful: false,
            returnMessage: {
                messageType: 'warning',
                message: 'Could not load user information',
                details: [
                    {
                        title: 'Details',
                        items: [
                            {
                                id: '1',
                                type: 'text',
                                text: `TestCRM was unable to fetch information for the currently logged in user. Please check your permissions in TestCRM and make sure you have permission to access and read user information.`
                            }
                        ]
                    }
                ],
                ttl: 3000
            }
        }
    }
    //---------------------------------------------------------------------------------------------------
    //--- CHECK: Open db.sqlite (might need to install certain viewer) to check if user info is saved ---
    //---------------------------------------------------------------------------------------------------
}

module.exports = getUserInfo;