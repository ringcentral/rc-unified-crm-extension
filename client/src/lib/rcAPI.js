import axios from 'axios';
import config from '../config.json';

async function getUserInfo({extensionId, accountId}) {
    const userInfoHashResponse = await axios.get(
        `${config.serverUrl}/userInfoHash?extensionId=${extensionId}&accountId=${accountId}`
        );
    return userInfoHashResponse.data;
}

exports.getUserInfo = getUserInfo;