import axios from 'axios';
import config from '../config.json';

async function getUserInfo(accessToken) {
    let userInfoResponse = await axios.get('https://platform.ringcentral.com/restapi/v1.0/account/~/extension/~', {
        headers: {
            'Authorization': `Bearer ${accessToken}`
        }
    });
    const userInfoHashResponse = await axios.get(
        `${config.serverUrl}/userInfoHash?extensionId=${userInfoResponse.data.id}&accountId=${userInfoResponse.data.account.id}`
        );
    userInfoResponse.data.account.id = userInfoHashResponse.data.accountId;
    userInfoResponse.data.id = userInfoHashResponse.data.extensionId;
    return userInfoResponse.data;
}

exports.getUserInfo = getUserInfo;