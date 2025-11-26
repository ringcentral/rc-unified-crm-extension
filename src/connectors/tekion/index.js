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

// Tekion uses apiKey authentication with custom token management

function getBasicAuth({ apiKey }) {
    return Buffer.from(`${apiKey}`).toString('base64');
}

// Helper function to get access token (for initial generation)
async function generateAccessToken() {
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
        return {
            access_token: response.data?.data?.access_token,
            expires_in: response.data?.data?.expires_in || 3600 // Default to 1 hour if not provided
        };
    } catch (error) {
        console.error('Error getting Tekion access token:', error);
        throw error;
    }
}

// Custom token management for Tekion with apiKey authentication
async function checkAndRefreshAccessToken(user, tokenLockTimeout = 20) {
    const now = moment();
    const tekionAccessToken = user.platformAdditionalInfo?.tekionAccessToken;
    const tokenExpiry = user.platformAdditionalInfo?.tekionTokenExpiry ? moment(user.platformAdditionalInfo.tekionTokenExpiry) : null;
    const expiryBuffer = 2; // 2 minutes

    // Check if token will expire within the buffer time or doesn't exist

    if (!tekionAccessToken || !tokenExpiry || tokenExpiry.isBefore(now.clone().add(expiryBuffer, 'minutes'))) {
        console.log('Tekion token needs refresh or generation...');
        
        try {
            const tokenResponse = await generateAccessToken();
            
            // Update user with new token in platformAdditionalInfo
            user.platformAdditionalInfo = {
                ...user.platformAdditionalInfo,
                tekionAccessToken: tokenResponse.access_token,
                tekionTokenExpiry: now.clone().add(tokenResponse.expires_in, 'seconds').toDate()
            };
            
            await user.save();
            console.log('Tekion token refreshed/generated successfully');
        } catch (error) {
            console.error('Error refreshing Tekion token:', error);
            throw error;
        }
    }
    
    return user;
}

// Helper function to get current valid access token
async function getCurrentAccessToken(user) {
    const tekionAccessToken = user.platformAdditionalInfo?.tekionAccessToken;
    const tokenExpiry = user.platformAdditionalInfo?.tekionTokenExpiry;
    
    console.log({message:'getCurrentAccessToken', user: user.id, tekionAccessToken, tokenExpiry});
    
    if (!tekionAccessToken) {
        // Generate initial token
        const tokenResponse = await generateAccessToken();
        user.platformAdditionalInfo = {
            ...user.platformAdditionalInfo,
            tekionAccessToken: tokenResponse.access_token,
            tekionTokenExpiry: moment().add(tokenResponse.expires_in, 'seconds').toDate()
        };
        await user.save();
        return tokenResponse.access_token;
    }
    
    // Check if token needs refresh
    const now = moment();
    const expiryMoment = moment(tokenExpiry);
    const expiryBuffer = 2; // 2 minutes
    
    if (expiryMoment.isBefore(now.clone().add(expiryBuffer, 'minutes'))) {
        // Token needs refresh
        const tokenResponse = await generateAccessToken();
        user.platformAdditionalInfo = {
            ...user.platformAdditionalInfo,
            tekionAccessToken: tokenResponse.access_token,
            tekionTokenExpiry: now.clone().add(tokenResponse.expires_in, 'seconds').toDate()
        };
        await user.save();
        return tokenResponse.access_token;
    }
    
    return tekionAccessToken;
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
        
        // Generate initial access token
        const tokenResponse = await generateAccessToken();
        const accessToken = tokenResponse.access_token;
        const expiresIn = tokenResponse.expires_in;

        console.log({message:'accessToken fetched successfully', accessToken});

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
            
            // Calculate token expiry
            const tokenExpiry = moment().add(expiresIn, 'seconds').toDate();
            
            return {
                successful: true,
                platformUserInfo: {
                    id,
                    name,
                    timezoneName,
                    timezoneOffset,
                    platformAdditionalInfo: {
                        dealer_id: dealer_id,
                        emailId: emailId,
                        tekionAccessToken: accessToken,
                        tekionTokenExpiry: tokenExpiry
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
    // Clear Tekion credentials from platformAdditionalInfo
    if (user.platformAdditionalInfo) {
        user.platformAdditionalInfo = {
            ...user.platformAdditionalInfo,
            tekionAccessToken: '',
            tekionTokenExpiry: null
        };
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
       // Use stored token with automatic refresh
       const accessToken = await getCurrentAccessToken(user);
       const appId = process.env.TEKION_APP_ID;
        
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

        const leadSearchResponse = await axios.get(`https://api-sandbox.tekioncloud.com/openapi/v3.1.0/crm-leads?phone=${phoneNumberWithoutCountryCode}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'dealer_id': user?.platformAdditionalInfo?.dealer_id,
                'app_id': appId
            }
        });
        console.log({message:'leadSearchResponse', Data: leadSearchResponse?.data?.data});

        if (leadSearchResponse?.data?.data?.length > 0) {
            for (const lead of leadSearchResponse.data.data) {
                let firstName = lead?.customers?.length > 0 ? lead?.customers[0]?.firstName : "";
                let middleName = lead?.customers?.length > 0 ? lead?.customers[0]?.middleName : "";
                let lastName = lead?.customers?.length > 0 ? lead?.customers[0]?.lastName : "";
                let leadName = [firstName, middleName, lastName].filter(part => part && part.trim().length > 0).join(' ');
                matchedContactInfo.push({
                    id: lead.id,
                    name: leadName,
                    additionalInfo: lead
                });
            }
        }

        return {
            successful: true,
            matchedContactInfo
        };
    } catch (e) {
        console.error({m:'Tekion findContact error:',e, ErrorDetails: e.response?.data?.errorDetails});
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
        
        // Use stored token with automatic refresh
        const accessToken = await getCurrentAccessToken(user);
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
       
        console.log({message:'createContact', newContactName, phoneNumber, newContactType});

        // Parse the contact name
        const nameParts = (newContactName || '').split(' ').filter(part => part.trim().length > 0);
        const firstName = nameParts[0] || '';
        const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : '';
        const middleName = nameParts.length > 2 ? nameParts.slice(1, -1).join(' ') : '';

        // Use stored token with automatic refresh
        const accessToken = await getCurrentAccessToken(user);
        const appId = process.env.TEKION_APP_ID;

        console.log({firstName, middleName, lastName});

        const phoneNumberObj = parsePhoneNumber(phoneNumber);
    let phoneNumberWithoutCountryCode = phoneNumber;
    if (phoneNumberObj.valid) {
        phoneNumberWithoutCountryCode = phoneNumberObj.number.significant;
    }

        // Prepare contact data for Tekion API v3.1.0 structure
        const newContactData = {
            customerType: "INDIVIDUAL",
            firstName: firstName,
            lastName: lastName,
            middleName: middleName || "",
            companyName:"", // Use middleName as company if provided
            status: "ACTIVE",
            phones: [
                {
                    phoneType: "MOBILE",
                    number: phoneNumber || "",
                    isPrimary: true
                }
            ],
            preferredContactType: "Call",
            email: ""
        };

        if(newContactType === 'customer'){
            const createResponse = await axios.post(
                'https://api-sandbox.tekioncloud.com/openapi/v3.1.0/customers',
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
            
            return {
                successful: true,
                contactInfo: {
                    id: newContact?.id,
                    name: `${firstName} ${lastName}`.trim(),
                    type: 'customer',
                    phoneNumber: phoneNumber
                },
                returnMessage: {
                    messageType: 'success',
                    message: `Contact created in Tekion.`,
                    ttl: 3000
                }
            };
        }
        else if(newContactType === 'lead'){
           const leadRequestBody = {
            status: "ACTIVE",
            department: "SALES",
            source: {
                sourceType: "INTERNET",
                sourceName: "App Connect"
            },
            customers:[
                {
                    type:"BUYER",
                    firstName:firstName,
                    lastName:lastName,
                    middleName:middleName,
                    phones: [
                        {
                            type: "WORK",
                            number: phoneNumberWithoutCountryCode
                        }
                    ]
                }
            ]

           };
           const leadResponse = await axios.post(
            'https://api-sandbox.tekioncloud.com/openapi/v3.1.0/crm-leads',
            leadRequestBody,
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'dealer_id': user?.platformAdditionalInfo?.dealer_id,
                    'app_id': appId,
                    'Content-Type': 'application/json'
                }
            }
           );
           const newLead = leadResponse.data;
           console.log({message:'newLead', newLead, Id: newLead?.data?.id});
           return {
            successful: true,
            contactInfo: {
                id: newLead?.data?.id,
                name: `${firstName} ${lastName}`.trim(),
                type: 'lead',
                phoneNumber: phoneNumber
            },
            returnMessage: {
                messageType: 'success',
                message: `Lead created in Tekion.`,
                ttl: 3000
            }
           };
        }
        else{
            return {
                successful: false,
                returnMessage: {
                    messageType: 'warning',
                    message: 'Invalid contact type.',
                    ttl: 3000
                }
            };
        }
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

async function createCallLog({ user, contactInfo, callLog, authHeader, additionalSubmission, isNew, note, composedLogDetails,aiNote,
    transcript,
    ringSenseTranscript,
    ringSenseSummary,
    ringSenseAIScore,
    ringSenseBulletedSummary,
    ringSenseLink,
    hashedAccountId }) {

    try {
        console.log({user, contactInfo, callLog, authHeader, additionalSubmission, isNew, note, composedLogDetails});

        // Use stored token with automatic refresh
        const accessToken = await getCurrentAccessToken(user);
        const appId = process.env.TEKION_APP_ID;

        // Schedule appointment for 2 hours from now to ensure slot availability
        const futureAppointmentTime = Date.now() + (2 * 60 * 60 * 1000); // 2 hours from now
        
        // Combine all available notes/comments
        // const allComments = [
        //     callLog.note,
        //     note,
        //     composedLogDetails
        // ].filter(comment => comment && comment.trim().length > 0).join(' | ');

        // const customerPhoneDetails = extractPhoneDetails(contactInfo.phoneNumber);
        // console.log({message: 'Extracted phone details', customerPhoneDetails, originalPhone: contactInfo.phoneNumber});

        // const createCallLogData={
        //     externalId:callLog?.sessionId,
        //     direction:callLog?.direction,
        //     department:"RETAIL", //Hardcoded for now
        //     createdByUserId:user?.platformAdditionalInfo?.id, //TODO: need to check if customer id need to replace
        //     createdBySource:"APP_CONNECT",
        //     communicationDetail: {
        //         callDetails: {
        //             startTime: callLog.startTime,
        //             endTime: callLog.endTime,
        //             duration: callLog.duration,
        //             status: callLog.result,
        //             notes:  [
        //                 note??"",
        //             ]
        //         },
        //         customer: {
        //             phone: {
        //                 countryCode: customerPhoneDetails.countryCode,
        //                 number: customerPhoneDetails.number
        //             }
        //         },
        //         employee: {
        //             id: user?.id,
        //             phone:{
        //                 countryCode: customerPhoneDetails.countryCode,
        //                 number: customerPhoneDetails.number
        //             }

        //         }
        //     }
        // }
        // Prepare call log data for Tekion API
        const callLogData = {
            shopId: "accf06b4-0bb1-404e-9eec-4461c1ff7022",
            transportationTypeId: "2c845b8d-a5cd-4fd1-8761-a5d302e79949",
            serviceAdvisorId: "TEK00",
            appointmentDateTime: 1764155528, //TODO: Replace with futureAppointmentTime
            customer: {
                id: contactInfo.id,
                customerType: "INDIVIDUAL",
                firstName: contactInfo.firstName || "",
                lastName: contactInfo.lastName || "",
                companyName: "",
                phones: [
                    {
                        phoneType: "HOME",
                        number: contactInfo.phoneNumber || "",
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
            customerComments: composedLogDetails || "Appointment created from call log",
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

    console.log({message:'updateCallLog', existingCallLog, authHeader, recordingLink, subject, note, startTime, duration, result, aiNote, transcript, additionalSubmission, composedLogDetails, existingCallLogDetails, hashedAccountId});
    try {
        // Use stored token with automatic refresh
        const accessToken = await getCurrentAccessToken(user);
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
        // Use stored token with automatic refresh
        const accessToken = await getCurrentAccessToken(user);
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
            
            const customerComments = callLog?.customerComments || '';
            let originalNote = '';
            let subject = '';
            
            // Check if customerComments has the " | " separator format
            if (customerComments.includes(' | ')) {
                // Extract the original note from customerComments (before the " | " separator)
                originalNote = customerComments.split(' | ')[0] || '';
                
                // Extract subject from "- Summary: " line in customerComments
                const summaryMatch = customerComments.match(/- Summary: (.*?)(?=\n|$)/);
                subject = summaryMatch ? summaryMatch[1].trim() : '';
            } else {
                // Handle cases where customerComments contains formatted content without pipe separator
                // Look for "- Note: " pattern to extract just the note content
                const noteMatch = customerComments.match(/- Note: (.*?)(?=\n|$)/);
                if (noteMatch) {
                    originalNote = noteMatch[1].trim();
                } else {
                    // If no "- Note: " pattern, check if the first line before any "- " patterns is the note
                    const lines = customerComments.split('\n');
                    const firstLine = lines[0]?.trim();
                    if (firstLine && !firstLine.startsWith('- ')) {
                        originalNote = firstLine;
                    }
                }
                
                // Extract subject from "- Summary: " line in customerComments
                const summaryMatch = customerComments.match(/- Summary: (.*?)(?=\n|$)/);
                subject = summaryMatch ? summaryMatch[1].trim() : '';
            }
            
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

// Extract phone number and country code
const extractPhoneDetails = (phoneNumber) => {
    if (!phoneNumber) return { countryCode: '+1', number: '' };
    
    try {
        const phoneObj = parsePhoneNumber(phoneNumber);
        if (phoneObj.valid) {
            return {
                countryCode: `+${phoneObj.countryCode}`,
                number: phoneObj.number.significant
            };
        }
    } catch (error) {
        console.log('Error parsing phone number:', error);
    }
    
    // Fallback: Manual parsing for common formats
    if (phoneNumber.startsWith('+')) {
        if (phoneNumber.startsWith('+1') && phoneNumber.length === 12) {
            return {
                countryCode: '+1',
                number: phoneNumber.substring(2)
            };
        }
        // Add more country code patterns as needed
        return {
            countryCode: '+1', // Default
            number: phoneNumber.replace(/[^\d]/g, '')
        };
    }
    
    // No country code, assume US/Canada (+1)
    return {
        countryCode: '+1',
        number: phoneNumber.replace(/[^\d]/g, '')
    };
};
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
    upsertCallDisposition,
    checkAndRefreshAccessToken
};
