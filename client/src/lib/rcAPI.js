import axios from 'axios';

async function getUserInfo(accessToken) {
    const userInfoResponse = await axios.get('https://platform.ringcentral.com/restapi/v1.0/account/~/extension/~', {
        headers: {
            'Authorization': `Bearer ${accessToken}`
        }
    });

    return userInfoResponse.data;
}

exports.getUserInfo = getUserInfo;