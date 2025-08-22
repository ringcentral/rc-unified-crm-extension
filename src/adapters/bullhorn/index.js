/* eslint-disable no-param-reassign */
const axios = require('axios');
const moment = require('moment');
const { parsePhoneNumber } = require('awesome-phonenumber');
const dynamoose = require('dynamoose');
const jwt = require('@app-connect/core/lib/jwt');
const { encode, decoded } = require('@app-connect/core/lib/encode');
const { UserModel } = require('@app-connect/core/models/userModel');
const { Lock } = require('@app-connect/core/models/dynamo/lockSchema');

function getAuthType() {
    return 'oauth';
}

async function authValidation({ user }) {
    let pingResponse;
    try {
        pingResponse = await axios.get(
            `${user.platformAdditionalInfo.restUrl}ping`,
            {
                headers: {
                    BhRestToken: user.platformAdditionalInfo.bhRestToken
                }
            });
        if (new Date(pingResponse.data.sessionExpires) < new Date()) {
            user = await refreshSessionToken(user);
        }
        return {
            successful: true,
            status: 200
        }
    }
    catch (e) {
        if (isAuthError(e.response.status)) {
            user = await refreshSessionToken(user);
            try {
                pingResponse = await axios.get(`${user.platformAdditionalInfo.restUrl}ping`,
                    {
                        headers: {
                            BhRestToken: user.platformAdditionalInfo.bhRestToken
                        }
                    });
                return {
                    successful: true,
                    status: 200
                }
            }
            catch (e) {
                return {
                    successful: false,
                    returnMessage: {
                        messageType: 'warning',
                        message: 'It seems like your Bullhorn session has expired. Please re-connect.',
                        ttl: 3000
                    },
                    status: e.response.status
                }
            }
        }
        return {
            successful: false,
            returnMessage: {
                messageType: 'warning',
                message: 'It seems like your Bullhorn session has expired. Please re-connect.',
                ttl: 3000
            },
            status: e.response.status
        }
    }
}

async function getOauthInfo({ tokenUrl }) {
    return {
        clientId: process.env.BULLHORN_CLIENT_ID,
        clientSecret: process.env.BULLHORN_CLIENT_SECRET,
        accessTokenUri: tokenUrl,
        redirectUri: process.env.BULLHORN_REDIRECT_URI
    }
}

async function bullhornPasswordAuthorize(user, oauthApp, serverLoggingSettings) {
    // use password to get code
    console.log('authorize bullhorn by password')
    const authUrl = user.platformAdditionalInfo.tokenUrl.replace('/token', '/authorize');
    const codeResponse = await axios.get(authUrl, {
        params: {
            client_id: process.env.BULLHORN_CLIENT_ID,
            username: serverLoggingSettings.apiUsername,
            password: serverLoggingSettings.apiPassword,
            response_type: 'code',
            action: 'Login',
            redirect_uri: process.env.BULLHORN_REDIRECT_URI,
        },
        maxRedirects: 0,
        validateStatus: status => status === 302,
    });
    const redirectLocation = codeResponse.headers['location'];
    if (!redirectLocation) {
        throw new Error('Authorize failure, missing location');
    }
    const codeUrl = new URL(redirectLocation);
    const code = codeUrl.searchParams.get('code');
    if (!code) {
        throw new Error('Authorize failure, missing code');
    }
    const overridingOAuthOption = {
        headers: {
            Authorization: ''
        },
        query: {
            grant_type: 'authorization_code',
            code,
            client_id: process.env.BULLHORN_CLIENT_ID,
            client_secret: process.env.BULLHORN_CLIENT_SECRET,
            redirect_uri: process.env.BULLHORN_REDIRECT_URI,
        }
    };
    const { accessToken, refreshToken, expires } = await oauthApp.code.getToken(redirectLocation, overridingOAuthOption);
    console.log('authorize bullhorn user by password successfully.')
    return {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: expires,
    };
}

async function bullhornTokenRefresh(user, dateNow, tokenLockTimeout, oauthApp) {
    let newLock;
    try {
        // Try to atomically create lock only if it doesn't exist
        try {
            newLock = await Lock.create(
                {
                    userId: user.id,
                    ttl: dateNow.unix() + 30
                },
                {
                    overwrite: false
                }
            );
        } catch (e) {
            // If creation failed due to condition, a lock exists
            if (e.name === 'ConditionalCheckFailedException' || e.__type === 'com.amazonaws.dynamodb.v20120810#ConditionalCheckFailedException') {
                let lock = await Lock.get({ userId: user.id });
                if (!!lock?.ttl && moment(lock.ttl).unix() < dateNow.unix()) {
                    // Try to delete expired lock and create a new one atomically
                    try {
                        console.log('Bullhorn lock expired.')
                        await lock.delete();
                        newLock = await Lock.create(
                            {
                                userId: user.id,
                                ttl: dateNow.unix() + 30
                            },
                            {
                                overwrite: false
                            }
                        );
                    } catch (e2) {
                        if (e2.name === 'ConditionalCheckFailedException' || e2.__type === 'com.amazonaws.dynamodb.v20120810#ConditionalCheckFailedException') {
                            // Another process created a lock between our delete and create
                            lock = await Lock.get({ userId: user.id });
                        } else {
                            throw e2;
                        }
                    }
                }

                if (lock && !newLock) {
                    let processTime = 0;
                    let delay = 500; // Start with 500ms
                    const maxDelay = 8000; // Cap at 8 seconds
                    while (!!lock && processTime < tokenLockTimeout) {
                        await new Promise(resolve => setTimeout(resolve, delay));
                        processTime += delay / 1000; // Convert to seconds for comparison
                        delay = Math.min(delay * 2, maxDelay); // Exponential backoff with cap
                        lock = await Lock.get({ userId: user.id });
                    }
                    // Timeout -> let users try another time
                    if (processTime >= tokenLockTimeout) {
                        throw new Error('Bullhorn Token lock timeout');
                    }
                    user = await UserModel.findByPk(user.id);
                    console.log('Bullhron locked. bypass')
                    return user;
                }
            } else {
                throw e;
            }
        }
        const startRefreshTime = moment();
        console.log('Bullhorn token refreshing...')
        let authData;
        try {
            const refreshTokenResponse = await axios.post(`${user.platformAdditionalInfo.tokenUrl}?grant_type=refresh_token&refresh_token=${user.refreshToken}&client_id=${process.env.BULLHORN_CLIENT_ID}&client_secret=${process.env.BULLHORN_CLIENT_SECRET}`);
            authData = refreshTokenResponse.data;
        } catch (e) {
            const serverLoggingSettings = await getServerLoggingSettings({ user });
            if (serverLoggingSettings.apiUsername && serverLoggingSettings.apiPassword) {
                authData = await bullhornPasswordAuthorize(user, oauthApp, serverLoggingSettings);
            } else {
                throw e;
            }
        }
        const { access_token: accessToken, refresh_token: refreshToken, expires_in: expires } = authData;
        user.accessToken = accessToken;
        user.refreshToken = refreshToken;
        const userLoginResponse = await axios.post(`${user.platformAdditionalInfo.loginUrl}/login?version=2.0&access_token=${user.accessToken}`);
        const { BhRestToken, restUrl } = userLoginResponse.data;
        let updatedPlatformAdditionalInfo = user.platformAdditionalInfo;
        updatedPlatformAdditionalInfo.bhRestToken = BhRestToken;
        updatedPlatformAdditionalInfo.restUrl = restUrl;
        // Not sure why, assigning platformAdditionalInfo first then give it another value so that it can be saved to db
        user.platformAdditionalInfo = {};
        user.platformAdditionalInfo = updatedPlatformAdditionalInfo;
        const date = new Date();
        user.tokenExpiry = date.setSeconds(date.getSeconds() + expires);
        console.log('Bullhorn token refreshing finished')
        if (newLock) {
            const deletionStartTime = moment();
            await newLock.delete();
            const deletionEndTime = moment();
            console.log(`Bullhorn lock deleted in ${deletionEndTime.diff(deletionStartTime)}ms`)
        }
        const endRefreshTime = moment();
        console.log(`Bullhorn token refreshing finished in ${endRefreshTime.diff(startRefreshTime)}ms`)
    }
    catch (e) {
        if (newLock) {
            await newLock.delete();
        }
        // do not log error message, it will expose password
        console.error('Bullhorn token refreshing failed');
    }
    return user;
}

async function checkAndRefreshAccessToken(oauthApp, user, tokenLockTimeout = 20) {
    if (!user || !user.accessToken || !user.refreshToken) {
        return user;
    }
    const dateNow = moment();
    const expiryBuffer = 1000 * 60 * 2; // 2 minutes => 120000ms
    try {
        const pingResponse = await axios.get(`${user.platformAdditionalInfo.restUrl}/ping`, {
            headers: {
                'BhRestToken': user.platformAdditionalInfo.bhRestToken,
            },
        });
        // Session expired
        if (moment(pingResponse.data.sessionExpires - expiryBuffer).isBefore(dateNow)) {
            user = await bullhornTokenRefresh(user, dateNow, tokenLockTimeout, oauthApp);
        }
        // Session not expired
        else {
            return user;
        }
    }
    catch (e) {
        // Session expired
        user = await bullhornTokenRefresh(user, dateNow, tokenLockTimeout, oauthApp);
    }
    await user.save();
    return user;
}

async function getUserInfo({ authHeader, tokenUrl, apiUrl, username }) {
    try {
        const userLoginResponse = await axios.post(`${apiUrl}/login?version=2.0&access_token=${authHeader.split('Bearer ')[1]}`);
        const { BhRestToken: bhRestToken, restUrl } = userLoginResponse.data;
        const userInfoResponse = await axios.get(`${restUrl}query/CorporateUser?fields=id,name,timeZoneOffsetEST,masterUserID&BhRestToken=${bhRestToken}&where=username='${username}'`);
        const userData = userInfoResponse.data.data[0];
        const id = `${userData.masterUserID.toString()}-bullhorn`;
        const name = userData.name;
        // this 5 * 60 is from that Bullhorn uses EST timezone as its reference...
        const timezoneOffset = userData.timeZoneOffsetEST - 5 * 60;
        const timezoneName = '';
        const platformAdditionalInfo = {
            id: userData.id,
            tokenUrl,
            restUrl,
            loginUrl: apiUrl,
            bhRestToken
        }
        return {
            successful: true,
            platformUserInfo: {
                id,
                name,
                timezoneName,
                timezoneOffset,
                platformAdditionalInfo
            },
            returnMessage: {
                messageType: 'success',
                message: 'Connected to Bullhorn.',
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
                                text: `Bullhorn was unable to fetch information for the currently logged in user. Please check your permissions in Bullhorn and make sure you have permission to access and read user information.`
                            }
                        ]
                    }
                ],
                ttl: 5000
            }
        }
    }
}

function getOverridingOAuthOption({ code }) {
    return {
        query: {
            grant_type: 'authorization_code',
            code,
            client_id: process.env.BULLHORN_CLIENT_ID,
            client_secret: process.env.BULLHORN_CLIENT_SECRET,
            redirect_uri: process.env.BULLHORN_REDIRECT_URI,
        },
        headers: {
            Authorization: ''
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
            message: 'Logged out of Bullhorn',
            ttl: 1000
        }
    }
}

async function getServerLoggingSettings({ user }) {
    const username = user.platformAdditionalInfo.encodedApiUsername ? decoded(user.platformAdditionalInfo.encodedApiUsername) : '';
    const password = user.platformAdditionalInfo.encodedApiPassword ? decoded(user.platformAdditionalInfo.encodedApiPassword) : '';
    return {
        apiUsername: username,
        apiPassword: password,
    };
}

async function updateServerLoggingSettings({ user, additionalFieldValues, oauthApp }) {
    const username = additionalFieldValues.apiUsername;
    const password = additionalFieldValues.apiPassword;
    user.platformAdditionalInfo = {
        ...user.platformAdditionalInfo,
        encodedApiUsername: username ? encode(username) : '',
        encodedApiPassword: password ? encode(password) : ''
    }
    const authData = await bullhornPasswordAuthorize(user, oauthApp, { apiUsername: username, apiPassword: password });
    await overrideSessionWithAuthInfo({ user, authData });
    return {
        successful: true,
        returnMessage: {
            messageType: 'success',
            message: 'Server logging settings updated',
            ttl: 5000
        },
    };
}

async function postSaveUserInfo({ userInfo, oauthApp }) {
    const user = await UserModel.findByPk(userInfo.id);
    if (user.platformAdditionalInfo?.encodedApiUsername && user.platformAdditionalInfo?.encodedApiPassword) {
        const authData = await bullhornPasswordAuthorize(
            user,
            oauthApp,
            { apiUsername: decoded(user.platformAdditionalInfo.encodedApiUsername), apiPassword: decoded(user.platformAdditionalInfo.encodedApiPassword) }
        );
        await overrideSessionWithAuthInfo({ user, authData });
    }
    return userInfo;
}

async function overrideSessionWithAuthInfo({ user, authData }) {
    const { access_token: accessToken, refresh_token: refreshToken, expires_in: expires } = authData;
    user.accessToken = accessToken;
    user.refreshToken = refreshToken;
    const userLoginResponse = await axios.post(`${user.platformAdditionalInfo.loginUrl}/login?version=2.0&access_token=${user.accessToken}`);
    const { BhRestToken, restUrl } = userLoginResponse.data;
    let updatedPlatformAdditionalInfo = user.platformAdditionalInfo;
    updatedPlatformAdditionalInfo.bhRestToken = BhRestToken;
    updatedPlatformAdditionalInfo.restUrl = restUrl;
    // Not sure why, assigning platformAdditionalInfo first then give it another value so that it can be saved to db
    user.platformAdditionalInfo = {};
    user.platformAdditionalInfo = updatedPlatformAdditionalInfo;
    const date = new Date();
    user.tokenExpiry = date.setSeconds(date.getSeconds() + expires);
    console.log('Bullhorn session overridden with auth info')
    await user.save();
    return user;
}

async function findContact({ user, phoneNumber, isExtension }) {
    if (isExtension === 'true') {
        return {
            successful: false,
            matchedContactInfo: []
        }
    }
    let commentActionListResponse;
    let extraDataTracking = {};
    try {
        commentActionListResponse = await axios.get(
            `${user.platformAdditionalInfo.restUrl}settings/commentActionList`,
            {
                headers: {
                    BhRestToken: user.platformAdditionalInfo.bhRestToken
                }
            });
    }
    catch (e) {
        extraDataTracking['statusCode'] = e.response.status;
    }
    const commentActionList = commentActionListResponse ? commentActionListResponse.data.commentActionList.map(a => { return { const: a, title: a } }) : [];
    const phoneNumberObj = parsePhoneNumber(phoneNumber.replace(' ', '+'));
    const phoneNumberWithoutCountryCode = phoneNumberObj.number.significant;
    const matchedContactInfo = [];
    // check for Contact
    const contactPersonInfo = await axios.post(
        `${user.platformAdditionalInfo.restUrl}search/ClientContact?fields=id,name,email,phone'`,
        {
            query: `(phone:${phoneNumberWithoutCountryCode} OR mobile:${phoneNumberWithoutCountryCode} OR phone2:${phoneNumberWithoutCountryCode} OR phone3:${phoneNumberWithoutCountryCode}) AND isDeleted:false`
        },
        {
            headers: {
                BhRestToken: user.platformAdditionalInfo.bhRestToken
            }
        });
    for (const result of contactPersonInfo.data.data) {
        matchedContactInfo.push({
            id: result.id,
            name: result.name,
            phone: result.phone,
            type: 'Contact',
            additionalInfo: commentActionList?.length > 0 ? { noteActions: commentActionList } : null
        });
    }
    // check for Candidate
    const candidatePersonInfo = await axios.post(
        `${user.platformAdditionalInfo.restUrl}search/Candidate?fields=id,name,email,phone'`,
        {
            query: `(phone:${phoneNumberWithoutCountryCode} OR mobile:${phoneNumberWithoutCountryCode} OR phone2:${phoneNumberWithoutCountryCode} OR phone3:${phoneNumberWithoutCountryCode} OR workPhone:${phoneNumberWithoutCountryCode}) AND isDeleted:false`
        },
        {
            headers: {
                BhRestToken: user.platformAdditionalInfo.bhRestToken
            }
        });
    for (const result of candidatePersonInfo.data.data) {
        matchedContactInfo.push({
            id: result.id,
            name: result.name,
            phone: result.phone,
            type: 'Candidate',
            additionalInfo: commentActionList?.length > 0 ? { noteActions: commentActionList } : null
        });
    }
    // check for Lead
    const leadPersonInfo = await axios.post(
        `${user.platformAdditionalInfo.restUrl}search/Lead?fields=id,name,email,phone,status'`,
        {
            query: `(phone:${phoneNumberWithoutCountryCode} OR mobile:${phoneNumberWithoutCountryCode} OR phone2:${phoneNumberWithoutCountryCode} OR phone3:${phoneNumberWithoutCountryCode}) AND isDeleted:false NOT status:"Converted"`
        },
        {
            headers: {
                BhRestToken: user.platformAdditionalInfo.bhRestToken
            }
        });
    for (const result of leadPersonInfo.data.data) {
        matchedContactInfo.push({
            id: result.id,
            name: result.name,
            phone: result.phone,
            type: 'Lead',
            additionalInfo: commentActionList?.length > 0 ? { noteActions: commentActionList } : null
        });
    }
    extraDataTracking = {
        ratelimitRemaining: candidatePersonInfo.headers['ratelimit-remaining'],
        ratelimitAmount: candidatePersonInfo.headers['ratelimit-limit'],
        ratelimitReset: candidatePersonInfo.headers['ratelimit-reset']
    };

    if (matchedContactInfo.length === 0) {
        let leadStatuses = [];
        try {
            const leadMetaResponse = await axios.get(`${user.platformAdditionalInfo.restUrl}meta/Lead?fields=status`,
                {
                    headers: {
                        BhRestToken: user.platformAdditionalInfo.bhRestToken
                    }
                });
            leadStatuses = leadMetaResponse.data.fields.find(f => f.name === 'status').options.map(s => { return { const: s.value, title: s.label } });
        }
        catch (e) {
            extraDataTracking['statusCode'] = e.response.status;
        }
        let candidateStatuses = [];
        try {
            const candidateMetaResponse = await axios.get(`${user.platformAdditionalInfo.restUrl}meta/Candidate?fields=status`,
                {
                    headers: {
                        BhRestToken: user.platformAdditionalInfo.bhRestToken
                    }
                });
            candidateStatuses = candidateMetaResponse.data.fields.find(f => f.name === 'status').options.map(s => { return { const: s.value, title: s.label } });
        }
        catch (e) {
            extraDataTracking['statusCode'] = e.response.status;
        }
        let contactStatuses = [];
        try {
            const contactMetaResponse = await axios.get(`${user.platformAdditionalInfo.restUrl}meta/ClientContact?fields=status`,
                {
                    headers: {
                        BhRestToken: user.platformAdditionalInfo.bhRestToken
                    }
                });
            contactStatuses = contactMetaResponse.data.fields.find(f => f.name === 'status').options.map(s => { return { const: s.value, title: s.label } });
        }
        catch (e) {
            extraDataTracking['statusCode'] = e.response.status;
        }
        const newContactAdditionalInfo = {
            Lead: {
                status: leadStatuses
            },
            Candidate: {
                status: candidateStatuses
            },
            Contact: {
                status: contactStatuses
            }
        }
        if (commentActionList?.length > 0) {
            newContactAdditionalInfo.noteActions = commentActionList;
        }
        matchedContactInfo.push({
            id: 'createNewContact',
            name: 'Create new contact...',
            additionalInfo: newContactAdditionalInfo ?? null,
            isNewContact: true,
            defaultContactType: 'Lead'
        });
    }

    return {
        successful: true,
        matchedContactInfo,
        extraDataTracking
    };
}

async function createContact({ user, authHeader, phoneNumber, newContactName, newContactType, additionalSubmission }) {
    let commentActionListResponse;
    let extraDataTracking = {};
    try {
        commentActionListResponse = await axios.get(
            `${user.platformAdditionalInfo.restUrl}settings/commentActionList`,
            {
                headers: {
                    BhRestToken: user.platformAdditionalInfo.bhRestToken
                }
            });
    }
    catch (e) {
        if (isAuthError(e.response.status)) {
            user = await refreshSessionToken(user);
            commentActionListResponse = await axios.get(`${user.platformAdditionalInfo.restUrl}settings/commentActionList`,
                {
                    headers: {
                        BhRestToken: user.platformAdditionalInfo.bhRestToken
                    }
                });
        }
        else {
            throw e;
        }
        extraDataTracking['statusCode'] = e.response.status;
    }
    const commentActionList = commentActionListResponse.data.commentActionList.map(a => { return { const: a, title: a } });
    switch (newContactType) {
        case 'Lead':
            const leadPostBody = {
                name: newContactName,
                firstName: newContactName.split(' ')[0],
                lastName: newContactName.split(' ').length > 1 ? newContactName.split(' ')[1] : '',
                phone: phoneNumber.replace(' ', '+'),
                status: additionalSubmission.status
            }
            const leadInfoResp = await axios.put(
                `${user.platformAdditionalInfo.restUrl}entity/Lead`,
                leadPostBody,
                {
                    headers: {
                        BhRestToken: user.platformAdditionalInfo.bhRestToken
                    }
                }
            );
            extraDataTracking = {
                ratelimitRemaining: leadInfoResp.headers['ratelimit-remaining'],
                ratelimitAmount: leadInfoResp.headers['ratelimit-limit'],
                ratelimitReset: leadInfoResp.headers['ratelimit-reset']
            }

            return {
                contactInfo: {
                    id: leadInfoResp.data.changedEntityId,
                    name: newContactName,
                    additionalInfo: commentActionList?.length > 0 ? { noteActions: commentActionList } : null
                },
                returnMessage: {
                    message: `${newContactType} created.`,
                    messageType: 'success',
                    ttl: 2000
                },
                extraDataTracking
            }
        case 'Candidate':
            const candidatePostBody = {
                name: newContactName,
                firstName: newContactName.split(' ')[0],
                lastName: newContactName.split(' ').length > 1 ? newContactName.split(' ')[1] : '',
                phone: phoneNumber.replace(' ', '+'),
                status: additionalSubmission.status
            }
            const candidateInfoResp = await axios.put(
                `${user.platformAdditionalInfo.restUrl}entity/Candidate`,
                candidatePostBody,
                {
                    headers: {
                        BhRestToken: user.platformAdditionalInfo.bhRestToken
                    }
                }
            );
            extraDataTracking = {
                ratelimitRemaining: candidateInfoResp.headers['ratelimit-remaining'],
                ratelimitAmount: candidateInfoResp.headers['ratelimit-limit'],
                ratelimitReset: candidateInfoResp.headers['ratelimit-reset']
            }

            return {
                contactInfo: {
                    id: candidateInfoResp.data.changedEntityId,
                    name: newContactName,
                    additionalInfo: commentActionList?.length > 0 ? { noteActions: commentActionList } : null
                },
                returnMessage: {
                    message: `${newContactType} created.`,
                    messageType: 'success',
                    ttl: 2000
                },
                extraDataTracking
            }
        case 'Contact':
            let companyId = 0;
            const companyInfo = await axios.post(
                `${user.platformAdditionalInfo.restUrl}search/ClientCorporation?fields=id,name`,
                {
                    query: "name:RingCentral_CRM_Extension_Placeholder_Company"
                },
                {
                    headers: {
                        BhRestToken: user.platformAdditionalInfo.bhRestToken
                    }
                }
            )
            if (companyInfo.data.total > 0 && companyInfo.data.data[0].name === 'RingCentral_CRM_Extension_Placeholder_Company') {
                companyId = companyInfo.data.data[0].id;
            }
            else {
                const createCompany = await axios.put(
                    `${user.platformAdditionalInfo.restUrl}entity/ClientCorporation`,
                    {
                        name: "RingCentral_CRM_Extension_Placeholder_Company",
                        companyDescription: "<strong><span style=\"color: rgb(231,76,60);\">This company was created automatically by the RingCentral App Connect. Feel free to edit, or associate this company's contacts to more appropriate records. </span></strong>"
                    },
                    {
                        headers: {
                            BhRestToken: user.platformAdditionalInfo.bhRestToken
                        }
                    }
                )
                companyId = createCompany.data.changedEntityId;
            }
            const contactPostBody = {
                name: newContactName,
                firstName: newContactName.split(' ')[0],
                lastName: newContactName.split(' ').length > 1 ? newContactName.split(' ')[1] : '',
                phone: phoneNumber.replace(' ', '+'),
                clientCorporation: {
                    id: companyId
                },
                status: additionalSubmission.status
            }
            const contactInfoResp = await axios.put(
                `${user.platformAdditionalInfo.restUrl}entity/ClientContact`,
                contactPostBody,
                {
                    headers: {
                        BhRestToken: user.platformAdditionalInfo.bhRestToken
                    }
                }
            );

            extraDataTracking = {
                ratelimitRemaining: contactInfoResp.headers['ratelimit-remaining'],
                ratelimitAmount: contactInfoResp.headers['ratelimit-limit'],
                ratelimitReset: contactInfoResp.headers['ratelimit-reset']
            }

            return {
                contactInfo: {
                    id: contactInfoResp.data.changedEntityId,
                    name: newContactName,
                    additionalInfo: commentActionList?.length > 0 ? { noteActions: commentActionList } : null
                },
                returnMessage: {
                    message: `${newContactType} created.`,
                    messageType: 'success',
                    ttl: 2000
                },
                extraDataTracking
            }
    }
}

async function findContactWithName({ user, authHeader, name }) {
    let commentActionListResponse;
    let extraDataTracking = {};
    try {
        commentActionListResponse = await axios.get(
            `${user.platformAdditionalInfo.restUrl}settings/commentActionList`,
            {
                headers: {
                    BhRestToken: user.platformAdditionalInfo.bhRestToken
                }
            });
    }
    catch (e) {
        if (isAuthError(e.response.status)) {
            user = await refreshSessionToken(user);
            commentActionListResponse = await axios.get(`${user.platformAdditionalInfo.restUrl}settings/commentActionList`,
                {
                    headers: {
                        BhRestToken: user.platformAdditionalInfo.bhRestToken
                    }
                });
        }
        else {
            throw e;
        }
        extraDataTracking['statusCode'] = e.response.status;
    }
    const commentActionList = commentActionListResponse.data.commentActionList.map(a => { return { const: a, title: a } });
    const matchedContactInfo = [];
    // Search by full name components
    const nameComponents = name.trim().split(' ');
    const searchQueries = [];

    // Full name exact match
    searchQueries.push(`name:"${name}" AND isDeleted:false`);

    // First + Last name combinations
    // if (nameComponents.length >= 2) {
    //     const firstName = nameComponents[0];
    //     const lastName = nameComponents[nameComponents.length - 1];
    //     searchQueries.push(`firstName:${firstName} AND lastName:${lastName} AND isDeleted:false`);
    // }

    // First name only
    searchQueries.push(`firstName:${nameComponents[0]} AND isDeleted:false`);

    // Last name only if provided
    if (nameComponents.length > 1) {
        searchQueries.push(`lastName:${nameComponents[nameComponents.length - 1]} AND isDeleted:false`);
    }
    const combinedQuery = searchQueries.map(query => `(${query})`).join(' OR ');
    // Make single API call with combined query
    const contactSearchResponse = await axios.post(
        `${user.platformAdditionalInfo.restUrl}search/ClientContact?fields=id,name,email,phone'`,
        { query: combinedQuery },
        {
            headers: {
                BhRestToken: user.platformAdditionalInfo.bhRestToken
            }
        }
    );
    const seenIds = new Set();
    const uniqueContactResults = [];
    if (contactSearchResponse?.data?.data?.length > 0) {
        contactSearchResponse.data.data.forEach(result => {
            if (!seenIds.has(result.id)) {
                seenIds.add(result.id);
                uniqueContactResults.push(result);
            }
        });
    }
    for (const result of uniqueContactResults) {
        matchedContactInfo.push({
            id: result.id,
            name: result.name,
            phone: result.phone,
            type: 'Contact',
            additionalInfo: commentActionList?.length > 0 ? { noteActions: commentActionList } : null
        });
    }

    const candidatePersonInfo = await axios.post(
        `${user.platformAdditionalInfo.restUrl}search/Candidate?fields=id,name,email,phone'`,
        {
            query: combinedQuery
        },
        {
            headers: {
                BhRestToken: user.platformAdditionalInfo.bhRestToken
            }
        }
    );
    const candidateIds = new Set();
    const uniqueCandidateResults = [];
    if (candidatePersonInfo?.data?.data?.length > 0) {
        candidatePersonInfo.data.data.forEach(result => {
            if (!candidateIds.has(result.id)) {
                candidateIds.add(result.id);
                uniqueCandidateResults.push(result);
            }
        });
    }
    for (const result of uniqueCandidateResults) {
        matchedContactInfo.push({
            id: result.id,
            name: result.name,
            phone: result.phone,
            type: 'Candidate',
            additionalInfo: commentActionList?.length > 0 ? { noteActions: commentActionList } : null
        });
    }

    //Search Candidates
    const leadPersonInfo = await axios.post(
        `${user.platformAdditionalInfo.restUrl}search/Lead?fields=id,name,email,phone,status'`,
        {
            query: combinedQuery
        },
        {
            headers: {
                BhRestToken: user.platformAdditionalInfo.bhRestToken
            }
        }
    );
    const leadIds = new Set();
    const uniqueLeadResults = [];
    if (leadPersonInfo?.data?.data?.length > 0) {
        leadPersonInfo.data.data.forEach(result => {
            if (!leadIds.has(result.id)) {
                leadIds.add(result.id);
                uniqueLeadResults.push(result);
            }
        });
    }
    for (const result of uniqueLeadResults) {
        matchedContactInfo.push({
            id: result.id,
            name: result.name,
            phone: result.phone,
            type: 'Lead',
            additionalInfo: commentActionList?.length > 0 ? { noteActions: commentActionList } : null
        });
    }
    extraDataTracking = {
        ratelimitRemaining: leadPersonInfo.headers['ratelimit-remaining'],
        ratelimitAmount: leadPersonInfo.headers['ratelimit-limit'],
        ratelimitReset: leadPersonInfo.headers['ratelimit-reset']
    };
    return {
        successful: true,
        matchedContactInfo,
        extraDataTracking
    };
}

async function getAssigneeIdFromUserInfo({ user, additionalSubmission }) {
    try {
        const targetUserEmail = additionalSubmission.adminAssignedUserEmail;
        const targetUserRcName = additionalSubmission.adminAssignedUserName;
        let queryWhere = 'isDeleted=false';
        if (targetUserEmail) {
            queryWhere += ` AND email='${targetUserEmail}'`;
        }
        const searchParams = new URLSearchParams({
            fields: 'id,firstName,lastName,email',
            where: queryWhere
        });
        const userInfoResponse = await axios.get(
            `${user.platformAdditionalInfo.restUrl}query/CorporateUser?${searchParams.toString()}`,
            {
                headers: {
                    BhRestToken: user.platformAdditionalInfo.bhRestToken
                }
            }
        );
        if (userInfoResponse?.data?.data?.length > 0) {
            if (targetUserEmail) {
                const targetUser = userInfoResponse.data.data.find(u => u.email === targetUserEmail);
                if (targetUser) {
                    return targetUser.id;
                }
            }
            if (targetUserRcName) {
                const targetUser = userInfoResponse.data.data.find(u => `${u.firstName} ${u.lastName}` === targetUserRcName);
                if (targetUser) {
                    return targetUser.id;
                }
            }
        }
    }
    catch (e) {
        console.log('Error getting user data from phone number', e && e.response && e.response.status);
    }
    return null;
}

async function createCallLog({ user, contactInfo, authHeader, callLog, note, additionalSubmission, aiNote, transcript, composedLogDetails }) {
    const noteActions = (additionalSubmission?.noteActions ?? '') || 'pending note';
    let assigneeId = null;
    if (additionalSubmission?.isAssignedToUser) {
        if (additionalSubmission.adminAssignedUserToken) {
            try {
                const unAuthData = jwt.decodeJwt(additionalSubmission.adminAssignedUserToken);
                const assigneeUser = await UserModel.findByPk(unAuthData.id);
                if (assigneeUser) {
                    assigneeId = assigneeUser.platformAdditionalInfo.id;
                }
            }
            catch (e) {
                console.log('Error decoding admin assigned user token', e);
            }
        }

        if (!assigneeId && (
            additionalSubmission.adminAssignedUserEmail || additionalSubmission.adminAssignedUserName
        )) {
            assigneeId = await getAssigneeIdFromUserInfo({ user, additionalSubmission });
        }
    }
    const subject = callLog.customSubject ?? `${callLog.direction} Call ${callLog.direction === 'Outbound' ? `to ${contactInfo.name}` : `from ${contactInfo.name}`}`;
    const putBody = {
        comments: composedLogDetails,
        personReference: {
            id: contactInfo.id
        },
        action: noteActions,
        dateAdded: callLog.startTime,
        externalID: callLog.sessionId,
        minutesSpent: callLog.duration / 60
    }
    if (assigneeId) {
        putBody.commentingPerson = {
            id: assigneeId
        }
    }
    let addLogRes;
    let extraDataTracking = {
        withSmartNoteLog: !!aiNote && (user.userSettings?.addCallLogAiNote?.value ?? true),
        withTranscript: !!transcript && (user.userSettings?.addCallLogTranscript?.value ?? true)
    };
    try {
        addLogRes = await axios.put(
            `${user.platformAdditionalInfo.restUrl}entity/Note`,
            putBody,
            {
                headers: {
                    BhRestToken: user.platformAdditionalInfo.bhRestToken
                }
            }
        );
        extraDataTracking.ratelimitRemaining = addLogRes.headers['ratelimit-remaining'];
        extraDataTracking.ratelimitAmount = addLogRes.headers['ratelimit-limit'];
        extraDataTracking.ratelimitReset = addLogRes.headers['ratelimit-reset'];
    }
    catch (e) {
        if (isAuthError(e.response.status)) {
            user = await refreshSessionToken(user);
            addLogRes = await axios.put(
                `${user.platformAdditionalInfo.restUrl}entity/Note`,
                putBody,
                {
                    headers: {
                        BhRestToken: user.platformAdditionalInfo.bhRestToken
                    }
                }
            );
        }
        else {
            throw e;
        }
    }
    return {
        logId: addLogRes.data.changedEntityId,
        returnMessage: {
            message: 'Call logged',
            messageType: 'success',
            ttl: 2000
        },
        extraDataTracking
    };
}

async function updateCallLog({ user, existingCallLog, authHeader, recordingLink, subject, note, startTime, duration, result, aiNote, transcript, additionalSubmission, composedLogDetails, existingCallLogDetails }) {
    const existingBullhornLogId = existingCallLog.thirdPartyLogId;
    let getLogRes
    let extraDataTracking = {};
    // Use passed existingCallLogDetails to avoid duplicate API call
    if (existingCallLogDetails) {
        getLogRes = { data: { data: existingCallLogDetails } };
    } else {
        // Fallback to API call if details not provided
        try {
            getLogRes = await axios.get(
                `${user.platformAdditionalInfo.restUrl}entity/Note/${existingBullhornLogId}?fields=comments`,
                {
                    headers: {
                        BhRestToken: user.platformAdditionalInfo.bhRestToken
                    }
                });
            extraDataTracking = {
                ratelimitRemaining: getLogRes.headers['ratelimit-remaining'],
                ratelimitAmount: getLogRes.headers['ratelimit-limit'],
                ratelimitReset: getLogRes.headers['ratelimit-reset']
            }
        }
        catch (e) {
            if (isAuthError(e.response.status)) {
                user = await refreshSessionToken(user);
                getLogRes = await axios.get(
                    `${user.platformAdditionalInfo.restUrl}entity/Note/${existingBullhornLogId}?fields=comments`,
                    {
                        headers: {
                            BhRestToken: user.platformAdditionalInfo.bhRestToken
                        }
                    });
            }
            else {
                throw e;
            }
            extraDataTracking['statusCode'] = e.response.status;
        }
    }

    // case: reassign to user
    let assigneeId = null;
    if (
        additionalSubmission?.isAssignedToUser && (
            additionalSubmission.adminAssignedUserEmail || additionalSubmission.adminAssignedUserName
        )
    ) {
        assigneeId = await getAssigneeIdFromUserInfo({ user, additionalSubmission });
    }
    // I dunno, Bullhorn just uses POST as PATCH
    const postBody = {
        comments: composedLogDetails,
        dateAdded: startTime,
        minutesSpent: duration / 60
    }
    if (assigneeId) {
        postBody.commentingPerson = {
            id: assigneeId
        }
    }
    let patchLogRes;
    try {
        patchLogRes = await axios.post(
            `${user.platformAdditionalInfo.restUrl}entity/Note/${existingBullhornLogId}`,
            postBody,
            {
                headers: {
                    BhRestToken: user.platformAdditionalInfo.bhRestToken
                }
            });
        extraDataTracking = {
            ratelimitRemaining: patchLogRes.headers['ratelimit-remaining'],
            ratelimitAmount: patchLogRes.headers['ratelimit-limit'],
            ratelimitReset: patchLogRes.headers['ratelimit-reset']
        }
    }
    catch (e) {
        if (isAuthError(e.response.status)) {
            user = await refreshSessionToken(user);
            patchLogRes = await axios.post(
                `${user.platformAdditionalInfo.restUrl}entity/Note/${existingBullhornLogId}`,
                postBody,
                {
                    headers: {
                        BhRestToken: user.platformAdditionalInfo.bhRestToken
                    }
                });
        }
        else {
            throw e;
        }
        extraDataTracking['statusCode'] = e.response.status;
    }
    return {
        updatedNote: postBody.comments,
        returnMessage: {
            message: 'Call log updated.',
            messageType: 'success',
            ttl: 2000
        },
        extraDataTracking
    };
}

async function upsertCallDisposition({ user, existingCallLog, authHeader, dispositions }) {
    let extraDataTracking = {};
    const noteActions = (dispositions.noteActions ?? '') || 'pending note';

    const existingBullhornLogId = existingCallLog.thirdPartyLogId;
    const postBody = {
        action: noteActions
    }
    try {
        const upsertDispositionRes = await axios.post(
            `${user.platformAdditionalInfo.restUrl}entity/Note/${existingBullhornLogId}`,
            postBody,
            {
                headers: {
                    BhRestToken: user.platformAdditionalInfo.bhRestToken
                }
            });
        extraDataTracking = {
            ratelimitRemaining: upsertDispositionRes.headers['ratelimit-remaining'],
            ratelimitAmount: upsertDispositionRes.headers['ratelimit-limit'],
            ratelimitReset: upsertDispositionRes.headers['ratelimit-reset']
        }
    }
    catch (e) {
        if (e.response.status === 403) {
            return {
                extraDataTracking,
                returnMessage: {
                    messageType: 'warning',
                    message: 'It seems like your Bullhorn account does not have permission to update Note. Refer to details for more information.',
                    details: [
                        {
                            title: 'Details',
                            items: [
                                {
                                    id: '1',
                                    type: 'text',
                                    text: `Please go to user settings -> Call and SMS logging and turn ON one-time call logging and try again.`
                                }
                            ]
                        }
                    ],
                    ttl: 3000
                }
            }
        }
        else {
            throw e;
        }
    }
    return {
        logId: existingBullhornLogId,
        extraDataTracking
    }
}

async function createMessageLog({ user, contactInfo, authHeader, message, additionalSubmission, recordingLink, faxDocLink }) {
    const noteActions = additionalSubmission?.noteActions ?? '';
    let userInfoResponse;
    let extraDataTracking = {};;
    try {
        userInfoResponse = await axios.get(`${user.platformAdditionalInfo.restUrl}query/CorporateUser?fields=id,name&where=masterUserID=${user.id.replace('-bullhorn', '')}`,
            {
                headers: {
                    BhRestToken: user.platformAdditionalInfo.bhRestToken
                }
            });
    }
    catch (e) {
        if (isAuthError(e.response.status)) {
            user = await refreshSessionToken(user);
            userInfoResponse = await axios.get(`${user.platformAdditionalInfo.restUrl}query/CorporateUser?fields=id,name&where=masterUserID=${user.id.replace('-bullhorn', '')}`,
                {
                    headers: {
                        BhRestToken: user.platformAdditionalInfo.bhRestToken
                    }
                });
        }
        else {
            throw e;
        }
    }
    const userData = userInfoResponse.data.data[0];
    const userName = userData.name;
    const messageType = recordingLink ? 'Voicemail' : (faxDocLink ? 'Fax' : 'SMS');
    let subject = '';
    let comments = '';
    switch (messageType) {
        case 'SMS':
            subject = `SMS conversation with ${contactInfo.name} - ${moment(message.creationTime).utcOffset(Number(user.timezoneOffset)).format('YY/MM/DD')}`;
            comments =
                `<br><b>${subject}</b><br>` +
                '<b>Conversation summary</b><br>' +
                `${moment(message.creationTime).utcOffset(Number(user.timezoneOffset)).format('dddd, MMMM DD, YYYY')}<br>` +
                'Participants<br>' +
                `<ul><li><b>${userName}</b><br></li>` +
                `<li><b>${contactInfo.name}</b></li></ul><br>` +
                'Conversation(1 messages)<br>' +
                'BEGIN<br>' +
                '------------<br>' +
                '<ul>' +
                `<li>${message.direction === 'Inbound' ? `${contactInfo.name} (${contactInfo.phoneNumber})` : userName} ${moment(message.creationTime).utcOffset(Number(user.timezoneOffset)).format('hh:mm A')}<br>` +
                `<b>${message.subject}</b></li>` +
                '</ul>' +
                '------------<br>' +
                'END<br><br>' +
                '--- Created via RingCentral App Connect';
            break;
        case 'Voicemail':
            subject = `Voicemail left by ${contactInfo.name} - ${moment(message.creationTime).utcOffset(Number(user.timezoneOffset)).format('YY/MM/DD')}`;
            comments = `<br><b>${subject}</b><br>Voicemail recording link: ${recordingLink} <br><br>--- Created via RingCentral App Connect`;
            break;
        case 'Fax':
            subject = `Fax document sent from ${contactInfo.name} - ${moment(message.creationTime).utcOffset(Number(user.timezoneOffset)).format('YY/MM/DD')}`;
            comments = `<br><b>${subject}</b><br>Fax document link: ${faxDocLink} <br><br>--- Created via RingCentral App Connect`;
            break;
    }

    const putBody = {
        comments: comments,
        action: noteActions,
        personReference: {
            id: contactInfo.id
        },
        dateAdded: message.creationTime
    }
    const addLogRes = await axios.put(
        `${user.platformAdditionalInfo.restUrl}entity/Note`,
        putBody,
        {
            headers: {
                BhRestToken: user.platformAdditionalInfo.bhRestToken
            }
        }
    );
    extraDataTracking = {
        ratelimitRemaining: addLogRes.headers['ratelimit-remaining'],
        ratelimitAmount: addLogRes.headers['ratelimit-limit'],
        ratelimitReset: addLogRes.headers['ratelimit-reset']
    }
    return {
        logId: addLogRes.data.changedEntityId,
        returnMessage: {
            message: 'Message logged',
            messageType: 'success',
            ttl: 1000
        },
        extraDataTracking
    }
}

async function updateMessageLog({ user, contactInfo, existingMessageLog, message, authHeader }) {
    const existingLogId = existingMessageLog.thirdPartyLogId;
    let userInfoResponse;
    let extraDataTracking = {};;
    try {
        userInfoResponse = await axios.get(`${user.platformAdditionalInfo.restUrl}query/CorporateUser?fields=id,name&where=masterUserID=${user.id.replace('-bullhorn', '')}`,
            {
                headers: {
                    BhRestToken: user.platformAdditionalInfo.bhRestToken
                }
            });
    }
    catch (e) {
        if (isAuthError(e.response.status)) {
            user = await refreshSessionToken(user);
            userInfoResponse = await axios.get(`${user.platformAdditionalInfo.restUrl}query/CorporateUser?fields=id,name&where=masterUserID=${user.id.replace('-bullhorn', '')}`,
                {
                    headers: {
                        BhRestToken: user.platformAdditionalInfo.bhRestToken
                    }
                });
        }
        else {
            throw e;
        }
    }
    const userData = userInfoResponse.data.data[0];
    const userName = userData.name;
    const getLogRes = await axios.get(
        `${user.platformAdditionalInfo.restUrl}entity/Note/${existingLogId}?fields=id,comments`,
        {
            headers: {
                BhRestToken: user.platformAdditionalInfo.bhRestToken
            }
        }
    );
    let logBody = getLogRes.data.data.comments;
    let patchBody = {};
    const newMessageLog =
        `<li>${message.direction === 'Inbound' ? `${contactInfo.name} (${contactInfo.phoneNumber})` : userName} ${moment(message.creationTime).utcOffset(Number(user.timezoneOffset)).format('hh:mm A')}<br>` +
        `<b>${message.subject}</b></li>`;
    // Add new message at the end (before the closing </ul> tag inside BEGIN/END block)
    logBody = logBody.replace('</ul>------------<br>', `${newMessageLog}</ul>------------<br>`);

    const regex = RegExp('<br>Conversation.(.*) messages.');
    const matchResult = regex.exec(logBody);
    logBody = logBody.replace(matchResult[0], `<br>Conversation(${parseInt(matchResult[1]) + 1} messages)`);

    patchBody = {
        comments: logBody,
        dateAdded: message.creationTime
    }
    try {
        // I dunno, Bullhorn uses POST as PATCH
        const patchLogRes = await axios.post(
            `${user.platformAdditionalInfo.restUrl}entity/Note/${existingLogId}`,
            patchBody,
            {
                headers: {
                    BhRestToken: user.platformAdditionalInfo.bhRestToken
                }
            });
        extraDataTracking = {
            ratelimitRemaining: patchLogRes.headers['ratelimit-remaining'],
            ratelimitAmount: patchLogRes.headers['ratelimit-limit'],
            ratelimitReset: patchLogRes.headers['ratelimit-reset']
        }
    }
    catch (e) {
        if (e.response.status === 403) {
            return {
                extraDataTracking,
                returnMessage: {
                    messageType: 'warning',
                    message: 'It seems like your Bullhorn account does not have permission to update Note. Refer to details for more information.',
                    details: [
                        {
                            title: 'Details',
                            items: [
                                {
                                    id: '1',
                                    type: 'text',
                                    text: `Please go to user settings -> Call and SMS logging and turn ON one-time call logging and try again.`
                                }
                            ]
                        }
                    ],
                    ttl: 3000
                }
            }
        }
    }
    return {
        extraDataTracking
    }
}

async function getCallLog({ user, callLogId, authHeader }) {
    let getLogRes;
    let extraDataTracking = {};;
    try {
        getLogRes = await axios.get(
            `${user.platformAdditionalInfo.restUrl}entity/Note/${callLogId}?fields=comments,candidates,clientContacts,action`,
            {
                headers: {
                    BhRestToken: user.platformAdditionalInfo.bhRestToken
                }
            });
        extraDataTracking = {
            ratelimitRemaining: getLogRes.headers['ratelimit-remaining'],
            ratelimitAmount: getLogRes.headers['ratelimit-limit'],
            ratelimitReset: getLogRes.headers['ratelimit-reset']
        }
    }
    catch (e) {
        if (isAuthError(e.response.status)) {
            user = await refreshSessionToken(user);
            getLogRes = await axios.get(
                `${user.platformAdditionalInfo.restUrl}entity/Note/${callLogId}?fields=comments,candidates,clientContacts,action`,
                {
                    headers: {
                        BhRestToken: user.platformAdditionalInfo.bhRestToken
                    }
                });
        }
        else {
            throw e;
        }
    }
    const logBody = getLogRes.data.data.comments;
    const note = logBody.split('<b>Agent notes</b>')[1]?.split('<b>Call details</b>')[0]?.replaceAll('<br>', '') ?? '';
    const subject = logBody.split('</ul>')[0]?.split('<li><b>Summary</b>: ')[1]?.split('<li><b>')[0] ?? '';
    const action = getLogRes.data.data.action;
    const totalContactCount = getLogRes.data.data.clientContacts.total + getLogRes.data.data.candidates.total;
    let contact = {
        firstName: '',
        lastName: ''
    }
    if (totalContactCount > 0) {
        contact = getLogRes.data.data.clientContacts.total > 0 ? getLogRes.data.data.clientContacts.data[0] : getLogRes.data.data.candidates.data[0];
    }
    return {
        callLogInfo: {
            subject,
            note,
            fullBody: logBody,
            fullLogResponse: getLogRes.data.data,
            contactName: `${contact.firstName} ${contact.lastName}`,
            dispositions: {
                noteActions: action
            }
        },
        extraDataTracking
    }
}

async function refreshSessionToken(user) {
    const userLoginResponse = await axios.post(`${user.platformAdditionalInfo.loginUrl}/login?version=2.0&access_token=${user.accessToken}`);
    const { BhRestToken, restUrl } = userLoginResponse.data;
    let updatedPlatformAdditionalInfo = user.platformAdditionalInfo;
    updatedPlatformAdditionalInfo.bhRestToken = BhRestToken;
    updatedPlatformAdditionalInfo.restUrl = restUrl;
    // Not sure why, assigning platformAdditionalInfo first then give it another value so that it can be saved to db
    user.platformAdditionalInfo = {};
    user.platformAdditionalInfo = updatedPlatformAdditionalInfo;
    await user.save();
    return user;
}

function isAuthError(statusCode) {
    return statusCode >= 400 && statusCode < 500;
}

exports.getAuthType = getAuthType;
exports.authValidation = authValidation;
exports.getOauthInfo = getOauthInfo;
exports.checkAndRefreshAccessToken = checkAndRefreshAccessToken;
exports.getOverridingOAuthOption = getOverridingOAuthOption;
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
exports.getServerLoggingSettings = getServerLoggingSettings;
exports.updateServerLoggingSettings = updateServerLoggingSettings;
exports.postSaveUserInfo = postSaveUserInfo;