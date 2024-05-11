import axios from 'axios';

async function getUserInfo({serverUrl, extensionId, accountId}) {
    const userInfoHashResponse = await axios.get(
        `${serverUrl}/userInfoHash?extensionId=${extensionId}&accountId=${accountId}`
        );
    return userInfoHashResponse.data;
}

exports.getUserInfo = getUserInfo;