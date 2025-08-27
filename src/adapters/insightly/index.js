
/* eslint-disable no-param-reassign */
const axios = require('axios');
const moment = require('moment-timezone');
const { parsePhoneNumber } = require('awesome-phonenumber');

function getAuthType() {
    return 'apiKey';
}

function getBasicAuth({ apiKey }) {
    return Buffer.from(`${apiKey}:`).toString('base64');
}

async function getUserInfo({ authHeader, additionalInfo }) {
    try {
        additionalInfo.apiUrl = additionalInfo.apiUrl.split('/v')[0];
        const userInfoResponse = await axios.get(`${additionalInfo.apiUrl}/${process.env.INSIGHTLY_API_VERSION}/users/me`, {
            headers: {
                'Authorization': authHeader
            }
        });;
        // Insightly timezone = server location + non-standard tz area id (eg.'Central Standard Time')
        // We use UTC here for now
        const id = `${userInfoResponse.data.USER_ID.toString()}-insightly`;
        const name = `${userInfoResponse.data.FIRST_NAME} ${userInfoResponse.data.LAST_NAME}`;
        let timezoneOffset = 0;
        const timezoneName = userInfoResponse.data.TIMEZONE_ID;
        try {
            const ianaTimeZone = getIanaTimeZone({ timeZone: timezoneName });
            timezoneOffset = moment.tz(ianaTimeZone).utcOffset() / 60;
        } catch (error) {
            timezoneOffset = 0; // Default to UTC if conversion fails
        }
        return {
            successful: true,
            platformUserInfo: {
                id,
                name,
                timezoneName,
                timezoneOffset,
                platformAdditionalInfo: additionalInfo
            },
            returnMessage: {
                messageType: 'success',
                message: 'Connected to Insightly.',
                ttl: 1000
            }
        };
    }
    catch (e) {
        return {
            successful: false,
            returnMessage: {
                messageType: 'warning',
                message: 'Could not load user information Please check your API key and try again.',
                details: [
                    {
                        title: 'Details',
                        items: [
                            {
                                id: '1',
                                type: 'text',
                                text: `Insightly was unable to fetch information for the currently logged in user. Please check your permissions in Insightly and make sure you have permission to access and read user information.`
                            }
                        ]
                    }
                ],
                ttl: 3000
            }
        }
    }
}

async function unAuthorize({ user }) {
    // remove user credentials
    user.accessToken = '';
    user.refreshToken = '';
    await user.save();
    return {
        returnMessage: {
            messageType: 'success',
            message: 'Logged out of Insightly',
            ttl: 1000
        }
    }
}

async function findContact({ user, authHeader, phoneNumber, overridingFormat, isExtension }) {
    if (isExtension === 'true') {
        return {
            successful: false,
            matchedContactInfo: []
        }
    }
    const numberToQueryArray = [];
    if (overridingFormat === '') {
        const phoneNumberObj = parsePhoneNumber(phoneNumber.replace(' ', '+'));
        if (phoneNumberObj.valid) {
            numberToQueryArray.push(phoneNumberObj.number.significant);
        }
    }
    else {
        const formats = overridingFormat.split(',');
        for (var format of formats) {
            const phoneNumberObj = parsePhoneNumber(phoneNumber.replace(' ', '+'));
            if (phoneNumberObj.valid) {
                const phoneNumberWithoutCountryCode = phoneNumberObj.number.significant;
                let formattedNumber = format.startsWith(' ') ? format.replace(' ', '') : format;
                for (const numberBit of phoneNumberWithoutCountryCode) {
                    formattedNumber = formattedNumber.replace(/[*#]/, numberBit);
                }
                numberToQueryArray.push(formattedNumber);
            }
        }
    }
    const rawContacts = [];
    for (const numberToQuery of numberToQueryArray) {
        // try Contact by PHONE
        const contactPhonePersonInfo = await axios.get(
            `${user.platformAdditionalInfo.apiUrl}/${process.env.INSIGHTLY_API_VERSION}/contacts/search?field_name=PHONE&field_value=${numberToQuery}&brief=false`,
            {
                headers: { 'Authorization': authHeader }
            });
        for (let rawContactInfo of contactPhonePersonInfo.data) {
            rawContactInfo.contactType = 'contactPhone';
            rawContacts.push(rawContactInfo);
        }
        // try Contact by PHONE_MOBILE
        const contactMobilePersonInfo = await axios.get(
            `${user.platformAdditionalInfo.apiUrl}/${process.env.INSIGHTLY_API_VERSION}/contacts/search?field_name=PHONE_MOBILE&field_value=${numberToQuery}&brief=false`,
            {
                headers: { 'Authorization': authHeader }
            });
        for (let rawContactInfo of contactMobilePersonInfo.data) {
            rawContactInfo.contactType = 'contactMobile';
            rawContacts.push(rawContactInfo);
        }
        const extraPhoneFieldNamesForContact = user.userSettings?.insightlyExtraPhoneFieldNameForContact?.value ? user.userSettings?.insightlyExtraPhoneFieldNameForContact?.value?.split(',') : [];
        // try Contact by extra phone fields
        for (const extraPhoneFieldName of extraPhoneFieldNamesForContact) {
            try {
                const contactExtraPhonePersonInfo = await axios.get(
                    `${user.platformAdditionalInfo.apiUrl}/${process.env.INSIGHTLY_API_VERSION}/contacts/search?field_name=${extraPhoneFieldName}&field_value=${numberToQuery}&brief=false`,
                    {
                        headers: { 'Authorization': authHeader }
                    });
                for (let rawContactInfo of contactExtraPhonePersonInfo.data) {
                    rawContactInfo.contactType = 'contactExtraPhone';
                    rawContactInfo.extraPhoneFieldName = extraPhoneFieldName;
                    rawContactInfo.extraPhoneFieldNameValue = rawContactInfo.CUSTOMFIELDS.find(f => f.FIELD_NAME === extraPhoneFieldName)?.FIELD_VALUE;
                    rawContacts.push(rawContactInfo);
                }
            }
            catch (e) {
                console.log('Insightly extra phone field not found');
            }
        }
        // try Lead by PHONE
        const leadPhonePersonInfo = await axios.get(
            `${user.platformAdditionalInfo.apiUrl}/${process.env.INSIGHTLY_API_VERSION}/leads/search?field_name=PHONE&field_value=${numberToQuery}&brief=false`,
            {
                headers: { 'Authorization': authHeader }
            });
        for (let rawContactInfo of leadPhonePersonInfo.data) {
            rawContactInfo.contactType = 'leadPhone';
            rawContacts.push(rawContactInfo);
        }
        // try Lead by PHONE_MOBILE
        const leadMobileInfo = await axios.get(
            `${user.platformAdditionalInfo.apiUrl}/${process.env.INSIGHTLY_API_VERSION}/leads/search?field_name=MOBILE&field_value=${numberToQuery}&brief=false`,
            {
                headers: { 'Authorization': authHeader }
            });
        for (let rawContactInfo of leadMobileInfo.data) {
            rawContactInfo.contactType = 'leadMobile';
            rawContacts.push(rawContactInfo);
        }
        // try Lead by extra phone fields
        const extraPhoneFieldNamesForLead = user.userSettings?.insightlyExtraPhoneFieldNameForLead?.value ? user.userSettings?.insightlyExtraPhoneFieldNameForLead?.value?.split(',') : [];
        for (const extraPhoneFieldName of extraPhoneFieldNamesForLead) {
            try {
                const leadExtraPhonePersonInfo = await axios.get(
                    `${user.platformAdditionalInfo.apiUrl}/${process.env.INSIGHTLY_API_VERSION}/leads/search?field_name=${extraPhoneFieldName}&field_value=${numberToQuery}&brief=false`,
                    {
                        headers: { 'Authorization': authHeader }
                    });
                for (let rawContactInfo of leadExtraPhonePersonInfo.data) {
                    rawContactInfo.contactType = 'leadExtraPhone';
                    rawContactInfo.extraPhoneFieldName = extraPhoneFieldName;
                    rawContactInfo.extraPhoneFieldNameValue = rawContactInfo.CUSTOMFIELDS.find(f => f.FIELD_NAME === extraPhoneFieldName)?.FIELD_VALUE;
                    rawContacts.push(rawContactInfo);
                }
            }
            catch (e) {
                console.log('Insightly extra phone field not found');
            }
        }
    }
    const matchedContactInfo = [];
    for (let singlePersonInfo of rawContacts) {
        singlePersonInfo.additionalInfo = {};
        for (const link of singlePersonInfo.LINKS) {
            switch (link.LINK_OBJECT_NAME) {
                case 'Organisation':
                    const orgRes = await axios.get(
                        `${user.platformAdditionalInfo.apiUrl}/${process.env.INSIGHTLY_API_VERSION}/organisations/${link.LINK_OBJECT_ID}`,
                        {
                            headers: { 'Authorization': authHeader }
                        });
                    if (!singlePersonInfo.additionalInfo.organisation) {
                        singlePersonInfo.additionalInfo.organisation = [];
                    }
                    singlePersonInfo.additionalInfo.organisation.push({
                        title: orgRes.data.ORGANISATION_NAME,
                        const: orgRes.data.ORGANISATION_ID
                    });
                    break;
                case 'Opportunity':
                    const opportunityRes = await axios.get(
                        `${user.platformAdditionalInfo.apiUrl}/${process.env.INSIGHTLY_API_VERSION}/opportunities/${link.LINK_OBJECT_ID}`,
                        {
                            headers: { 'Authorization': authHeader }
                        });
                    if (!singlePersonInfo.additionalInfo.opportunity) {
                        singlePersonInfo.additionalInfo.opportunity = [];
                    }
                    singlePersonInfo.additionalInfo.opportunity.push({
                        title: opportunityRes.data.OPPORTUNITY_NAME,
                        const: opportunityRes.data.OPPORTUNITY_ID
                    });
                    break;
                case 'Project':
                    const projectRes = await axios.get(
                        `${user.platformAdditionalInfo.apiUrl}/${process.env.INSIGHTLY_API_VERSION}/projects/${link.LINK_OBJECT_ID}`,
                        {
                            headers: { 'Authorization': authHeader }
                        });
                    if (!singlePersonInfo.additionalInfo.project) {
                        singlePersonInfo.additionalInfo.project = [];
                    }
                    singlePersonInfo.additionalInfo.project.push({
                        title: projectRes.data.PROJECT_NAME,
                        const: projectRes.data.PROJECT_ID
                    });
                    break;
            }
        }
        matchedContactInfo.push(formatContact(singlePersonInfo));
    }
    matchedContactInfo.push({
        id: 'createNewContact',
        name: 'Create new contact...',
        additionalInfo: null,
        isNewContact: true
    });
    return {
        successful: true,
        matchedContactInfo
    };
}
async function findContactWithName({ user, authHeader, name }) {
    const { firstName, lastName } = splitName(name);
    const contactInfoByFirstName = await axios.get(
        `${user.platformAdditionalInfo.apiUrl}/${process.env.INSIGHTLY_API_VERSION}/contacts/search?field_name=FIRST_NAME&field_value=${firstName}&brief=false`,
        {
            headers: { 'Authorization': authHeader }
        });
    let contactInfoByLastName = [];
    if (lastName) {
        contactInfoByLastName = await axios.get(
            `${user.platformAdditionalInfo.apiUrl}/${process.env.INSIGHTLY_API_VERSION}/contacts/search?field_name=LAST_NAME&field_value=${lastName}&brief=false`,
            {
                headers: { 'Authorization': authHeader }
            });
    }
    const allContacts = [...contactInfoByFirstName.data, ...contactInfoByLastName?.data ?? []];
    const uniqueContacts = Array.from(
        new Map(allContacts.map(c => [c.CONTACT_ID, c])).values()
    );
    const filteredContacts = uniqueContacts.filter(c =>
        `${c.FIRST_NAME} ${c.LAST_NAME}`.toLowerCase().includes(name.toLowerCase())
    );
    const rawContacts = [];
    for (let rawContactInfo of filteredContacts) {
        rawContactInfo.contactType = 'contactPhone';
        rawContacts.push(rawContactInfo);
    }

    const leadInforByFirstName = await axios.get(
        `${user.platformAdditionalInfo.apiUrl}/${process.env.INSIGHTLY_API_VERSION}/leads/search?field_name=FIRST_NAME&field_value=${name}&brief=false`,
        {
            headers: { 'Authorization': authHeader }
        });
    let leadInfoByLastName = [];
    if (lastName) {
        leadInfoByLastName = await axios.get(
            `${user.platformAdditionalInfo.apiUrl}/${process.env.INSIGHTLY_API_VERSION}/leads/search?field_name=LAST_NAME&field_value=${lastName}&brief=false`,
            {
                headers: { 'Authorization': authHeader }
            });
    }
    const allLeads = [...leadInforByFirstName.data, ...leadInfoByLastName?.data ?? []];
    const uniqueLeads = Array.from(
        new Map(allLeads.map(c => [c.LEAD_ID, c])).values()
    );
    const filteredLeads = uniqueLeads.filter(c =>
        `${c.FIRST_NAME} ${c.LAST_NAME}`.toLowerCase().includes(name.toLowerCase())
    );
    for (let rawLeadInfo of filteredLeads) {
        rawLeadInfo.contactType = 'leadPhone';
        rawContacts.push(rawLeadInfo);
    }
    const matchedContactInfo = [];
    for (let singlePersonInfo of rawContacts) {
        singlePersonInfo.additionalInfo = {};
        for (const link of singlePersonInfo.LINKS) {
            switch (link.LINK_OBJECT_NAME) {
                case 'Organisation':
                    const orgRes = await axios.get(
                        `${user.platformAdditionalInfo.apiUrl}/${process.env.INSIGHTLY_API_VERSION}/organisations/${link.LINK_OBJECT_ID}`,
                        {
                            headers: { 'Authorization': authHeader }
                        });
                    if (!singlePersonInfo.additionalInfo.organisation) {
                        singlePersonInfo.additionalInfo.organisation = [];
                    }
                    singlePersonInfo.additionalInfo.organisation.push({
                        title: orgRes.data.ORGANISATION_NAME,
                        const: orgRes.data.ORGANISATION_ID
                    });
                    break;
                case 'Opportunity':
                    const opportunityRes = await axios.get(
                        `${user.platformAdditionalInfo.apiUrl}/${process.env.INSIGHTLY_API_VERSION}/opportunities/${link.LINK_OBJECT_ID}`,
                        {
                            headers: { 'Authorization': authHeader }
                        });
                    if (!singlePersonInfo.additionalInfo.opportunity) {
                        singlePersonInfo.additionalInfo.opportunity = [];
                    }
                    singlePersonInfo.additionalInfo.opportunity.push({
                        title: opportunityRes.data.OPPORTUNITY_NAME,
                        const: opportunityRes.data.OPPORTUNITY_ID
                    });
                    break;
                case 'Project':
                    const projectRes = await axios.get(
                        `${user.platformAdditionalInfo.apiUrl}/${process.env.INSIGHTLY_API_VERSION}/projects/${link.LINK_OBJECT_ID}`,
                        {
                            headers: { 'Authorization': authHeader }
                        });
                    if (!singlePersonInfo.additionalInfo.project) {
                        singlePersonInfo.additionalInfo.project = [];
                    }
                    singlePersonInfo.additionalInfo.project.push({
                        title: projectRes.data.PROJECT_NAME,
                        const: projectRes.data.PROJECT_ID
                    });
                    break;
            }
        }
        matchedContactInfo.push(formatContact(singlePersonInfo));
    }
    return {
        successful: true,
        matchedContactInfo: matchedContactInfo
    };
}

function formatContact(rawContactInfo) {
    switch (rawContactInfo.contactType) {
        case 'contactPhone':
            return {
                id: rawContactInfo.CONTACT_ID,
                name: `${rawContactInfo.FIRST_NAME ?? ""} ${rawContactInfo.LAST_NAME ?? ""}`,
                phone: rawContactInfo.PHONE,
                title: rawContactInfo.TITLE,
                additionalInfo: rawContactInfo.additionalInfo,
                type: 'Contact'
            };
        case 'contactMobile':
            return {
                id: rawContactInfo.CONTACT_ID,
                name: `${rawContactInfo.FIRST_NAME ?? ""} ${rawContactInfo.LAST_NAME ?? ""}`,
                phone: rawContactInfo.PHONE_MOBILE,
                title: rawContactInfo.TITLE,
                additionalInfo: rawContactInfo.additionalInfo,
                type: 'Contact'
            };
        case 'contactExtraPhone':
            return {
                id: rawContactInfo.CONTACT_ID,
                name: `${rawContactInfo.FIRST_NAME ?? ""} ${rawContactInfo.LAST_NAME ?? ""}`,
                phone: rawContactInfo.extraPhoneFieldNameValue,
                title: rawContactInfo.TITLE,
                additionalInfo: rawContactInfo.additionalInfo,
                type: 'Contact'
            };
        case 'leadPhone':
            return {
                id: rawContactInfo.LEAD_ID,
                name: `${rawContactInfo.FIRST_NAME ?? ""} ${rawContactInfo.LAST_NAME ?? ""}`,
                phone: rawContactInfo.PHONE,
                title: rawContactInfo.TITLE,
                additionalInfo: rawContactInfo.additionalInfo,
                type: 'Lead'
            };
        case 'leadMobile':
            return {
                id: rawContactInfo.LEAD_ID,
                name: `${rawContactInfo.FIRST_NAME ?? ""} ${rawContactInfo.LAST_NAME ?? ""}`,
                phone: rawContactInfo.MOBILE,
                title: rawContactInfo.TITLE,
                additionalInfo: rawContactInfo.additionalInfo,
                type: 'Lead'
            };
        case 'leadExtraPhone':
            return {
                id: rawContactInfo.LEAD_ID,
                name: `${rawContactInfo.FIRST_NAME ?? ""} ${rawContactInfo.LAST_NAME ?? ""}`,
                phone: rawContactInfo.extraPhoneFieldNameValue,
                title: rawContactInfo.TITLE,
                additionalInfo: rawContactInfo.additionalInfo,
                type: 'Lead'
            };
    }
}

async function createContact({ user, authHeader, phoneNumber, newContactName, newContactType }) {
    if (newContactType === '') {
        return null;
    }
    const postBody = {
        PHONE: phoneNumber.replace(' ', '+'),
        FIRST_NAME: newContactName.split(' ')[0],
        LAST_NAME: newContactName.split(' ')[1] ?? 'Lead'
    }
    const personInfo = await axios.post(
        `${user.platformAdditionalInfo.apiUrl}/${process.env.INSIGHTLY_API_VERSION}/${newContactType}s`,
        postBody,
        {
            headers: { 'Authorization': authHeader }
        }
    );
    return {
        contactInfo: {
            id: newContactType === 'contact' ? personInfo.data.CONTACT_ID : personInfo.data.LEAD_ID,
            name: `${personInfo.data.FIRST_NAME} ${personInfo.data.LAST_NAME}`
        },
        returnMessage: {
            message: `Contact created.`,
            messageType: 'success',
            ttl: 2000
        }
    }
}

async function createCallLog({ user, contactInfo, authHeader, callLog, note, additionalSubmission, aiNote, transcript, composedLogDetails }) {
    let extraDataTracking = {
        withSmartNoteLog: !!aiNote && (user.userSettings?.addCallLogAiNote?.value ?? true),
        withTranscript: !!transcript && (user.userSettings?.addCallLogTranscript?.value ?? true)
    };
    const postBody = {
        TITLE: callLog.customSubject ?? `${callLog.direction} Call ${callLog.direction === 'Outbound' ? 'to' : 'from'} ${contactInfo.name}`,
        DETAILS: composedLogDetails,
        START_DATE_UTC: moment(callLog.startTime).utc(),
        END_DATE_UTC: moment(callLog.startTime).utc().add(callLog.duration, 'seconds')
    }
    const addLogRes = await axios.post(
        `${user.platformAdditionalInfo.apiUrl}/${process.env.INSIGHTLY_API_VERSION}/events`,
        postBody,
        {
            headers: { 'Authorization': authHeader }
        });
    // add linked contact to log
    if (contactInfo.type === 'contactPhone' || contactInfo.type === 'contactMobile' || contactInfo.type === 'Contact') {
        await axios.post(
            `${user.platformAdditionalInfo.apiUrl}/${process.env.INSIGHTLY_API_VERSION}/events/${addLogRes.data.EVENT_ID}/links`,
            {
                LINK_OBJECT_NAME: 'contact',
                LINK_OBJECT_ID: contactInfo.id
            },
            {
                headers: { 'Authorization': authHeader }
            });
        if (additionalSubmission != null) {
            // add org link
            if (additionalSubmission.organization != null) {
                await axios.post(
                    `${user.platformAdditionalInfo.apiUrl}/${process.env.INSIGHTLY_API_VERSION}/events/${addLogRes.data.EVENT_ID}/links`,
                    {
                        LINK_OBJECT_NAME: 'Organisation',
                        LINK_OBJECT_ID: additionalSubmission.organization
                    },
                    {
                        headers: { 'Authorization': authHeader }
                    });
            }
            // add opportunity link
            if (additionalSubmission.opportunity != null) {
                await axios.post(
                    `${user.platformAdditionalInfo.apiUrl}/${process.env.INSIGHTLY_API_VERSION}/events/${addLogRes.data.EVENT_ID}/links`,
                    {
                        LINK_OBJECT_NAME: 'Opportunity',
                        LINK_OBJECT_ID: additionalSubmission.opportunity
                    },
                    {
                        headers: { 'Authorization': authHeader }
                    });
            }
            // add project link
            if (additionalSubmission.project != null) {
                await axios.post(
                    `${user.platformAdditionalInfo.apiUrl}/${process.env.INSIGHTLY_API_VERSION}/events/${addLogRes.data.EVENT_ID}/links`,
                    {
                        LINK_OBJECT_NAME: 'Project',
                        LINK_OBJECT_ID: additionalSubmission.project
                    },
                    {
                        headers: { 'Authorization': authHeader }
                    });
            }
        }
    }
    else if (contactInfo.type === 'leadPhone' || contactInfo.type === 'leadMobile' || contactInfo.type === 'Lead') {
        await axios.post(
            `${user.platformAdditionalInfo.apiUrl}/${process.env.INSIGHTLY_API_VERSION}/events/${addLogRes.data.EVENT_ID}/links`,
            {
                LINK_OBJECT_NAME: 'lead',
                LINK_OBJECT_ID: contactInfo.id
            },
            {
                headers: { 'Authorization': authHeader }
            });
    }
    return {
        logId: addLogRes.data.EVENT_ID,
        returnMessage: {
            message: 'Call logged',
            messageType: 'success',
            ttl: 2000
        },
        extraDataTracking
    };
}

async function updateCallLog({ user, existingCallLog, authHeader, recordingLink, subject, note, startTime, duration, result, aiNote, transcript, composedLogDetails, existingCallLogDetails }) {
    const existingInsightlyLogId = existingCallLog.thirdPartyLogId;
    // Use passed existingCallLogDetails to avoid duplicate API call
    let getLogRes = null;
    if (existingCallLogDetails) {
        getLogRes = { data: existingCallLogDetails };
    } else {
        // Fallback to API call if details not provided
        getLogRes = await axios.get(
            `${user.platformAdditionalInfo.apiUrl}/${process.env.INSIGHTLY_API_VERSION}/events/${existingInsightlyLogId}`,
            {
                headers: { 'Authorization': authHeader }
            });
    }

    const putBody = {
        EVENT_ID: existingInsightlyLogId,
        DETAILS: composedLogDetails,
        TITLE: subject ? subject : (existingCallLogDetails?.subject || getLogRes.data.TITLE),
        START_DATE_UTC: moment(startTime).utc(),
        END_DATE_UTC: moment(startTime).utc().add(duration, 'seconds')
    }
    const putLogRes = await axios.put(
        `${user.platformAdditionalInfo.apiUrl}/${process.env.INSIGHTLY_API_VERSION}/events`,
        putBody,
        {
            headers: { 'Authorization': authHeader }
        });

    return {
        updatedNote: putBody.DETAILS,
        returnMessage: {
            message: 'Call log updated.',
            messageType: 'success',
            ttl: 2000
        }
    };
}

async function getCallLog({ user, callLogId, authHeader }) {
    const getLogRes = await axios.get(
        `${user.platformAdditionalInfo.apiUrl}/${process.env.INSIGHTLY_API_VERSION}/events/${callLogId}`,
        {
            headers: { 'Authorization': authHeader }
        });
    //const note = getLogRes.data.DETAILS.split('- Note: ')[1]?.split('\n')[0];
    const noteRegex = /- (?:Note|Agent notes): ([\s\S]*?)(?=\n- [A-Z][a-zA-Z\s/]*:|\n$|$)/;
    const note = getLogRes.data.DETAILS.match(noteRegex)?.[1]?.trim();
    const contactRes = await axios.get(
        `${user.platformAdditionalInfo.apiUrl}/${process.env.INSIGHTLY_API_VERSION}/${getLogRes.data.LINKS[0].LINK_OBJECT_NAME}s/${getLogRes.data.LINKS[0].LINK_OBJECT_ID}`,
        {
            headers: { 'Authorization': authHeader }
        }
    );
    const dispositions = {};
    for (const l of getLogRes.data.LINKS) {
        if (l.LINK_OBJECT_NAME === 'contact') {
            continue;
        }
        dispositions[l.LINK_OBJECT_NAME.toLowerCase()] = l.LINK_OBJECT_ID;
    }
    return {
        callLogInfo: {
            subject: getLogRes.data.TITLE,
            fullBody: getLogRes?.data?.DETAILS,
            fullLogResponse: getLogRes.data,
            note,
            contactName: `${contactRes.data.FIRST_NAME} ${contactRes.data.LAST_NAME}`,
            dispositions
        }
    }
}

async function upsertCallDisposition({ user, existingCallLog, authHeader, dispositions }) {
    if (!dispositions.organisation && !dispositions.opportunity && !dispositions.project) {
        return {
            logId: null
        };
    }
    const existingInsightlyLogId = existingCallLog.thirdPartyLogId;

    const getLogRes = await axios.get(
        `${user.platformAdditionalInfo.apiUrl}/${process.env.INSIGHTLY_API_VERSION}/events/${existingInsightlyLogId}`,
        {
            headers: { 'Authorization': authHeader }
        });
    // org: if different, DELETE link then CREATE
    const orgLink = getLogRes.data.LINKS.find(l => l.LINK_OBJECT_NAME === 'Organisation');
    if (dispositions.organisation) {
        if (orgLink && orgLink.LINK_OBJECT_ID !== dispositions.organisation) {
            await axios.delete(
                `${user.platformAdditionalInfo.apiUrl}/${process.env.INSIGHTLY_API_VERSION}/events/${existingInsightlyLogId}/links/${orgLink.LINK_ID}`,
                {
                    headers: { 'Authorization': authHeader }
                });
        }
        await axios.post(
            `${user.platformAdditionalInfo.apiUrl}/${process.env.INSIGHTLY_API_VERSION}/events/${existingInsightlyLogId}/links`,
            {
                LINK_OBJECT_NAME: 'Organisation',
                LINK_OBJECT_ID: dispositions.organisation
            },
            {
                headers: { 'Authorization': authHeader }
            });
    }

    // opportunity
    const opportunityLink = getLogRes.data.LINKS.find(l => l.LINK_OBJECT_NAME === 'Opportunity');
    if (dispositions.opportunity) {
        if (opportunityLink && opportunityLink.LINK_OBJECT_ID !== dispositions.opportunity) {
            await axios.delete(
                `${user.platformAdditionalInfo.apiUrl}/${process.env.INSIGHTLY_API_VERSION}/events/${existingInsightlyLogId}/links/${opportunityLink.LINK_ID}`,
                {
                    headers: { 'Authorization': authHeader }
                });
        }
        await axios.post(
            `${user.platformAdditionalInfo.apiUrl}/${process.env.INSIGHTLY_API_VERSION}/events/${existingInsightlyLogId}/links`,
            {
                LINK_OBJECT_NAME: 'Opportunity',
                LINK_OBJECT_ID: dispositions.opportunity
            },
            {
                headers: { 'Authorization': authHeader }
            });
    }

    // project
    const projectLink = getLogRes.data.LINKS.find(l => l.LINK_OBJECT_NAME === 'Project');
    if (dispositions.project) {
        if (projectLink && projectLink.LINK_OBJECT_ID !== dispositions.project) {
            await axios.delete(
                `${user.platformAdditionalInfo.apiUrl}/${process.env.INSIGHTLY_API_VERSION}/events/${existingInsightlyLogId}/links/${projectLink.LINK_ID}`,
                {
                    headers: { 'Authorization': authHeader }
                });
        }
        await axios.post(
            `${user.platformAdditionalInfo.apiUrl}/${process.env.INSIGHTLY_API_VERSION}/events/${existingInsightlyLogId}/links`,
            {
                LINK_OBJECT_NAME: 'Project',
                LINK_OBJECT_ID: dispositions.project
            },
            {
                headers: { 'Authorization': authHeader }
            });
    }

    return {
        logId: existingInsightlyLogId
    }
}

async function createMessageLog({ user, contactInfo, authHeader, message, additionalSubmission, recordingLink, faxDocLink }) {
    const userInfoResponse = await axios.get(`${user.platformAdditionalInfo.apiUrl}/${process.env.INSIGHTLY_API_VERSION}/users/me`, {
        headers: {
            'Authorization': authHeader
        }
    });;
    const userName = `${userInfoResponse.data.FIRST_NAME} ${userInfoResponse.data.LAST_NAME}`;
    const messageType = recordingLink ? 'Voicemail' : (faxDocLink ? 'Fax' : 'SMS');
    let details = '';
    let title = '';
    switch (messageType) {
        case 'SMS':
            title = `SMS conversation with ${contactInfo.name} - ${moment(message.creationTime).format('YY/MM/DD')}`;
            details =
                '\nConversation summary\n' +
                `${moment(message.creationTime).format('dddd, MMMM DD, YYYY')}\n` +
                'Participants\n' +
                `    ${userName}\n` +
                `    ${contactInfo.name}\n` +
                '\nConversation(1 messages)\n' +
                'BEGIN\n' +
                '------------\n' +
                `${message.direction === 'Inbound' ? `${contactInfo.name} (${contactInfo.phoneNumber})` : userName} ${moment(message.creationTime).format('hh:mm A')}\n` +
                `${message.subject}\n\n` +
                '------------\n' +
                'END\n\n' +
                '--- Created via RingCentral App Connect';
            break;
        case 'Voicemail':
            title = `Voicemail left by ${contactInfo.name} - ${moment(message.creationTime).format('YY/MM/DD')}`;
            details = `Voicemail recording link: ${recordingLink} \n\n--- Created via RingCentral App Connect`;
            break;
        case 'Fax':
            title = `Fax document sent from ${contactInfo.name} - ${moment(message.creationTime).format('YY/MM/DD')}`;
            details = `Fax document link: ${faxDocLink} \n\n--- Created via RingCentral App Connect`;
            break;
    }

    const postBody = {
        TITLE: title,
        DETAILS: details,
        START_DATE_UTC: moment(message.creationTime).utc(),
        END_DATE_UTC: moment(message.creationTime).utc()
    }
    const addLogRes = await axios.post(
        `${user.platformAdditionalInfo.apiUrl}/${process.env.INSIGHTLY_API_VERSION}/events`,
        postBody,
        {
            headers: { 'Authorization': authHeader }
        });
    // add linked contact to log
    if (contactInfo.type === 'contactPhone' || contactInfo.type === 'contactMobile' || contactInfo.type === 'Contact') {
        await axios.post(
            `${user.platformAdditionalInfo.apiUrl}/${process.env.INSIGHTLY_API_VERSION}/events/${addLogRes.data.EVENT_ID}/links`,
            {
                LINK_OBJECT_NAME: 'contact',
                LINK_OBJECT_ID: contactInfo.id
            },
            {
                headers: { 'Authorization': authHeader }
            });
    }
    else if (contactInfo.type === 'leadPhone' || contactInfo.type === 'leadMobile' || contactInfo.type === 'Lead') {
        await axios.post(
            `${user.platformAdditionalInfo.apiUrl}/${process.env.INSIGHTLY_API_VERSION}/events/${addLogRes.data.EVENT_ID}/links`,
            {
                LINK_OBJECT_NAME: 'lead',
                LINK_OBJECT_ID: contactInfo.id
            },
            {
                headers: { 'Authorization': authHeader }
            });
    }
    return {
        logId: addLogRes.data.EVENT_ID,
        returnMessage: {
            message: 'Message logged',
            messageType: 'success',
            ttl: 1000
        }
    };
}

async function updateMessageLog({ user, contactInfo, existingMessageLog, message, authHeader }) {
    const existingLogId = existingMessageLog.thirdPartyLogId;
    const getLogRes = await axios.get(
        `${user.platformAdditionalInfo.apiUrl}/${process.env.INSIGHTLY_API_VERSION}/events/${existingLogId}`,
        {
            headers: { 'Authorization': authHeader }
        });
    const userInfoResponse = await axios.get(`${user.platformAdditionalInfo.apiUrl}/${process.env.INSIGHTLY_API_VERSION}/users/me`, {
        headers: {
            'Authorization': authHeader
        }
    });;
    const userName = `${userInfoResponse.data.FIRST_NAME} ${userInfoResponse.data.LAST_NAME}`;
    let logBody = getLogRes.data.DETAILS;
    let putBody = {};
    const originalNote = logBody.split('BEGIN\n------------\n')[1];
    const endMarker = '------------\nEND';
    const newMessageLog =
        `${message.direction === 'Inbound' ? `${contactInfo.name} (${contactInfo.phoneNumber})` : userName} ${moment(message.creationTime).format('hh:mm A')}\n` +
        `${message.subject}\n`;
    logBody = logBody.replace(endMarker, `${newMessageLog}${endMarker}`);

    const regex = RegExp('Conversation.(.*) messages.');
    const matchResult = regex.exec(logBody);
    logBody = logBody.replace(matchResult[0], `Conversation(${parseInt(matchResult[1]) + 1} messages)`);

    putBody = {
        EVENT_ID: existingLogId,
        DETAILS: logBody,
        END_DATE_UTC: moment(message.creationTime).utc()
    }
    const putLogRes = await axios.put(
        `${user.platformAdditionalInfo.apiUrl}/${process.env.INSIGHTLY_API_VERSION}/events`,
        putBody,
        {
            headers: { 'Authorization': authHeader }
        });
}

function splitName(fullName) {
    const parts = fullName.trim().split(/\s+/);
    const firstName = parts[0];
    const lastName = parts.length > 1 ? parts.slice(1).join(' ') : '';
    return { firstName, lastName };
}

function getIanaTimeZone({ timeZone }) {
    // Map Windows timezone names to IANA timezone names
    const windowsToIANA = {
        'Dateline Standard Time': 'Etc/GMT+12',
        'UTC-11': 'Etc/GMT+11',
        'Hawaiian Standard Time': 'Pacific/Honolulu',
        'Alaskan Standard Time': 'America/Anchorage',
        'Pacific Standard Time': 'America/Los_Angeles',
        'Pacific Daylight Time': 'America/Los_Angeles',
        'Mountain Standard Time': 'America/Denver',
        'Mountain Daylight Time': 'America/Denver',
        'Central Standard Time': 'America/Chicago',
        'Central Daylight Time': 'America/Chicago',
        'Eastern Standard Time': 'America/New_York',
        'Eastern Daylight Time': 'America/New_York',
        'Atlantic Standard Time': 'America/Halifax',
        'GMT Standard Time': 'Europe/London',
        'Greenwich Standard Time': 'Atlantic/Reykjavik',
        'Central Europe Standard Time': 'Europe/Berlin',
        'Romance Standard Time': 'Europe/Paris',
        'W. Europe Standard Time': 'Europe/Berlin',
        'E. Europe Standard Time': 'Europe/Bucharest',
        'Egypt Standard Time': 'Africa/Cairo',
        'South Africa Standard Time': 'Africa/Johannesburg',
        'FLE Standard Time': 'Europe/Kiev',
        'Israel Standard Time': 'Asia/Jerusalem',
        'Arabic Standard Time': 'Asia/Baghdad',
        'Arab Standard Time': 'Asia/Riyadh',
        'Russian Standard Time': 'Europe/Moscow',
        'India Standard Time': 'Asia/Kolkata',
        'Nepal Standard Time': 'Asia/Kathmandu',
        'Bangladesh Standard Time': 'Asia/Dhaka',
        'Myanmar Standard Time': 'Asia/Yangon',
        'SE Asia Standard Time': 'Asia/Bangkok',
        'China Standard Time': 'Asia/Shanghai',
        'North Asia Standard Time': 'Asia/Krasnoyarsk',
        'Tokyo Standard Time': 'Asia/Tokyo',
        'Korea Standard Time': 'Asia/Seoul',
        'AUS Eastern Standard Time': 'Australia/Sydney',
        'E. Australia Standard Time': 'Australia/Brisbane',
        'Tasmania Standard Time': 'Australia/Hobart',
        'West Pacific Standard Time': 'Pacific/Port_Moresby',
        'New Zealand Standard Time': 'Pacific/Auckland',
        'UTC': 'Etc/UTC',
        'GMT': 'Etc/UTC'
    };
    // Convert Windows timezone name to IANA if needed
    const ianaTimeZone = windowsToIANA[timeZone] || timeZone;
    return ianaTimeZone;
}


exports.getAuthType = getAuthType;
exports.getBasicAuth = getBasicAuth;
exports.getUserInfo = getUserInfo;
exports.createCallLog = createCallLog;
exports.updateCallLog = updateCallLog;
exports.upsertCallDisposition = upsertCallDisposition;
exports.createMessageLog = createMessageLog;
exports.updateMessageLog = updateMessageLog;
exports.getCallLog = getCallLog;
exports.findContact = findContact;
exports.createContact = createContact;
exports.unAuthorize = unAuthorize;
exports.findContactWithName = findContactWithName;