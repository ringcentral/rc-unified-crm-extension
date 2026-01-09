const axios = require('axios');

// Used to get user list for server-side call logging user mapping
async function getUserList({ user, authHeader }) {
    //--------------------------------------
    //--- TODO: Add CRM API call here ------
    //--------------------------------------
    // const userListResponse = await axios.get('https://api.crm.com/users', {
    //     headers: {
        //         'Authorization': authHeader
        //     }
        // });
        const mockUserListResponse = {
            data: [
                {
                    id: 'testUserId',
                    name: 'Test User',
                    email: 'test@example.com'
                },
                {
                    id: 'testUserId2',
                    name: 'Test User 2',
                    email: 'test2@example.com'
                },
                {
                    id: 'testUserId3',
                    name: 'Test User 3',
                    email: 'test3@example.com'
                }
            ]
        }
    return mockUserListResponse.data.map(user => ({
        id: user.id,
        name: user.name,
        email: user.email
    }));
}

module.exports = getUserList;