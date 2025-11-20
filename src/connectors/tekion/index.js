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
async function getAccessToken() {
    try {
        // Create form-encoded data as required by Tekion API
        const params = new URLSearchParams();
        params.append('app_id', process.env.TEKION_APP_ID);
        params.append('secret_key', process.env.TEKION_SECRET_KEY);

        const response = await axios.post(`https://api-sandbox.tekioncloud.com/openapi/public/tokens`, params, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        console.log({message:'accessToken response', AccessToken: response.data?.data?.access_token});
        return response?.data?.data?.access_token;
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
        const { dealer_id, emailId } = additionalInfo;
        // Get access token
        const accessToken = await getAccessToken();

        console.log({message:'accessToken fetched successfully', accessToken});
        
        // Store access token for future use
        additionalInfo.accessToken = accessToken;

        const userInfoResponse = await axios.get(`https://api-sandbox.tekioncloud.com/openapi/v4.0.0/users?email=${emailId}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'dealer_id': dealer_id,
                'app_id': process.env.TEKION_APP_ID

            }
        });

        console.log({message:'userInfoResponse', Data: userInfoResponse?.data?.data});

        if (userInfoResponse?.data?.data?.length > 0) {
            const userData = userInfoResponse.data.data[0];
            const id = `${userData.id}-tekion`;
            const name = userData?.userNameDetails?.firstName + ' ' + userData?.userNameDetails?.lastName;
            const timezoneName = null;
            let timezoneOffset = null;
            return {
                successful: true,
                platformUserInfo: {
                    id,
                    name,
                    timezoneName,
                    timezoneOffset,
                    platformAdditionalInfo: {
                        dealer_id: dealer_id,
                        emailId: emailId
                    }
                },
                returnMessage: {
                    messageType: 'success',
                    message: 'Connected to Tekion.',
                    ttl: 1000
                }
            };
        }
        else {
            return {
                successful: false,
                returnMessage: {
                    messageType: 'warning',
                    message: 'Could not load user information. Please check your Dealer Id and Email Id.',
                    ttl: 3000
                }
            };
        }

        
    } catch (e) {
        console.error('Tekion getUserInfo error:', e);
        return {
            successful: false,
            returnMessage: {
                messageType: 'warning',
                message: 'Error while loading user information.',
                details: [
                    {
                        title: 'Details',
                        items: [
                            {
                                id: '1',
                                type: 'text',
                                text: `Error while loading user information.`
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

    
    phoneNumber = phoneNumber.replace(' ', '+')
    // without + is an extension, we don't want to search for that
    if (!phoneNumber.includes('+')) {
        return {
            matchedContactInfo: null,
            returnMessage: {
                message: 'Logging against internal extension number is not supported.',
                messageType: 'warning',
                ttl: 3000
            }
        };
    }
    const phoneNumberObj = parsePhoneNumber(phoneNumber);
    let phoneNumberWithoutCountryCode = phoneNumber;
    if (phoneNumberObj.valid) {
        phoneNumberWithoutCountryCode = phoneNumberObj.number.significant;
    }

    console.log({platformAdditionalInfo: user.platformAdditionalInfo});

    const matchedContactInfo = [];
    try {
       const accessToken = await getAccessToken();
       const appId=process.env.TEKION_APP_ID;
        
       const customerSearchResponse = await axios.get(`https://api-sandbox.tekioncloud.com/openapi/v4.0.0/customers?phone=${phoneNumberWithoutCountryCode}`, {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'dealer_id': user?.platformAdditionalInfo?.dealer_id,
            'app_id': appId
        }
       });
       console.log({message:'customerSearchResponse', Data: customerSearchResponse?.data?.data});

        if (customerSearchResponse?.data?.data?.length > 0) {
            for (const customer of customerSearchResponse.data.data) {
                let firstName=customer?.customerDetails?.name?.firstName;
                let middleName=customer?.customerDetails?.name?.middleName;
                let lastName=customer?.customerDetails?.name?.lastName;
                
                // Filter out null, undefined, and empty values
                const nameParts = [firstName, middleName, lastName].filter(part => part && part.trim().length > 0);
                const customerName = nameParts.length > 0 ? nameParts.join(' ') : "Test Customer";
                console.log({message:'customerName', customerName});
                matchedContactInfo.push({
                    id: customer.id,
                    name: customerName,
                    additionalInfo: customer
                });
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
    } finally {
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

   
}

async function findContactWithName({ user, authHeader, name }) {
    console.log({message:'findContactWithName', user, authHeader, name});
    
    const matchedContactInfo = [];
    
    try {
        // Parse the name to extract firstName and lastName
        const nameParts = name.trim().split(/\s+/).filter(part => part.length > 0);
        const firstName = nameParts[0] || '';
        const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : '';
        
        console.log({message:'parsed name parts', firstName, lastName});
        
        const accessToken = await getAccessToken();
        const appId = process.env.TEKION_APP_ID;
         
        // Build query parameters
        const queryParams = new URLSearchParams();
        if (firstName) queryParams.append('firstName', firstName);
        if (lastName) queryParams.append('lastName', lastName);
        
        const apiUrl = `https://api-sandbox.tekioncloud.com/openapi/v4.0.0/customers?${queryParams.toString()}`;
        console.log({message:'API URL', apiUrl});
        
        const customerSearchResponse = await axios.get(apiUrl, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'dealer_id': user?.platformAdditionalInfo?.dealer_id,
                'app_id': appId
            }
        });
        console.log({message:'customerSearchResponse', Data: customerSearchResponse?.data?.data});

        if (customerSearchResponse?.data?.data?.length > 0) {
            for (const customer of customerSearchResponse.data.data) {
                let firstName = customer?.customerDetails?.name?.firstName;
                let middleName = customer?.customerDetails?.name?.middleName;
                let lastName = customer?.customerDetails?.name?.lastName;
                
                // Filter out null, undefined, and empty values
                const nameParts = [firstName, middleName, lastName].filter(part => part && part.trim().length > 0);
                const customerName = nameParts.length > 0 ? nameParts.join(' ') : "Test Customer";
                console.log({message:'customerName', customerName});
                matchedContactInfo.push({
                    id: customer.id,
                    name: customerName,
                    additionalInfo: customer,
                    type: 'customer'
                });
            }
        }
        
        return {
            successful: true,
            matchedContactInfo
        };
    } catch (e) {
        console.error('Tekion findContactWithName error:', e);
        return {
            successful: false,
            matchedContactInfo: null,
            error: e.message || 'Unknown error occurred'
        };
    }
}

async function createContact({ user, authHeader, contactInfo,phoneNumber, newContactName, newContactType}) {
    try {
       
        console.log({message:'createContact', newContactName});

        // Parse the contact name
        const nameParts = (newContactName || '').split(' ').filter(part => part.trim().length > 0);
        const firstName = nameParts[0] || '';
        const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : '';
        const middleName = nameParts.length > 2 ? nameParts.slice(1, -1).join(' ') : '';

        // Get access token and app ID
        const accessToken = await getAccessToken();
        const appId = process.env.TEKION_APP_ID;

        console.log({firstName, middleName, lastName});

        // Prepare contact data for Tekion API with the required structure
        const newContactData = {
            status: "ACTIVE",
            customerDetails: {
                customerType: "INDIVIDUAL",
                name: {
                    firstName: firstName,
                    middleName: middleName,
                    lastName: lastName
                        
                    }
            }
        };

        console.log({message: 'Creating contact with data', newContactData});

        // Make the API call to create contact
        const createResponse = await axios.post(
            'https://api-sandbox.tekioncloud.com/openapi/v4.0.0/customers',
            newContactData,
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'dealer_id': user?.platformAdditionalInfo?.dealer_id,
                    'app_id': appId,
                    'Content-Type': 'application/json'
                }
            }
        );

        const newContact = createResponse.data;
        console.log({message: 'Contact created successfully', newContact});
        
        return {
            successful: true,
            contactInfo: {
                id: newContact?.data?.id,
                name: `${firstName} ${middleName} ${lastName}`.trim().replace(/\s+/g, ' '),
                type: 'customer'
            },
            returnMessage: {
                messageType: 'success',
                message: `Contact created in Tekion.`,
                ttl: 3000
            }
        };
    } catch (e) {
        console.error({message:'Tekion createContact error:',ErrorDetails: e.response?.data?.errorDetails});
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

async function createCallLog({ user, contactInfo, callLog, authHeader, additionalSubmission, isNew, note, composedLogDetails }) {

    try {
        console.log({message:'createCallLog', note, composedLogDetails, callLogNote: callLog.note});

        const accessToken = await getAccessToken();
        const appId = process.env.TEKION_APP_ID;

        // Schedule appointment for 2 hours from now to ensure slot availability
        const futureAppointmentTime = Date.now() + (2 * 60 * 60 * 1000); // 2 hours from now
        
        // Combine all available notes/comments
        const allComments = [
            callLog.note,
            note,
            composedLogDetails
        ].filter(comment => comment && comment.trim().length > 0).join(' | ');
        
        // Prepare call log data for Tekion API
        const callLogData = {
            shopId: "accf06b4-0bb1-404e-9eec-4461c1ff7022",
            transportationTypeId: "2c845b8d-a5cd-4fd1-8761-a5d302e79949",
            serviceAdvisorId: "TEK00",
            appointmentDateTime: 1783928982048, //TODO: Replace with futureAppointmentTime
            customer: {
                id: contactInfo.id,
                customerType: "INDIVIDUAL",
                firstName: contactInfo.firstName || "",
                lastName: contactInfo.lastName || "",
                companyName: "",
                phones: [
                    {
                        phoneType: "HOME",
                        number: callLog.fromNumber || callLog.toNumber || "",
                        isPrimary: false
                    }
                ],
                preferredContactType: "EMAIL",
                email:user?.platformAdditionalInfo?.emailId || ""
            },
            vehicle: {
                year: "2017",
                make: "GMC",
                model: "Serra 1500"
            },
            deliveryContactSameAsCustomer: false,
            deliveryContact: {},
            jobs: [],
            notifyCustomer: false,
            customerComments: allComments || "Appointment created from call log",
            postTaxTotalAmount: {
                amount: 1,
                currency: "USD"
            }
        };

        // Add any additional submission data
        if (additionalSubmission) {
            Object.assign(callLogData, additionalSubmission);
        }

       const createResponse = await axios.post('https://api-sandbox.tekioncloud.com/openapi/v3.1.0/appointments', callLogData, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'dealer_id': user?.platformAdditionalInfo?.dealer_id,
                'app_id': appId,
                'Content-Type': 'application/json'
            }
        });

        const createdLog = createResponse.data;

        console.log({message:'createdLog', createdLog});

        return {
            successful: true,
            logId: createdLog?.data?.id || createdLog?.id,
            returnMessage: {
                messageType: 'success',
                message: `Call logged in Tekion.`,
                ttl: 3000
            }
        };
    } catch (e) {
        console.error({message:'Tekion createCallLog error:',ErrorDetails: e.response?.data?.message});
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

async function updateCallLog({ user, existingCallLog, authHeader, recordingLink, subject, note, startTime, duration, result, aiNote, transcript, additionalSubmission, composedLogDetails, existingCallLogDetails, hashedAccountId }) {

    try {
        const accessToken = await getAccessToken();
        const appId = process.env.TEKION_APP_ID;

        // Get the appointment ID from existingCallLog
        const appointmentId = existingCallLog.thirdPartyLogId;
        
        // Use existing appointment data and only update customerComments
        const existingAppointment = existingCallLogDetails || {};
        
        // Build updated customer comments with subject and note
        let updatedComments = '';
        
        // Always use individual note and subject if provided, otherwise use composedLogDetails
        if (note || subject) {
            // Build formatted comments with updated note and subject
            const commentParts = [];
            if (note) commentParts.push(note);
            if (subject) commentParts.push(`- Summary: ${subject}`);
            
            // Add other existing details if they exist in existing appointment
            const existingComments = existingAppointment.customerComments || '';
            const existingLines = existingComments.split('\n');
            
            // Preserve non-note, non-summary lines (like Contact Number, Date/Time, Duration, Result)
            const preservedLines = existingLines.filter(line => 
                !line.includes('- Note:') && 
                !line.includes('- Summary:') &&
                !line.includes(' | ') &&
                line.trim().length > 0 &&
                (line.includes('- Contact Number:') || 
                 line.includes('- Date/Time:') || 
                 line.includes('- Duration:') || 
                 line.includes('- Result:'))
            );
            
            let baseComment = commentParts.join(' | ');
            if (preservedLines.length > 0) {
                baseComment += '\n' + preservedLines.join('\n');
            }
            
            updatedComments = baseComment;
        } else if (composedLogDetails) {
            updatedComments = composedLogDetails;
        } else {
            updatedComments = existingAppointment.customerComments || '';
        }
        
        // Ensure required fields are present with defaults if missing
        const updateCallLogBody = {
            ...existingAppointment,  // Use all existing appointment data
            id: appointmentId,       // Add/override the ID
            customerComments: updatedComments,  // Update only the comments
            // Ensure required fields are present
            jobs: existingAppointment.jobs || [],
            customer: {
                ...existingAppointment.customer,
                phones: existingAppointment.customer?.phones || [
                    {
                        phoneType: "HOME",
                        number:  "",
                        isPrimary: false
                    }
                ]
            }
        };

        console.log({message: 'Updating appointment with data', updateCallLogBody});

        const updateResponse = await axios.put(`https://api-sandbox.tekioncloud.com/openapi/v3.1.0/appointments`, updateCallLogBody, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'dealer_id': user?.platformAdditionalInfo?.dealer_id,
                'app_id': appId,
                'Content-Type': 'application/json'
            }
        });
        
        console.log({message:'updateResponse', Data: updateResponse?.data?.data});
        
        return {
            successful: true,
            returnMessage: {
                messageType: 'success',
                message: 'Call log updated in Tekion.',
                ttl: 3000
            }
        };
    } catch (e) {
        console.error({message:'Tekion updateCallLog error:',e, ErrorDetails: e.response?.data?.message});
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

}

async function updateMessageLog({ user, existingLogId, contactInfo, message, authHeader, additionalSubmission }) {
}

async function getLicenseStatus({ user, authHeader }) {
}

async function getCallLog({ user, callLogId, authHeader }) {
    try {
        const accessToken = await getAccessToken();
        const appId = process.env.TEKION_APP_ID;

        const getLogResponse = await axios.get(`https://api-sandbox.tekioncloud.com/openapi/v3.1.0/appointments?id=${callLogId}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'dealer_id': user?.platformAdditionalInfo?.dealer_id,
                'app_id': appId,
                'Content-Type': 'application/json'
            }
        });
        console.log({message:'getLogResponse', Data: getLogResponse?.data?.data});
        if(getLogResponse?.data?.data?.length > 0) {
            const callLog = getLogResponse?.data?.data[0];
            
            // Extract the original note from customerComments (before the " | " separator)
            const customerComments = callLog?.customerComments || '';
            const originalNote = customerComments.split(' | ')[0] || '';
            
            // Extract subject from "- Summary: " line in customerComments
            const summaryMatch = customerComments.match(/- Summary: (.*?)(?=\n|$)/);
            const subject = summaryMatch ? summaryMatch[1].trim() : '';
            
            return {
                successful: true,
                callLogInfo: {
                    subject: subject,
                    note: originalNote,
                    fullBody: customerComments,
                    fullLogResponse: callLog,
                    contactName: `${callLog?.customer?.firstName} ${callLog?.customer?.lastName}`.trim()
                }
            };
        }
        else {
            return {
                successful: false,
                returnMessage: {
                    messageType: 'warning',
                    message: 'Call log not found in Tekion.',
                    ttl: 3000
                }
            };
        }
        
    } catch (e) {
        console.error({message:'Tekion getCallLog error:',ErrorDetails: e.response?.data?.message});
        return {
            successful: false,
            returnMessage: {
                messageType: 'warning',
                message: 'Failed to get call log in Tekion.',
                ttl: 3000
            }
        };
    }
}

async function upsertCallDisposition({ user, existingCallLog, authHeader, dispositions }) {
    return{
        logId: existingCallLog.thirdPartyLogId
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
    getBasicAuth,
    findContactWithName,
    getCallLog,
    upsertCallDisposition
};
