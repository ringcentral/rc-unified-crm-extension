const axios = require('axios');
const moment = require('moment');
const url = require('url');
const { parsePhoneNumber } = require('awesome-phonenumber');

function getAuthType() {
    return 'oauth';
}

function getOauthInfo() {
    return {
        clientId: process.env.PIPEDRIVE_CLIENT_ID,
        clientSecret: process.env.PIPEDRIVE_CLIENT_SECRET,
        accessTokenUri: process.env.PIPEDRIVE_ACCESS_TOKEN_URI,
        redirectUri: process.env.PIPEDRIVE_REDIRECT_URI
    }
}

async function getUserInfo({ authHeader, hostname }) {
    const userInfoResponse = await axios.get('https://api.pipedrive.com/v1/users/me', {
        headers: {
            'Authorization': authHeader
        }
    });
    const id = userInfoResponse.data.data.id.toString();
    const name = userInfoResponse.data.data.name;
    const timezoneName = userInfoResponse.data.data.timezone_name;
    const timezoneOffset = userInfoResponse.data.data.timezone_offset;
    return {
        id,
        name,
        timezoneName,
        timezoneOffset,
        platformAdditionalInfo: {
            companyId: userInfoResponse.data.data.company_id,
            companyName: userInfoResponse.data.data.company_name,
            companyDomain: userInfoResponse.data.data.company_domain,
        },
        overridingHostname: hostname == 'temp' ? `${userInfoResponse.data.data.company_domain}.pipedrive.com` : null
    };
}

async function unAuthorize({ user }) {
    const revokeUrl = 'https://oauth.pipedrive.com/oauth/revoke';
    const basicAuthHeader = Buffer.from(`${process.env.PIPEDRIVE_CLIENT_ID}:${process.env.PIPEDRIVE_CLIENT_SECRET}`).toString('base64');
    const refreshTokenParams = new url.URLSearchParams({
        token: user.refreshToken
    });
    const refreshTokenRevokeRes = await axios.post(
        revokeUrl,
        refreshTokenParams,
        {
            headers: { 'Authorization': `Basic ${basicAuthHeader}` }
        });
    const accessTokenParams = new url.URLSearchParams({
        token: user.accessToken
    });
    const accessTokenRevokeRes = await axios.post(
        revokeUrl,
        accessTokenParams,
        {
            headers: { 'Authorization': `Basic ${basicAuthHeader}` }
        });
    await user.destroy();
}

async function getContact({ user, authHeader, phoneNumber, overridingFormat }) {
    phoneNumber = phoneNumber.replace(' ', '+')
    // without + is an extension, we don't want to search for that
    if (!phoneNumber.includes('+')) {
        return null;
    }
    const phoneNumberObj = parsePhoneNumber(phoneNumber);
    let phoneNumberWithoutCountryCode = phoneNumber;
    if (phoneNumberObj.valid) {
        phoneNumberWithoutCountryCode = phoneNumberObj.number.significant;
    }
    const personInfo = await axios.get(
        `https://${user.hostname}/v1/persons/search?term=${phoneNumberWithoutCountryCode}&fields=phone`,
        {
            headers: { 'Authorization': authHeader }
        });
    const matchedContacts = [];
    if (personInfo.data.data.items.length === 0) {
        return matchedContacts;
    }
    else {
        for (const person of personInfo.data.data.items) {
            const dealsResponse = await axios.get(
                `https://${user.hostname}/v1/persons/${person.item.id}/deals?status=open`,
                {
                    headers: { 'Authorization': authHeader }
                });
            const relatedDeals = dealsResponse.data.data ?
                dealsResponse.data.data.map(d => { return { const: d.id, title: d.title } })
                : null;
            matchedContacts.push(formatContact(person.item, relatedDeals));
        }
    }
    return matchedContacts;
}

function formatContact(rawContactInfo, relatedDeals) {
    return {
        id: rawContactInfo.id,
        name: rawContactInfo.name,
        phone: rawContactInfo.phones[0],
        organization: rawContactInfo.organization?.name ?? '',
        additionalInfo: relatedDeals ? { deals: relatedDeals } : null

    }
}

async function createContact({ user, authHeader, phoneNumber, newContactName }) {
    const postBody = {
        name: newContactName,
        phone: phoneNumber
    }
    const createContactRes = await axios.post(
        `https://${user.hostname}/v1/persons`,
        postBody,
        {
            headers: { 'Authorization': authHeader }
        });
    return {
        id: createContactRes.data.data.id,
        name: createContactRes.data.data.name
    }
}

async function addCallLog({ user, contactInfo, authHeader, callLog, note, additionalSubmission, timezoneOffset, contactNumber }) {
    const dealId = additionalSubmission ? additionalSubmission.deals : '';
    const personResponse = await axios.get(`https://${user.hostname}/v1/persons/${contactInfo.id}`, { headers: { 'Authorization': authHeader } });
    const orgId = personResponse.data.data.org_id?.value ?? '';
    const timeUtc = moment(callLog.startTime).utcOffset(0).format('HH:mm')
    const dateUtc = moment(callLog.startTime).utcOffset(0).format('YYYY-MM-DD');
    const postBody = {
        user_id: user.id,
        subject: callLog.customSubject ?? `${callLog.direction} Call ${callLog.direction === 'Outbound' ? 'to' : 'from'} ${contactInfo.name}`,
        duration: callLog.duration,    // secs
        person_id: contactInfo.id,
        org_id: orgId,
        deal_id: dealId,
        note: `<p>[Phone Number] ${contactNumber}</p><p>[Time] ${moment(callLog.startTime).utcOffset(timezoneOffset).format('YYYY-MM-DD hh:mm:ss A')}</p><p>[Duration] ${callLog.duration} seconds</p><p>[Call result] ${callLog.result}</p><p>[Note] ${note}</p>${callLog.recording ? `<p>[Call recording link] <a target="_blank" href=${callLog.recording.link}>open</a></p>` : ''}<p><span style="font-size:9px">[Created via] <em><a href="https://www.pipedrive.com/en/marketplace/app/ring-central-crm-extension/5d4736e322561f57">RingCentral CRM Extension</a></span></em></p>`,
        done: true,
        due_date: dateUtc,
        due_time: timeUtc
    }
    const addLogRes = await axios.post(
        `https://${user.hostname}/v1/activities`,
        postBody,
        {
            headers: { 'Authorization': authHeader }
        });
    return addLogRes.data.data.id;
}

async function updateCallLog({ user, existingCallLog, authHeader, recordingLink, subject, note }) {
    const existingPipedriveLogId = existingCallLog.thirdPartyLogId;
    const getLogRes = await axios.get(
        `https://${user.hostname}/v1/activities/${existingPipedriveLogId}`,
        {
            headers: { 'Authorization': authHeader }
        });
    let putBody = {};
    let logBody = getLogRes.data.data.note;
    // case: update recording
    if (!!recordingLink) {
        if (logBody.includes('<p><span>[Created via]')) {
            logBody = logBody.replace('<p><span>[Created via]', `<p>[Call recording link] <a target="_blank" href=${recordingLink}>open</a></p><p><span>[Created via]`);
        }
        else {
            logBody += `<p>[Call recording link] <a target="_blank" href=${recordingLink}>open</a></p>`;
        }
        putBody = {
            note: logBody
        }
    }
    // case: normal update
    else {
        const originalNote = logBody.split('</p><p>[Note] ')[1].split('</p>')[0];
        logBody = logBody.replace(`</p><p>[Note] ${originalNote}</p>`, `</p><p>[Note] ${note}</p>`);
        putBody = {
            note: logBody,
            subject: subject ?? existingCallLog.subject,
        }
    }
    const putLogRes = await axios.put(
        `https://${user.hostname}/v1/activities/${existingPipedriveLogId}`,
        putBody,
        {
            headers: { 'Authorization': authHeader }
        });
}

async function addMessageLog({ user, contactInfo, authHeader, message, additionalSubmission, recordingLink, timezoneOffset, contactNumber }) {
    const userInfoResponse = await axios.get('https://api.pipedrive.com/v1/users/me', {
        headers: {
            'Authorization': authHeader
        }
    });
    const userName = userInfoResponse.data.data.name;
    const dealId = additionalSubmission ? additionalSubmission.deals : '';
    const orgId = contactInfo.organization ? contactInfo.organization.id : '';
    const timeUtc = moment(message.creationTime).utcOffset(0).format('HH:mm')
    const dateUtc = moment(message.creationTime).utcOffset(0).format('YYYY-MM-DD');
    const activityTypesResponse = await axios.get(`https://${user.hostname}/v1/activityTypes`, { headers: { 'Authorization': authHeader } });
    const hasSMSType = activityTypesResponse.data.data.some(t => t.name === 'SMS' && t.active_flag);
    const subject = `SMS conversation with ${contactInfo.name} - ${moment(message.creationTime).format('YY/MM/DD')}`;
    const note =
        `<br><b>${subject}</b><br>` +
        '<b>Conversation summary</b><br>' +
        `${moment(message.creationTime).format('dddd, MMMM DD, YYYY')}<br>` +
        'Participants<br>' +
        `<ul><li><b>${userName}</b><br></li>` +
        `<li><b>${contactInfo.name}</b></li></ul><br>` +
        'Conversation(1 messages)<br>' +
        'BEGIN<br>' +
        '------------<br>' +
        '<ul>' +
        `<li>${message.direction === 'Inbound' ? `${contactInfo.name} (${contactNumber})` : userName} ${moment(message.creationTime).format('hh:mm A')}<br>` +
        `<b>${message.subject}</b></li>` +
        '</ul>' +
        '------------<br>' +
        'END<br><br>' +
        '--- Created via RingCentral CRM Extension';
    const postBody = {
        user_id: user.id,
        subject,
        person_id: contactInfo.id,
        org_id: orgId,
        deal_id: dealId,
        note,
        done: true,
        due_date: dateUtc,
        due_time: timeUtc,
        type: hasSMSType ? 'SMS' : 'Call'
    }
    const addLogRes = await axios.post(
        `https://${user.hostname}/v1/activities`,
        postBody,
        {
            headers: { 'Authorization': authHeader }
        });
    return addLogRes.data.data.id;
}

async function updateMessageLog({ user, contactInfo, existingMessageLog, message, authHeader, contactNumber }) {
    const existingLogId = existingMessageLog.thirdPartyLogId;
    const userInfoResponse = await axios.get('https://api.pipedrive.com/v1/users/me', {
        headers: {
            'Authorization': authHeader
        }
    });
    const userName = userInfoResponse.data.data.name;
    const getLogRes = await axios.get(
        `https://${user.hostname}/v1/activities/${existingLogId}`,
        {
            headers: { 'Authorization': authHeader }
        });
    let logBody = getLogRes.data.data.note;
    let putBody = {};
    const newMessageLog =
        `<li>${message.direction === 'Inbound' ? `${contactInfo.name} (${contactNumber})` : userName} ${moment(message.creationTime).format('hh:mm A')}<br>` +
        `<b>${message.subject}</b></li>`;
    logBody = logBody.replace('------------<br><ul>', `------------<br><ul>${newMessageLog}`);

    const regex = RegExp('<br>Conversation.(.*) messages.');
    const matchResult = regex.exec(logBody);
    logBody = logBody.replace(matchResult[0], `<br>Conversation(${parseInt(matchResult[1]) + 1} messages)`);

    putBody = {
        note: logBody
    }
    const putLogRes = await axios.put(
        `https://${user.hostname}/v1/activities/${existingLogId}`,
        putBody,
        {
            headers: { 'Authorization': authHeader }
        });
}


async function getCallLog({ user, callLogId, authHeader }) {
    const getLogRes = await axios.get(
        `https://${user.hostname}/v1/activities/${callLogId}`,
        {
            headers: { 'Authorization': authHeader }
        });
    const logBody = getLogRes.data.data.note;
    const note = logBody.split('<p>[Note] ')[1].split('</p>')[0];
    const relatedContact = getLogRes.data.related_objects?.person;
    let contactName = 'Unknown';
    if (!!relatedContact) {
        const contactKeys = Object.keys(relatedContact);
        contactName = relatedContact[contactKeys[0]].name;
    }
    return {
        subject: getLogRes.data.data.subject,
        note,
        contactName
    }
}

exports.getAuthType = getAuthType;
exports.getOauthInfo = getOauthInfo;
exports.getUserInfo = getUserInfo;
exports.addCallLog = addCallLog;
exports.updateCallLog = updateCallLog;
exports.addMessageLog = addMessageLog;
exports.updateMessageLog = updateMessageLog;
exports.getCallLog = getCallLog;
exports.getContact = getContact;
exports.createContact = createContact;
exports.unAuthorize = unAuthorize;