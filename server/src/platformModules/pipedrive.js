const axios = require('axios');

const BASE_URL = 'https://ringcentral-sandbox.pipedrive.com';

function getOauthInfo() {
    return {
        clientId: process.env.PIPEDRIVE_CLIENT_ID,
        clientSecret: process.env.PIPEDRIVE_CLIENT_SECRET,
        accessTokenUri: process.env.PIPEDRIVE_ACCESS_TOKEN_URI,
        redirectUri: process.env.PIPEDRIVE_REDIRECT_URI
    }
}

async function getUserInfo({ accessToken }) {
    const userInfoResponse = await axios.get('https://api.pipedrive.com/v1/users/me', {
        headers: {
            'Authorization': `Bearer ${accessToken}`
        }
    });;
    return {
        id: userInfoResponse.data.data.id,
        name: userInfoResponse.data.data.name,
        companyId: userInfoResponse.data.data.company_id,
        companyName: userInfoResponse.data.data.company_name,
        companyDomain: userInfoResponse.data.data.company_domain,
    };
}

async function addCallLog({ userId, contactId, authHeader, callLog, note, additionalSubmission }) {
    const dealId = additionalSubmission ? additionalSubmission.dealId : '';
    const postBody = {
        user_id: userId,
        subject: `${callLog.direction} Call - ${callLog.from.name ?? callLog.fromName}(${callLog.from.phoneNumber}) to ${callLog.to.name ?? callLog.toName}(${callLog.to.phoneNumber})`,
        duration: callLog.duration,    // secs
        person_id: contactId,
        deal_id: dealId,
        note: `<p>[Call result] ${callLog.result}</p><p>[Note] ${note}</p>${callLog.recording ? `<p>[Call recording link] ${callLog.recording.link}</p>` : ''}<p> </p><p><em><span style="font-size:9px">--- Added by RingCentral Unified CRM Extension(<a href="https://github.com/ringcentral">https://github.com/ringcentral</a>)</span></em></p>`,
        done: true
    }
    const addLogRes = await axios.post(
        `${BASE_URL}/v1/activities`,
        postBody,
        {
            headers: { 'Authorization': authHeader }
        });
    return addLogRes.data.data.id;
}

async function addMessageLog({ userId, contactId, authHeader, message, additionalSubmission, recordingLink }) {
    const dealId = additionalSubmission ? additionalSubmission.dealId : '';
    const postBody = {
        user_id: userId,
        subject: `${message.direction} SMS - ${message.from.name ?? ''}(${message.from.phoneNumber}) to ${message.to[0].name ?? ''}(${message.to[0].phoneNumber})`,
        person_id: contactId,
        deal_id: dealId,
        note: `${!!message.subject ? `Message: ${message.subject}` : ''} ${!!recordingLink ? `\nRecording Link: ${recordingLink}` : ''}`,
        done: true
    }
    const addLogRes = await axios.post(
        `${BASE_URL}/v1/activities`,
        postBody,
        {
            headers: { 'Authorization': authHeader }
        });
    return addLogRes.data.data.id;
}

async function getContact({ accessToken, phoneNumber }) {
    const authHeader = `Bearer ${accessToken}`;
    const personInfo = await axios.get(
        `${BASE_URL}/v1/persons/search?term=${phoneNumber}&fields=phone&limit=1`,
        {
            headers: { 'Authorization': authHeader }
        });
    if (personInfo.data.data.items.length === 0) {
        return null;
    }
    else {
        let result = personInfo.data.data.items[0].item;
        const dealsResponse = await axios.get(
            `${BASE_URL}/v1/persons/${personInfo.data.data.items[0].item.id}/deals?status=open`,
            {
                headers: { 'Authorization': authHeader }
            });
        result['relatedDeals'] = dealsResponse.data.data ?
            dealsResponse.data.data.map(d => { return { id: d.id, title: d.title } })
            : null;
        return result;
    }
}

exports.getOauthInfo = getOauthInfo;
exports.getUserInfo = getUserInfo;
exports.addCallLog = addCallLog;
exports.addMessageLog = addMessageLog;
exports.getContact = getContact;