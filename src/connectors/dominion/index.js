const axios = require('axios');
const moment = require('moment-timezone');
const url = require('url');
const crypto = require('crypto');
const xml2js = require('xml2js');
const { parsePhoneNumber } = require('awesome-phonenumber');
const { LOG_DETAILS_FORMAT_TYPE } = require('@app-connect/core/lib/constants');

function getAuthType() {
    return 'apiKey';
}

function getLogFormatType() {
    return LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT;
}

function getBasicAuth({ apiKey }) {
    // For Dominion, return the apiKey directly
    // The token management will be handled in getUserInfo
    return apiKey;
}

// Helper function to get or refresh access token
async function getValidAccessToken({ credentials, existingToken, tokenExpiry }) {
    // Check if existing token is still valid (with 5 minute buffer)
    if (existingToken && tokenExpiry) {
        const expiryTime = new Date(tokenExpiry);
        const bufferTime = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now
        
        if (expiryTime > bufferTime) {
            console.log('Using cached access token');
            return {
                accessToken: existingToken,
                tokenExpiry: expiryTime,
                isNewToken: false
            };
        }
    }
    
    console.log('Getting new access token from Dominion DMS');
    
    // Prepare the form-encoded data for the token request
    const tokenData = new URLSearchParams();
    tokenData.append('grant_type', 'client_credentials');
    tokenData.append('client_id', process.env.DOMINIONDMS_VUE_QA_CLIENT_ID);
    tokenData.append('client_secret', process.env.DOMINIONDMS_VUE_QA_CLIENT_SECRET);
    tokenData.append('scope', 'GetCustomerInformation.S5.12.4-D1.0 GetPersonnel.S5.12.4-D1.0 GetServiceAppointment.S5.12.4-D1.0 GetSalesLead.S5.12.4-D1.0 ProcessServiceAppointment.S5.12.4-D1.0');

    console.log('Making authentication request to:', 'https://vueauthentication.qa-dominiondms.com/connect/token');
    
    // Make the actual API request to Dominion DMS authentication endpoint
    const tokenResponse = await axios.post(
        `${process.env.DOMINIONDMS_VUE_QA_AUTH_URL}/connect/token`,
        tokenData,
        {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        }
    );

    console.log('New token response:', tokenResponse.data);
    
    // Calculate expiry time
    const expiresIn = tokenResponse.data.expires_in || 3600; // Default to 1 hour
    const expiryTime = new Date(Date.now() + expiresIn * 1000);
    
    return {
        accessToken: tokenResponse.data.access_token,
        tokenExpiry: expiryTime,
        isNewToken: true
    };
}

async function getUserInfo({ authHeader, hostname, additionalInfo, apiKey, user }) {
    try {
        console.log({message:'Making API call to get user info from Dominion DMS', authHeader, hostname, additionalInfo});
        
        // Parse credentials from apiKey or additionalInfo
        let credentials;
        try {
            // Try to parse apiKey as JSON (initial credentials)
            credentials = JSON.parse(apiKey);
        } catch (e) {
            // If not JSON, use additionalInfo
            credentials = additionalInfo || {};
        }
        
        const { partyId, dealerNumberId, bodVersion, employeeNumber } = credentials;
        
        if (!partyId || !dealerNumberId || !bodVersion) {
            throw new Error('Missing required parameters: partyId, dealerNumberId, or bodVersion');
        }
        
        // Get valid access token (cached or new)
        const tokenInfo = await getValidAccessToken({
            credentials,
            existingToken: user?.accessToken,
            tokenExpiry: user?.tokenExpiry
        });
        
        const { accessToken, tokenExpiry, isNewToken } = tokenInfo;

        // Build the API URL - Use integration endpoint for API calls
        const apiUrl = `${process.env.DOMINIONDMS_VUE_QA_BASE_URL}/secureapi/GetPersonnel/${partyId}/${dealerNumberId}/${bodVersion}`;
        
        // Generate unique BODID for this request
        const bodId = crypto.randomUUID();
        const currentDateTime = new Date().toISOString();
        
        // Create XML payload for GetPersonnel request
        const xmlPayload = `<?xml version="1.0" encoding="UTF-8"?>
<GetPersonnel releaseID="${bodVersion}" xmlns="http://www.starstandard.org/STAR/5" xmlns:oagis="http://www.openapplications.org/oagis/9">
    <ApplicationArea>
        <Sender>
            <CreatorNameCode>RingCentral</CreatorNameCode>
            <SenderNameCode>RingCentral</SenderNameCode>
            <PartyID>${partyId}</PartyID>
        </Sender>
        <CreationDateTime>${currentDateTime}</CreationDateTime>
        <BODID>${bodId}</BODID>
        <Destination>
            <DestinationNameCode>Dominion</DestinationNameCode>
            <DealerNumberID>${dealerNumberId}</DealerNumberID>
            <ServiceMessageID>${bodVersion}</ServiceMessageID>
        </Destination>
    </ApplicationArea>
    <GetPersonnelDataArea>
        <Get maxItems="250" recordSetStartNumber="1">
            <oagis:Expression>Get Personnel</oagis:Expression>
        </Get>
        <Personnel>
            <PersonnelHeaderBase>
                <DocumentIdentificationGroup>
                    <DocumentIdentification>
                        <DocumentID>N/A</DocumentID>
                    </DocumentIdentification>    
                </DocumentIdentificationGroup>
            </PersonnelHeaderBase>
            <PersonnelDetail>
                <EmployeePerson>
                    <DealerManagementSystemID>${employeeNumber || 'RING001'}</DealerManagementSystemID>
                </EmployeePerson>
            </PersonnelDetail>
        </Personnel>
    </GetPersonnelDataArea>
</GetPersonnel>`;

        console.log('Making GetPersonnel API call to:', apiUrl);
        console.log('Request payload:', xmlPayload, authHeader);

        // Make the API request to Dominion DMS
        const response = await axios.post(apiUrl, xmlPayload, {
            headers: {
                'Content-Type': 'application/xml',
                'Accept': 'application/xml',
                'Authorization': `Bearer ${accessToken}`
            },
            timeout: 30000 // 30 second timeout
        });

        console.log('GetPersonnel API response received:', response.status);
        console.log('Response data:', response.data);

        // Parse XML response using xml2js
        let userInfo = {
        };
        // Parse XML response to extract user information  
            try {
                const parser = new xml2js.Parser({
                    explicitArray: false,
                    ignoreAttrs: false,
                    mergeAttrs: true
                });
                
                const parsedXml = await parser.parseStringPromise(response.data);
                console.log('Parsed XML response:', JSON.stringify(parsedXml, null, 2));
                
                // Navigate through the XML structure to find Personnel information
                // Response structure: ShowPersonnel -> ShowPersonnelDataArea -> Personnel -> PersonnelDetail -> EmployeePerson
                const personnel = parsedXml.ShowPersonnel?.ShowPersonnelDataArea?.Personnel;
                
                if (personnel) {
                    const employeePerson = personnel.PersonnelDetail?.EmployeePerson;
                    
                    if (employeePerson) {
                        // Extract DealerManagementSystemID
                        if (employeePerson.DealerManagementSystemID) {
                            userInfo.id = employeePerson.DealerManagementSystemID.toString();
                        }
                        
                        // Extract person details
                        const specifiedPerson = employeePerson.SpecifiedPerson;
                        if (specifiedPerson) {
                            // Extract name
                            const givenName = specifiedPerson.GivenName || '';
                            const familyName = specifiedPerson.FamilyName || '';
                            
                            if (givenName || familyName) {
                                userInfo.name = `${givenName} ${familyName}`.trim();
                            }
                            
                            // Extract email from URICommunication
                            const uriCommunication = specifiedPerson.URICommunication;
                            if (uriCommunication) {
                                // Handle both single object and array of communications
                                const communications = Array.isArray(uriCommunication) ? uriCommunication : [uriCommunication];
                                
                                // Find email communication
                                const emailCommunication = communications.find(comm => 
                                    comm.ChannelCode === 'Email' || comm.ChannelCode === 'email'
                                );
                                
                                if (emailCommunication && emailCommunication.URIID) {
                                    userInfo.email = emailCommunication.URIID;
                                }
                            }
                            
                            // Extract status
                            if (specifiedPerson.CustomerStatusCode) {
                                userInfo.status = specifiedPerson.CustomerStatusCode;
                            }
                        }
                    }
                }
                
                console.log('Extracted user info:', userInfo);
                
            } catch (xmlError) {
                console.log('Error parsing XML response:', xmlError.message);
                console.log('Falling back to regex parsing...');
                
                // Fallback to basic regex parsing if XML parsing fails
                const nameMatch = response.data.match(/<GivenName[^>]*>([^<]+)<\/GivenName>/);
                const surnameMatch = response.data.match(/<FamilyName[^>]*>([^<]+)<\/FamilyName>/);
                const emailMatch = response.data.match(/<URIID[^>]*>([^<]+)<\/URIID>/);
                const idMatch = response.data.match(/<DealerManagementSystemID[^>]*>([^<]+)<\/DealerManagementSystemID>/);
                
                if (nameMatch && surnameMatch) {
                    userInfo.name = `${nameMatch[1]} ${surnameMatch[1]}`;
                } else if (nameMatch) {
                    userInfo.name = nameMatch[1];
                }
                
                if (emailMatch) {
                    userInfo.email = emailMatch[1];
                }
                
                if (idMatch) {
                    userInfo.id = idMatch[1];
                }
            }
        const id = `${userInfo?.id}-dominion`;
        
        return {
            successful: true,
            platformUserInfo: {
                id,
                name: userInfo.name,
                accessToken, // Store the access token for reuse
                tokenExpiry: tokenExpiry.toISOString(), // Store expiry time
                overridingApiKey: accessToken, // This will be stored as the user's accessToken
                platformAdditionalInfo: {
                    email: userInfo.email,
                    timezone: null,
                    company: null,
                    partyId,
                    dealerNumberId,
                    bodVersion,
                    role: null,
                    status: userInfo.status,
                    employeeNumber: employeeNumber
                }
            },
            returnMessage: {
                messageType: isNewToken ? 'success' : 'info',
                message: isNewToken ? 'Connected to Dominion DMS with new access token.' : 'Connected to Dominion DMS using cached token.',
                ttl: 1000
            }
        };
    } catch (error) {
        console.log('Error in getUserInfo:', error);
        let errorMessage = 'Could not load user information from Dominion DMS. Please check your credentials and try again.';
        if (error.response?.status === 401) {
            errorMessage = 'Authentication failed. Please check your access token.';
        } else if (error.response?.status === 403) {
            errorMessage = 'Access denied. Please check your permissions.';
        } else if (error.response?.status >= 500) {
            errorMessage = 'Dominion DMS server error. Please try again later.';
        } 
        
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
                                text: errorMessage
                            }
                        ]
                    }
                ],
                ttl: 3000
            }
        };
    }
}

// Generic helper function for getting valid access token for any Dominion API call
async function getDominionAccessToken(user) {
    const credentials = {
        partyId: user.platformAdditionalInfo?.partyId,
        dealerNumberId: user.platformAdditionalInfo?.dealerNumberId,
        bodVersion: user.platformAdditionalInfo?.bodVersion,
        employeeNumber: user.platformAdditionalInfo?.employeeNumber
    };
    
    const tokenInfo = await getValidAccessToken({
        credentials,
        existingToken: user?.accessToken,
        tokenExpiry: user?.tokenExpiry
    });
    
    return tokenInfo.accessToken;
}

async function getUserList({ user, authHeader }) {
    try {
        console.log('Making dummy API call to get user list from Dominion');
        
        // Simulate API response with dummy users
        const dummyUsers = [
            { id: 1, name: 'John Doe', email: 'john.doe@dominion.com' },
            { id: 2, name: 'Jane Smith', email: 'jane.smith@dominion.com' },
            { id: 3, name: 'Bob Johnson', email: 'bob.johnson@dominion.com' }
        ];

        return dummyUsers;
    } catch (error) {
        console.log('Error in getUserList:', error.message);
        return [];
    }
}

async function unAuthorize({ user }) {
    try {
        console.log('Clearing Dominion DMS authentication credentials');
        
        // For client credential flow, we just clear the stored credentials
        // No need to call a revoke endpoint since tokens are typically short-lived
        
        // Clear user credentials and additional info
        user.accessToken = '';
        user.refreshToken = '';
        user.additionalInfo = '';
        await user.save();
        
        return {
            returnMessage: {
                messageType: 'success',
                message: 'Logged out of Dominion DMS',
                ttl: 1000
            }
        };
    } catch (error) {
        console.log('Error in unAuthorize:', error.message);
        return {
            returnMessage: {
                messageType: 'error',
                message: 'Error during logout',
                ttl: 3000
            }
        };
    }
}

async function findContact({ user, authHeader, phoneNumber, overridingFormat, isExtension }) {
    if (isExtension === 'true') {
        return {
            successful: false,
            matchedContactInfo: []
        };
    }

    try {
        console.log('Making API call to search contacts in Dominion DMS');
        
        // Get valid access token (cached or new)
        const accessToken = await getDominionAccessToken(user);
        console.log('Using access token for contact search:', accessToken ? 'Token available' : 'No token');
        const phoneNumberObj = parsePhoneNumber(phoneNumber.replace(' ', '+'));
        const phoneNumberWithoutCountryCode = phoneNumberObj.number.significant;
        // Extract authentication information from the user object
        const partyId = user.platformAdditionalInfo?.partyId;
        const dealerNumberId = user.platformAdditionalInfo?.dealerNumberId;
        const bodVersion = user.platformAdditionalInfo?.bodVersion;
        
        if (!partyId || !dealerNumberId || !bodVersion) {
            throw new Error('Missing required parameters: partyId, dealerNumberId, or bodVersion');
        }

        // Build the API URL for GetCustomerInformation
        const apiUrl = `${process.env.DOMINIONDMS_VUE_QA_BASE_URL}/secureapi/GetCustomerInformation/${partyId}/${dealerNumberId}/${bodVersion}`;

        const matchedContactInfo = [];
        const bodId = crypto.randomUUID();
        const currentDateTime = new Date().toISOString();
            
        // Create XML payload for GetCustomerInformation request
        const xmlPayload = `<?xml version="1.0" encoding="UTF-8"?>
<GetCustomerInformation releaseID="${bodVersion}" xmlns="http://www.starstandard.org/STAR/5" xmlns:oagis="http://www.openapplications.org/oagis/9">
    <ApplicationArea>
        <Sender>
            <CreatorNameCode>RingCentral</CreatorNameCode>
            <SenderNameCode>RingCentral</SenderNameCode>
            <PartyID>${partyId}</PartyID>
        </Sender>
        <CreationDateTime>${currentDateTime}</CreationDateTime>
        <BODID>${bodId}</BODID>
        <Destination>
            <DestinationNameCode>Dominion</DestinationNameCode>
            <DealerNumberID>${dealerNumberId}</DealerNumberID>
            <ServiceMessageID>${bodVersion}</ServiceMessageID>
        </Destination>
    </ApplicationArea>
    <GetCustomerInformationDataArea>
        <Get maxItems="250" recordSetStartNumber="1">
            <oagis:Expression>Get Customer Information</oagis:Expression>
        </Get>
        <CustomerInformation>
            <CustomerInformationHeader>
                <DocumentIdentificationGroup>
                    <DocumentIdentification>
                        <DocumentID>N/A</DocumentID>
                    </DocumentIdentification>
                </DocumentIdentificationGroup>
                <TransactionTypeCode>N/A</TransactionTypeCode>
            </CustomerInformationHeader>
            <CustomerInformationDetail>
                <CustomerParty>
                    <SpecifiedPerson>
                        <TelephoneCommunication>
                            <ChannelCode>Telephone</ChannelCode>
                            <CompleteNumber>${phoneNumberWithoutCountryCode}</CompleteNumber>
                        </TelephoneCommunication>
                    </SpecifiedPerson>
                </CustomerParty>
            </CustomerInformationDetail>
        </CustomerInformation>
    </GetCustomerInformationDataArea>
</GetCustomerInformation>`;
                // Make the API request to Dominion DMS
                const response = await axios.post(apiUrl, xmlPayload, {
                    headers: {
                        'Content-Type': 'application/xml',
                        'Accept': 'application/xml',
                        'Authorization': `Bearer ${accessToken}`
                    },
                    timeout: 30000 // 30 second timeout
                });

                console.log('GetCustomerInformation API response received:', response.status);
                    
                        // Parse XML response using xml2js
                        const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: false });
                        const result = await parser.parseStringPromise(response.data);
                        
                        const showCustomerInfo = result.ShowCustomerInformation;
                        if (showCustomerInfo && showCustomerInfo.ShowCustomerInformationDataArea && 
                            showCustomerInfo.ShowCustomerInformationDataArea.CustomerInformation) {
                            
                            const customerInfo = showCustomerInfo.ShowCustomerInformationDataArea.CustomerInformation;
                            const customers = Array.isArray(customerInfo) ? customerInfo : [customerInfo];
                            
                            for (const customer of customers) {
                                if (customer.CustomerInformationDetail && customer.CustomerInformationDetail.CustomerParty) {
                                    const customerParty = customer.CustomerInformationDetail.CustomerParty;
                                    const specifiedPerson = customerParty.SpecifiedPerson;
                                    
                                    if (specifiedPerson) {
                                        const contact = {
                                            id: customerParty.DealerManagementSystemID?.toString(),
                                            name: '',
                                            phone: phoneNumberWithoutCountryCode,
                                            type: 'Customer',
                                            mostRecentActivityDate: new Date().toISOString(),
                                            additionalInfo: null
                                        };
                                        
                                        // Extract name (including middle name if available)
                                        const nameParts = [];
                                        if (specifiedPerson.GivenName) {
                                            nameParts.push(specifiedPerson.GivenName);
                                        }
                                        if (specifiedPerson.MiddleName) {
                                            nameParts.push(specifiedPerson.MiddleName);
                                        }
                                        if (specifiedPerson.FamilyName) {
                                            nameParts.push(specifiedPerson.FamilyName);
                                        }
                                        contact.name = nameParts.join(' ').trim();
                                        // Only add if not already exists
                                        if (!matchedContactInfo.some(c => c.id === contact.id)) {
                                            matchedContactInfo.push(contact);
                                        }
                                    }
                                }
                            }
                        }

        // Add "Create new contact" option
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
    } catch (error) {
        console.log('Error in findContact:', error);
        return {
            successful: false,
            matchedContactInfo: [],
            returnMessage: {
                messageType: 'warning',
                message: 'Unable to search for contacts in Dominion DMS',
                details: [
                    {
                        title: 'Details',
                        items: [
                            {
                                id: '1',
                                type: 'text',
                                text: `Error searching contacts: ${error.response?.data || error.message}`
                            }
                        ]
                    }
                ],
                ttl: 3000
            }
        };
    }
}

async function findContactWithName({ user, authHeader, name }) {
    try {
        console.log(`Making dummy API call to search contacts by name: ${name}`);
        
        // Simulate contact search by name
        const matchedContactInfo = [
            {
                id: Math.floor(Math.random() * 10000),
                name: name,
                phone: '+1234567890',
                email: `${name.toLowerCase().replace(' ', '.')}@example.com`,
                type: 'Contact',
                additionalInfo: {
                    opportunities: [
                        { const: '2001', title: 'New Business Opportunity' }
                    ]
                }
            }
        ];

        return {
            successful: true,
            matchedContactInfo
        };
    } catch (error) {
        console.log('Error in findContactWithName:', error.message);
        return {
            successful: false,
            returnMessage: {
                messageType: 'warning',
                message: 'Error searching contacts by name',
                ttl: 3000
            }
        };
    }
}

async function createContact({ user, authHeader, phoneNumber, newContactName, newContactType }) {
    try {
        console.log(`Making dummy API call to create contact: ${newContactName}`);
        
        const nameParts = splitName(newContactName);
        const newContactId = Math.floor(Math.random() * 10000);

        // Simulate contact creation API call
        const createContactPayload = {
            firstName: nameParts.firstName,
            lastName: nameParts.lastName,
            phone: phoneNumber || '',
            type: newContactType
        };

        console.log('Creating contact with payload:', createContactPayload);

        return {
            contactInfo: {
                id: newContactId,
                name: newContactName,
                type: newContactType
            },
            returnMessage: {
                message: `${newContactType === 'customer' ? 'Customer' : newContactType === 'lead' ? 'Lead' : 'Contact'} created successfully`,
                messageType: 'success',
                ttl: 3000
            }
        };
    } catch (error) {
        console.log('Error in createContact:', error.message);
        return {
            returnMessage: {
                messageType: 'warning',
                message: 'Error creating contact',
                details: [
                    {
                        title: 'Details',
                        items: [
                            {
                                id: '1',
                                type: 'text',
                                text: `Dominion was unable to create a contact named ${newContactName}. Please try again.`
                            }
                        ]
                    }
                ],
                ttl: 3000
            }
        };
    }
}

async function createCallLog({ user, contactInfo, authHeader, callLog, note, additionalSubmission, aiNote, transcript, composedLogDetails }) {
    try {
        console.log('Making dummy API call to create call log in Dominion');
        
        const title = callLog.customSubject || `${callLog.direction} Call ${callLog.direction === 'Outbound' ? 'to' : 'from'} ${contactInfo.name}`;
        const callStartTime = moment(callLog.startTime);
        const callEndTime = callLog.duration === 'pending' ? moment(callStartTime) : moment(callStartTime).add(callLog.duration, 'seconds');
        
        // Simulate call log creation
        const callLogPayload = {
            title: title,
            contactId: contactInfo.id,
            phone: contactInfo.phoneNumber || '',
            startTime: callStartTime.toISOString(),
            endTime: callEndTime.toISOString(),
            direction: callLog.direction,
            status: 'Completed',
            notes: composedLogDetails,
            duration: callLog.duration
        };

        if (additionalSubmission && additionalSubmission.opportunityId) {
            callLogPayload.opportunityId = additionalSubmission.opportunityId;
        }

        console.log('Creating call log with payload:', callLogPayload);
        
        const newLogId = Math.floor(Math.random() * 10000);

        let extraDataTracking = {
            withSmartNoteLog: !!aiNote,
            withTranscript: !!transcript
        };

        return {
            logId: newLogId,
            returnMessage: {
                message: 'Call logged successfully',
                messageType: 'success',
                ttl: 2000
            },
            extraDataTracking
        };
    } catch (error) {
        console.log('Error in createCallLog:', error.message);
        return {
            returnMessage: {
                messageType: 'warning',
                message: 'Error logging call',
                details: [
                    {
                        title: 'Details',
                        items: [
                            {
                                id: '1',
                                type: 'text',
                                text: 'There was an error creating the call log entry in Dominion. Please try again.'
                            }
                        ]
                    }
                ],
                ttl: 3000
            }
        };
    }
}

async function updateCallLog({ user, existingCallLog, authHeader, recordingLink, subject, note, startTime, duration, result, aiNote, transcript, composedLogDetails, existingCallLogDetails }) {
    try {
        console.log('Making dummy API call to update call log in Dominion');
        
        const existingLogId = existingCallLog.thirdPartyLogId;
        
        // Simulate call log update
        const updatePayload = {
            title: subject,
            notes: composedLogDetails,
            result: result
        };

        if (startTime !== undefined && duration !== undefined) {
            const callStartTime = moment(startTime);
            const callEndTime = moment(callStartTime).add(duration, 'seconds');
            updatePayload.startTime = callStartTime.toISOString();
            updatePayload.endTime = callEndTime.toISOString();
            updatePayload.duration = duration;
        }

        if (recordingLink) {
            updatePayload.recordingLink = recordingLink;
        }

        console.log('Updating call log with payload:', updatePayload);

        return {
            updatedNote: note,
            returnMessage: {
                message: 'Call log updated successfully',
                messageType: 'success',
                ttl: 2000
            }
        };
    } catch (error) {
        console.log('Error in updateCallLog:', error.message);
        return {
            successful: false,
            returnMessage: {
                message: 'Error updating call log',
                messageType: 'warning',
                ttl: 3000
            }
        };
    }
}

async function getCallLog({ user, callLogId, authHeader }) {
    try {
        console.log(`Making dummy API call to get call log: ${callLogId}`);
        
        // Simulate getting call log details
        const dummyCallLog = {
            id: callLogId,
            title: 'Outbound Call to John Doe',
            notes: 'Discussed product demo and pricing options. Customer is interested in our premium package.',
            fullBody: 'Complete call log with all details...',
            status: 'Completed',
            createdDate: new Date().toISOString()
        };

        return {
            callLogInfo: {
                subject: dummyCallLog.title,
                note: dummyCallLog.notes,
                fullBody: dummyCallLog.fullBody,
                fullLogResponse: dummyCallLog,
                additionalSubmission: {}
            },
            returnMessage: {
                messageType: 'success',
                message: 'Call log retrieved successfully'
            }
        };
    } catch (error) {
        console.log('Error in getCallLog:', error.message);
        return {
            returnMessage: {
                messageType: 'warning',
                message: 'Error loading call log',
                details: [
                    {
                        title: 'Details',
                        items: [
                            {
                                id: '1',
                                type: 'text',
                                text: 'There was an error loading the call log from Dominion. Please try again.'
                            }
                        ]
                    }
                ],
                ttl: 3000
            }
        };
    }
}

async function createMessageLog({ user, contactInfo, authHeader, message, additionalSubmission, recordingLink, faxDocLink }) {
    try {
        console.log('Making dummy API call to create message log in Dominion');
        
        const userName = user?.dataValues?.platformAdditionalInfo?.name || 'Dominion User';
        let messageType = '';
        let title = '';
        let logBody = '';

        if (recordingLink) {
            messageType = 'Voicemail';
            title = `Voicemail from ${contactInfo.name} - ${moment(message.creationTime).format('YY/MM/DD')}`;
            logBody = `Voicemail recording link: ${recordingLink}\n\n--- Created via RingCentral App Connect`;
        } else if (faxDocLink) {
            messageType = 'Fax';
            title = `Fax from ${contactInfo.name} - ${moment(message.creationTime).format('YY/MM/DD')}`;
            logBody = `Fax document link: ${faxDocLink}\n\n--- Created via RingCentral App Connect`;
        } else {
            messageType = 'SMS';
            title = `SMS conversation with ${contactInfo.name} - ${moment(message.creationTime).format('YY/MM/DD')}`;
            logBody = `SMS: ${message.subject}\nFrom: ${message.direction === 'Inbound' ? contactInfo.name : userName}\n\n--- Created via RingCentral App Connect`;
        }

        const messageLogPayload = {
            title: title,
            contactId: contactInfo.id,
            phone: contactInfo.phoneNumber || '',
            type: messageType,
            content: logBody,
            createdAt: moment(message.creationTime).toISOString()
        };

        if (additionalSubmission && additionalSubmission.opportunityId) {
            messageLogPayload.opportunityId = additionalSubmission.opportunityId;
        }

        console.log('Creating message log with payload:', messageLogPayload);
        
        const newLogId = Math.floor(Math.random() * 10000);

        return {
            logId: newLogId,
            returnMessage: {
                message: `${messageType} logged successfully`,
                messageType: 'success',
                ttl: 1000
            }
        };
    } catch (error) {
        console.log('Error in createMessageLog:', error.message);
        return {
            returnMessage: {
                messageType: 'warning',
                message: 'Error logging message',
                details: [
                    {
                        title: 'Details',
                        items: [
                            {
                                id: '1',
                                type: 'text',
                                text: 'There was an error creating the message log entry in Dominion. Please try again.'
                            }
                        ]
                    }
                ],
                ttl: 3000
            }
        };
    }
}

async function updateMessageLog({ user, contactInfo, existingMessageLog, message, authHeader, contactNumber }) {
    try {
        console.log('Making dummy API call to update message log in Dominion');
        
        const existingLogId = existingMessageLog.thirdPartyLogId;
        const userName = user?.dataValues?.platformAdditionalInfo?.name || 'Dominion User';
        
        // Simulate updating existing message log with new message
        const newMessageEntry = `${message.direction === 'Inbound' ? `${contactInfo.name} (${contactInfo?.phoneNumber})` : userName} ${moment(message.creationTime).format('hh:mm A')}\n${message.subject}\n\n`;
        
        console.log('Updating message log with new entry:', newMessageEntry);

        return {
            logId: existingLogId,
            returnMessage: {
                message: 'Message log updated successfully',
                messageType: 'success',
                ttl: 3000
            }
        };
    } catch (error) {
        console.log('Error in updateMessageLog:', error.message);
        return {
            returnMessage: {
                messageType: 'warning',
                message: 'Error updating message log',
                details: [
                    {
                        title: 'Details',
                        items: [
                            {
                                id: '1',
                                type: 'text',
                                text: 'There was an error updating the message log in Dominion. Please try again.'
                            }
                        ]
                    }
                ],
                ttl: 3000
            }
        };
    }
}

async function upsertCallDisposition({ user, existingCallLog, authHeader, dispositions }) {
    try {
        console.log('Making dummy API call to update call disposition in Dominion');
        
        const existingCallLogId = existingCallLog.thirdPartyLogId;
        
        // Simulate updating call disposition
        const dispositionPayload = {
            callLogId: existingCallLogId,
            outcome: dispositions.outcome || 'Completed',
            notes: dispositions.notes || '',
            followUpRequired: dispositions.followUpRequired || false
        };

        if (dispositions.opportunityId) {
            dispositionPayload.opportunityId = dispositions.opportunityId;
        }

        console.log('Updating call disposition with payload:', dispositionPayload);

        return { 
            logId: existingCallLogId,
            returnMessage: {
                message: 'Call disposition updated successfully',
                messageType: 'success',
                ttl: 2000
            }
        };
    } catch (error) {
        console.log('Error in upsertCallDisposition:', error.message);
        return {
            returnMessage: {
                messageType: 'warning',
                message: 'Error updating call disposition',
                ttl: 3000
            }
        };
    }
}

// Utility function to split full name into parts
function splitName(fullName) {
    const parts = fullName.trim().split(/\s+/);
    const firstName = parts.shift() || "";
    const lastName = parts.pop() || "";
    const middleName = parts.join(" ");
    return { firstName, middleName, lastName };
}

// Export all functions
exports.getAuthType = getAuthType;
exports.getBasicAuth = getBasicAuth;
exports.getUserInfo = getUserInfo;
exports.getUserList = getUserList;
exports.unAuthorize = unAuthorize;
exports.findContact = findContact;
exports.findContactWithName = findContactWithName;
exports.createContact = createContact;
exports.createCallLog = createCallLog;
exports.updateCallLog = updateCallLog;
exports.getCallLog = getCallLog;
exports.createMessageLog = createMessageLog;
exports.updateMessageLog = updateMessageLog;
exports.upsertCallDisposition = upsertCallDisposition;
exports.getLogFormatType = getLogFormatType;
