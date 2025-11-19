/* eslint-disable no-param-reassign */
const axios = require('axios');
const moment = require('moment-timezone');
const { parsePhoneNumber } = require('awesome-phonenumber');
const jwt = require('@app-connect/core/lib/jwt');
const { UserModel } = require('@app-connect/core/models/userModel');
const { AdminConfigModel } = require('@app-connect/core/models/adminConfigModel');
const { LOG_DETAILS_FORMAT_TYPE } = require('@app-connect/core/lib/constants');

const TEKION_API_BASE = 'https://api-sandbox.tekioncloud.com/public';

function getAuthType() {
    return 'apiKey';
}

function getLogFormatType() {
    return LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT;
}

function getBasicAuth({ apiKey }) {
    return Buffer.from(`${apiKey}`).toString('base64');
}

// Helper function to get access token
async function getAccessToken({ appId, secretKey }) {
    console.log({message:'getAccessToken', appId, secretKey});
    try {
        // Create form-encoded data as required by Tekion API
        const params = new URLSearchParams();
        params.append('app_id', appId);
        params.append('secret_key', secretKey);

        const response = await axios.post(`${TEKION_API_BASE}/tokens`, params, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        return response.data.access_token;
    } catch (error) {
        console.error('Error getting Tekion access token:', error);
        throw error;
    }
}

// Helper function to make authenticated API requests
async function makeAuthenticatedRequest({ method, url, data, appId, accessToken }) {
    const config = {
        method,
        url,
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'X-App-ID': appId
        }
    };
    
    if (data) {
        config.data = data;
    }

    return axios(config);
}

async function getUserInfo({ authHeader, additionalInfo }) {

    console.log({message:'getUserInfo', authHeader, additionalInfo});
    try {
        const { appId, secretKey } = additionalInfo;
        
        if (!appId || !secretKey) {
            throw new Error('App ID and Secret Key are required');
        }

        // Get access token
        const accessToken = await getAccessToken({ appId, secretKey });
        
        // Store access token for future use
        additionalInfo.accessToken = accessToken;
        
        // Try to get user info (adjust endpoint based on actual Tekion API)
        const userInfoResponse = await makeAuthenticatedRequest({
            method: 'GET',
            url: `https://api-sandbox.tekioncloud.com/openapi/user/profile`,
            appId,
            accessToken
        });

        const userData = userInfoResponse.data;
        const id = `${userData.id || 'user'}-tekion`;
        const name = userData.name || userData.email || 'Tekion User';
        const timezoneName = userData.timezone || 'UTC';
        
        let timezoneOffset = 0;
        try {
            if (timezoneName && timezoneName !== 'UTC') {
                timezoneOffset = moment.tz(timezoneName).utcOffset() / 60;
            }
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
                message: 'Connected to Tekion.',
                ttl: 1000
            }
        };
    } catch (e) {
        console.error('Tekion getUserInfo error:', e);
        return {
            successful: false,
            returnMessage: {
                messageType: 'warning',
                message: 'Could not load user information. Please check your App ID and Secret Key.',
                details: [
                    {
                        title: 'Details',
                        items: [
                            {
                                id: '1',
                                type: 'text',
                                text: `Tekion was unable to fetch information for the currently logged in user. Please check your App ID and Secret Key in your Tekion account settings.`
                            }
                        ]
                    }
                ],
                ttl: 3000
            }
        };
    }
}

async function unAuthorize({ user }) {
    // Clear user credentials
    user.accessToken = '';
    user.refreshToken = '';
    if (user.platformAdditionalInfo) {
        user.platformAdditionalInfo.accessToken = '';
    }
    await user.save();
    
    return {
        returnMessage: {
            messageType: 'success',
            message: 'Logged out of Tekion',
            ttl: 1000
        }
    };
}

async function findContact({ user, authHeader, phoneNumber, overridingFormat, isExtension }) {
    if (isExtension === 'true') {
        return {
            successful: false,
            matchedContactInfo: []
        };
    }

    const matchedContactInfo = [];
    try {
        const { appId, accessToken } = user.platformAdditionalInfo;
        
        if (!accessToken) {
            // Try to get a new access token
            const newAccessToken = await getAccessToken({ 
                appId: user.platformAdditionalInfo.appId, 
                secretKey: user.platformAdditionalInfo.secretKey 
            });
            user.platformAdditionalInfo.accessToken = newAccessToken;
            await user.save();
        }

        // Normalize phone number for search
        const numbersToQuery = [];
        const originalNumber = phoneNumber.replace(/\s/g, '');
        numbersToQuery.push(originalNumber);

        // Try to parse and format the number in different ways
        try {
            const parsedNumber = parsePhoneNumber(phoneNumber);
            if (parsedNumber.valid) {
                numbersToQuery.push(parsedNumber.number.e164);
                numbersToQuery.push(parsedNumber.number.national);
                numbersToQuery.push(parsedNumber.number.international);
            }
        } catch (e) {
            // Continue with original number if parsing fails
        }

        // Add custom formats if provided
        if (overridingFormat && overridingFormat !== '') {
            const formats = overridingFormat.split(',');
            numbersToQuery.push(...formats);
        }

        // Search for contacts using each number format
        for (const numberToQuery of numbersToQuery) {
            try {
                const searchResponse = await makeAuthenticatedRequest({
                    method: 'GET',
                    url: `${TEKION_API_BASE}/customers/search?phone=${encodeURIComponent(numberToQuery)}`,
                    appId,
                    accessToken: user.platformAdditionalInfo.accessToken
                });

                if (searchResponse.data && searchResponse.data.length > 0) {
                    for (const contact of searchResponse.data) {
                        const existingContact = matchedContactInfo.find(c => c.id === contact.id);
                        if (!existingContact) {
                            matchedContactInfo.push({
                                id: contact.id,
                                name: `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || contact.companyName || 'Unknown Contact',
                                title: contact.title || '',
                                phone: contact.phone || contact.mobilePhone || phoneNumber,
                                type: contact.type || 'customer',
                                additionalInfo: contact
                            });
                        }
                    }
                }
            } catch (searchError) {
                console.error(`Error searching with number ${numberToQuery}:`, searchError);
                // Continue with next number format
            }
        }

        return {
            successful: true,
            matchedContactInfo
        };
    } catch (e) {
        console.error('Tekion findContact error:', e);
        return {
            successful: false,
            returnMessage: {
                messageType: 'warning',
                message: 'Failed to search contacts in Tekion.',
                ttl: 3000
            },
            matchedContactInfo: []
        };
    }
}

async function createContact({ user, authHeader, contactInfo }) {
    try {
        const { appId, accessToken } = user.platformAdditionalInfo;
        
        if (!accessToken) {
            // Try to get a new access token
            const newAccessToken = await getAccessToken({ 
                appId: user.platformAdditionalInfo.appId, 
                secretKey: user.platformAdditionalInfo.secretKey 
            });
            user.platformAdditionalInfo.accessToken = newAccessToken;
            await user.save();
        }

        // Parse the contact name
        const nameParts = (contactInfo.name || '').split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';

        // Prepare contact data for Tekion API
        const newContactData = {
            firstName: firstName,
            lastName: lastName,
            phone: contactInfo.phoneNumber,
            email: contactInfo.email || '',
            type: contactInfo.type || 'customer'
        };

        // Add any additional fields if provided
        if (contactInfo.additionalInfo) {
            Object.assign(newContactData, contactInfo.additionalInfo);
        }

        const createResponse = await makeAuthenticatedRequest({
            method: 'POST',
            url: `${TEKION_API_BASE}/customers`,
            data: newContactData,
            appId,
            accessToken: user.platformAdditionalInfo.accessToken
        });

        const newContact = createResponse.data;
        
        return {
            successful: true,
            createdContactInfo: {
                id: newContact.id,
                name: `${newContact.firstName || ''} ${newContact.lastName || ''}`.trim(),
                type: newContact.type || 'customer'
            },
            returnMessage: {
                messageType: 'success',
                message: `Contact created in Tekion.`,
                ttl: 3000
            }
        };
    } catch (e) {
        console.error('Tekion createContact error:', e);
        return {
            successful: false,
            returnMessage: {
                messageType: 'warning',
                message: 'Failed to create contact in Tekion.',
                ttl: 3000
            }
        };
    }
}

async function createCallLog({ user, contactInfo, callLog, authHeader, additionalSubmission, isNew }) {
    try {
        const { appId, accessToken } = user.platformAdditionalInfo;
        
        if (!accessToken) {
            // Try to get a new access token
            const newAccessToken = await getAccessToken({ 
                appId: user.platformAdditionalInfo.appId, 
                secretKey: user.platformAdditionalInfo.secretKey 
            });
            user.platformAdditionalInfo.accessToken = newAccessToken;
            await user.save();
        }

        // Prepare call log data for Tekion API
        const callLogData = {
            contactId: contactInfo.id,
            callType: callLog.direction === 'Inbound' ? 'inbound' : 'outbound',
            phoneNumber: callLog.fromNumber || callLog.toNumber,
            duration: callLog.duration || 0,
            startTime: callLog.startTime,
            notes: callLog.note || '',
            recordingUrl: callLog.recordingUrl || '',
            result: callLog.result || 'completed'
        };

        // Add any additional submission data
        if (additionalSubmission) {
            Object.assign(callLogData, additionalSubmission);
        }

        const createResponse = await makeAuthenticatedRequest({
            method: 'POST',
            url: `${TEKION_API_BASE}/activities/calls`,
            data: callLogData,
            appId,
            accessToken: user.platformAdditionalInfo.accessToken
        });

        const createdLog = createResponse.data;

        return {
            successful: true,
            createdLogInfo: {
                id: createdLog.id,
                thirdPartyLogId: createdLog.id
            },
            returnMessage: {
                messageType: 'success',
                message: `Call logged in Tekion.`,
                ttl: 3000
            }
        };
    } catch (e) {
        console.error('Tekion createCallLog error:', e);
        return {
            successful: false,
            returnMessage: {
                messageType: 'warning',
                message: 'Failed to create call log in Tekion.',
                ttl: 3000
            }
        };
    }
}

async function updateCallLog({ user, existingLogId, contactInfo, callLog, authHeader, additionalSubmission }) {
    try {
        const { appId, accessToken } = user.platformAdditionalInfo;
        
        if (!accessToken) {
            // Try to get a new access token
            const newAccessToken = await getAccessToken({ 
                appId: user.platformAdditionalInfo.appId, 
                secretKey: user.platformAdditionalInfo.secretKey 
            });
            user.platformAdditionalInfo.accessToken = newAccessToken;
            await user.save();
        }

        // Prepare update data
        const updateData = {
            duration: callLog.duration || 0,
            notes: callLog.note || '',
            recordingUrl: callLog.recordingUrl || '',
            result: callLog.result || 'completed'
        };

        // Add any additional submission data
        if (additionalSubmission) {
            Object.assign(updateData, additionalSubmission);
        }

        const updateResponse = await makeAuthenticatedRequest({
            method: 'PUT',
            url: `${TEKION_API_BASE}/activities/calls/${existingLogId}`,
            data: updateData,
            appId,
            accessToken: user.platformAdditionalInfo.accessToken
        });

        return {
            successful: true,
            returnMessage: {
                messageType: 'success',
                message: `Call log updated in Tekion.`,
                ttl: 3000
            }
        };
    } catch (e) {
        console.error('Tekion updateCallLog error:', e);
        return {
            successful: false,
            returnMessage: {
                messageType: 'warning',
                message: 'Failed to update call log in Tekion.',
                ttl: 3000
            }
        };
    }
}

async function createMessageLog({ user, contactInfo, message, authHeader, additionalSubmission }) {
    try {
        const { appId, accessToken } = user.platformAdditionalInfo;
        
        if (!accessToken) {
            // Try to get a new access token
            const newAccessToken = await getAccessToken({ 
                appId: user.platformAdditionalInfo.appId, 
                secretKey: user.platformAdditionalInfo.secretKey 
            });
            user.platformAdditionalInfo.accessToken = newAccessToken;
            await user.save();
        }

        // Prepare message log data
        const messageLogData = {
            contactId: contactInfo.id,
            messageType: message.type || 'sms',
            phoneNumber: message.fromNumber || message.toNumber,
            direction: message.direction,
            content: message.subject || message.text || '',
            timestamp: message.creationTime || new Date().toISOString()
        };

        // Add any additional submission data
        if (additionalSubmission) {
            Object.assign(messageLogData, additionalSubmission);
        }

        const createResponse = await makeAuthenticatedRequest({
            method: 'POST',
            url: `${TEKION_API_BASE}/activities/messages`,
            data: messageLogData,
            appId,
            accessToken: user.platformAdditionalInfo.accessToken
        });

        const createdLog = createResponse.data;

        return {
            successful: true,
            createdLogInfo: {
                id: createdLog.id,
                thirdPartyLogId: createdLog.id
            },
            returnMessage: {
                messageType: 'success',
                message: `Message logged in Tekion.`,
                ttl: 3000
            }
        };
    } catch (e) {
        console.error('Tekion createMessageLog error:', e);
        return {
            successful: false,
            returnMessage: {
                messageType: 'warning',
                message: 'Failed to create message log in Tekion.',
                ttl: 3000
            }
        };
    }
}

async function updateMessageLog({ user, existingLogId, contactInfo, message, authHeader, additionalSubmission }) {
    try {
        const { appId, accessToken } = user.platformAdditionalInfo;
        
        if (!accessToken) {
            // Try to get a new access token
            const newAccessToken = await getAccessToken({ 
                appId: user.platformAdditionalInfo.appId, 
                secretKey: user.platformAdditionalInfo.secretKey 
            });
            user.platformAdditionalInfo.accessToken = newAccessToken;
            await user.save();
        }

        // Prepare update data
        const updateData = {
            content: message.subject || message.text || '',
            timestamp: message.creationTime || new Date().toISOString()
        };

        // Add any additional submission data
        if (additionalSubmission) {
            Object.assign(updateData, additionalSubmission);
        }

        const updateResponse = await makeAuthenticatedRequest({
            method: 'PUT',
            url: `${TEKION_API_BASE}/activities/messages/${existingLogId}`,
            data: updateData,
            appId,
            accessToken: user.platformAdditionalInfo.accessToken
        });

        return {
            successful: true,
            returnMessage: {
                messageType: 'success',
                message: `Message log updated in Tekion.`,
                ttl: 3000
            }
        };
    } catch (e) {
        console.error('Tekion updateMessageLog error:', e);
        return {
            successful: false,
            returnMessage: {
                messageType: 'warning',
                message: 'Failed to update message log in Tekion.',
                ttl: 3000
            }
        };
    }
}

async function getLicenseStatus({ user, authHeader }) {
    try {
        // For now, assume license is valid if we can authenticate
        return {
            successful: true,
            hasValidLicense: true
        };
    } catch (e) {
        return {
            successful: false,
            hasValidLicense: false
        };
    }
}

module.exports = {
    getAuthType,
    getLogFormatType,
    getUserInfo,
    unAuthorize,
    findContact,
    createContact,
    createCallLog,
    updateCallLog,
    createMessageLog,
    updateMessageLog,
    getLicenseStatus,
    getBasicAuth
};
