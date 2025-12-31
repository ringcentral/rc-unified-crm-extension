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
    tokenData.append('scope', 'GetCustomerInformation.S5.12.4-D1.0 GetPersonnel.S5.12.4-D1.0 GetServiceAppointment.S5.12.4-D1.0 GetSalesLead.S5.12.4-D1.0 ProcessServiceAppointment.S5.12.4-D1.0 ProcessCustomerInformation.S5.12.4-D1.0');

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

    console.log({m:'createContact',phoneNumber, newContactName, newContactType});
    try {
        const nameParts = splitName(newContactName);
        // Handle different contact types
        if (newContactType === 'customer') {
            return await createCustomerContact(user, phoneNumber, nameParts, newContactName);
        } else {
            throw new Error(`Unsupported contact type: ${newContactType}`);
            
        }
    } catch (error) {
        console.log({m:'createContact error',error});
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
                                text: `Dominion was unable to create a ${newContactType} named ${newContactName}. Please try again.`
                            }
                        ]
                    }
                ],
                ttl: 3000
            }
        };
    }
}

// Create customer using ProcessCustomerInformation API
async function createCustomerContact(user, phoneNumber, nameParts, fullName) {
    try {
        // Get valid access token
        const accessToken = await getDominionAccessToken(user);
        
        // Extract authentication information from the user object
        const partyId = user.platformAdditionalInfo?.partyId;
        const dealerNumberId = user.platformAdditionalInfo?.dealerNumberId;
        const bodVersion = user.platformAdditionalInfo?.bodVersion;
        
        if (!partyId || !dealerNumberId || !bodVersion) {
            throw new Error('Missing required parameters: partyId, dealerNumberId, or bodVersion');
        }

        // Build the API URL for ProcessCustomerInformation
        const apiUrl = `${process.env.DOMINIONDMS_VUE_QA_BASE_URL}/secureapi/ProcessCustomerInformation/${partyId}/${dealerNumberId}/${bodVersion}`;

        // Generate unique BODID for this request
        const bodId = crypto.randomUUID();
        const currentDateTime = new Date().toISOString();
        
        // Parse phone number to get clean format
        const phoneNumberObj = parsePhoneNumber(phoneNumber?.replace(' ', '+') || '');
        const cleanPhoneNumber = phoneNumberObj?.number?.significant || phoneNumber || '';
        
        // Create XML payload for ProcessCustomerInformation request
        const xmlPayload = `<?xml version="1.0" encoding="UTF-8"?>
<ProcessCustomerInformation releaseID="${bodVersion}" xmlns="http://www.starstandard.org/STAR/5" xmlns:oagis="http://www.openapplications.org/oagis/9">
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
    <ProcessCustomerInformationDataArea>
        <Process>
            <ActionCriteria xmlns="http://www.openapplications.org/oagis/9">
                <ActionExpression actionCode="Add" />
            </ActionCriteria>
        </Process>
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
                        <GivenName>${nameParts.firstName || ''}</GivenName>
                        ${nameParts.middleName ? `<MiddleName>${nameParts.middleName}</MiddleName>` : ''}
                        <FamilyName>${nameParts.lastName || ''}</FamilyName>
                        ${cleanPhoneNumber ? `<TelephoneCommunication>
                            <ChannelCode>Telephone</ChannelCode>
                            <CompleteNumber>${cleanPhoneNumber}</CompleteNumber>
                            <UseCode>Home</UseCode>
                            <UsagePreference>
                                <PreferredIndicator>true</PreferredIndicator>
                            </UsagePreference>
                        </TelephoneCommunication>` : ''}
                    </SpecifiedPerson>
                </CustomerParty>
            </CustomerInformationDetail>
        </CustomerInformation>
    </ProcessCustomerInformationDataArea>
</ProcessCustomerInformation>`;

        console.log('Making ProcessCustomerInformation API call to:', apiUrl);
        console.log('Request payload:', xmlPayload);

        // Make the API request to Dominion DMS
        const response = await axios.post(apiUrl, xmlPayload, {
            headers: {
                'Content-Type': 'application/xml',
                'Accept': 'application/xml',
                'Authorization': `Bearer ${accessToken}`
            },
            timeout: 30000 // 30 second timeout
        });

        console.log('ProcessCustomerInformation API response received:', response.status);
        console.log('Response data:', response.data);

        // Parse XML response to extract customer ID
        const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: false });
        const result = await parser.parseStringPromise(response.data);
        
        let customerId = null;
        let customerName = fullName;
        
        // Extract DealerManagementSystemID from AcknowledgeCustomerInformation response
        const acknowledgeCustomerInfo = result.AcknowledgeCustomerInformation;
        if (acknowledgeCustomerInfo && acknowledgeCustomerInfo.AcknowledgeCustomerInformationDataArea) {
            const customerInfo = acknowledgeCustomerInfo.AcknowledgeCustomerInformationDataArea.CustomerInformation;
            if (customerInfo && customerInfo.CustomerInformationDetail) {
                const customerParty = customerInfo.CustomerInformationDetail.CustomerParty;
                if (customerParty && customerParty.DealerManagementSystemID) {
                    customerId = customerParty.DealerManagementSystemID.toString();
                }
                
                // Extract actual name from response if available
                const specifiedPerson = customerParty?.SpecifiedPerson;
                if (specifiedPerson) {
                    const nameParts = [];
                    if (specifiedPerson.GivenName) nameParts.push(specifiedPerson.GivenName);
                    if (specifiedPerson.MiddleName) nameParts.push(specifiedPerson.MiddleName);
                    if (specifiedPerson.FamilyName) nameParts.push(specifiedPerson.FamilyName);
                    if (nameParts.length > 0) {
                        customerName = nameParts.join(' ');
                    }
                }
            }
        }

        if (!customerId) {
            // Fallback: try to extract from response text if XML parsing didn't work
            const idMatch = response.data.match(/<DealerManagementSystemID[^>]*>([^<]+)<\/DealerManagementSystemID>/);
            if (idMatch) {
                customerId = idMatch[1];
            } else {
                throw new Error('Unable to extract customer ID from response');
            }
        }

        return {
            contactInfo: {
                id: customerId,
                name: customerName,
                type: 'customer'
            },
            returnMessage: {
                message: 'Customer created successfully in Dominion DMS',
                messageType: 'success',
                ttl: 3000
            }
        };
    } catch (error) {
        console.log('Error in createCustomerContact:', error.message);
        console.log('Error response:', error.response?.data);
        throw error;
    }
}


async function createCallLog({ user, contactInfo, authHeader, callLog, note, additionalSubmission, aiNote, transcript, composedLogDetails }) {
    try {
        console.log({m:'createCallLog', contactInfo, callLog});
        
        // Get valid access token
        const accessToken = await getDominionAccessToken(user);
        
        // Extract authentication information from the user object
        const partyId = user.platformAdditionalInfo?.partyId;
        const dealerNumberId = user.platformAdditionalInfo?.dealerNumberId;
        const bodVersion = user.platformAdditionalInfo?.bodVersion;
        
        if (!partyId || !dealerNumberId || !bodVersion) {
            throw new Error('Missing required parameters: partyId, dealerNumberId, or bodVersion');
        }

        // Build the API URL for ProcessServiceAppointment
        const apiUrl = `${process.env.DOMINIONDMS_VUE_QA_BASE_URL}/secureapi/ProcessServiceAppointment/${partyId}/${dealerNumberId}/${bodVersion}`;

        // Generate unique BODID for this request
        const bodId = crypto.randomUUID();
        const currentDateTime = new Date().toISOString();
        
        // Parse contact name
        const nameParts = splitName(contactInfo.name || '');
        
        // Format call start time
        const callStartTime = moment(callLog.startTime);
        const appointmentDateTime = callStartTime.toISOString();
        
        // Parse phone number to get clean format
        const phoneNumberObj = parsePhoneNumber(contactInfo.phoneNumber?.replace(' ', '+') || '');
        const cleanPhoneNumber = phoneNumberObj?.number?.significant || contactInfo.phoneNumber || '';         
        // Create XML payload for ProcessServiceAppointment request
        const xmlPayload = `<?xml version="1.0" encoding="UTF-8"?>
<ProcessServiceAppointment xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" releaseID="${bodVersion}" xmlns="http://www.starstandard.org/STAR/5" xmlns:oagis="http://www.openapplications.org/oagis/9">
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
    <ProcessServiceAppointmentDataArea>
        <Process>
            <oagis:ActionCriteria>
                <oagis:ActionExpression actionCode="Add"/>
            </oagis:ActionCriteria>
        </Process>
        <ServiceAppointment>
            <ServiceAppointmentHeader>
                <DocumentIdentificationGroup>
                    <DocumentIdentification>
                        <DocumentID>N/A</DocumentID>
                    </DocumentIdentification>
                </DocumentIdentificationGroup>
                <AppointmentContactParty>
                    <SpecifiedPerson>
                        <GivenName>${nameParts.firstName || ''}</GivenName>
                        <FamilyName>${nameParts.lastName || ''}</FamilyName>
                        ${cleanPhoneNumber ? `<TelephoneCommunication>
                            <ChannelCode>Telephone</ChannelCode>
                            <CompleteNumber>${cleanPhoneNumber}</CompleteNumber>
                            <UseCode>Cellular/Pager</UseCode>
                        </TelephoneCommunication>` : ''}
                    </SpecifiedPerson>
                </AppointmentContactParty>
            </ServiceAppointmentHeader>
            <ServiceAppointmentDetail>
                <Appointment>
                    <AppointmentDateTime>${appointmentDateTime}</AppointmentDateTime>
                    <AppointmentNotes>${composedLogDetails}</AppointmentNotes>
                </Appointment>
            </ServiceAppointmentDetail>
        </ServiceAppointment>
    </ProcessServiceAppointmentDataArea>
</ProcessServiceAppointment>`;

        console.log('Making ProcessServiceAppointment API call to:', apiUrl);
        console.log('Request payload:', xmlPayload);

        // Make the API request to Dominion DMS
        const response = await axios.post(apiUrl, xmlPayload, {
            headers: {
                'Content-Type': 'application/xml',
                'Accept': 'application/xml',
                'Authorization': `Bearer ${accessToken}`
            },
            timeout: 30000 // 30 second timeout
        });

        console.log('ProcessServiceAppointment API response received:', response.status);
        console.log('Response data:', response.data);

        // Parse XML response to extract appointment ID
        const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: false });
        const result = await parser.parseStringPromise(response.data);
        
        let appointmentId = null;
        
        // Extract AlternateDocumentIdentification from AcknowledgeServiceAppointment response
        const acknowledgeServiceAppointment = result.AcknowledgeServiceAppointment;
        if (acknowledgeServiceAppointment && acknowledgeServiceAppointment.AcknowledgeServiceAppointmentDataArea) {
            const serviceAppointment = acknowledgeServiceAppointment.AcknowledgeServiceAppointmentDataArea.ServiceAppointment;
            if (serviceAppointment && serviceAppointment.ServiceAppointmentHeader) {
                const docGroup = serviceAppointment.ServiceAppointmentHeader.DocumentIdentificationGroup;
                if (docGroup && docGroup.AlternateDocumentIdentification) {
                    appointmentId = docGroup.AlternateDocumentIdentification.DocumentID.toString();
                }
            }
        }

        if (!appointmentId) {
            // Fallback: try to extract from response text if XML parsing didn't work
            const idMatch = response.data.match(/<AlternateDocumentIdentification[^>]*>[\s\S]*?<DocumentID[^>]*>([^<]+)<\/DocumentID>/);
            if (idMatch) {
                appointmentId = idMatch[1];
            } else {
                // Use BODID as fallback
                appointmentId = bodId;
            }
        }

        let extraDataTracking = {
            withSmartNoteLog: !!aiNote,
            withTranscript: !!transcript
        };

        return {
            logId: appointmentId,
            returnMessage: {
                message: 'Call logged successfully in Dominion DMS',
                messageType: 'success',
                ttl: 2000
            },
            extraDataTracking
        };
    } catch (error) {
        console.log({m:'createCallLog error', error});
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
                                text: `There was an error creating the call log entry in Dominion DMS: ${error.response?.data || error.message}`
                            }
                        ]
                    }
                ],
                ttl: 3000
            }
        };
    }
}

// Helper function to truncate composedLogDetails at first <br/> tag
function truncateLogDetailsAtBrTag(composedLogDetails) {
    if (!composedLogDetails) return '';
    
    // Find the first occurrence of <br/> or <br> (case insensitive)
    const brIndex = composedLogDetails.toLowerCase().indexOf('<br/>');
    const brIndex2 = composedLogDetails.toLowerCase().indexOf('<br>');
    
    let firstBrIndex = -1;
    if (brIndex !== -1 && brIndex2 !== -1) {
        firstBrIndex = Math.min(brIndex, brIndex2);
    } else if (brIndex !== -1) {
        firstBrIndex = brIndex;
    } else if (brIndex2 !== -1) {
        firstBrIndex = brIndex2;
    }
    
    // If no <br/> found, return the original string
    if (firstBrIndex === -1) {
        return composedLogDetails;
    }
    
    // Return everything before the first <br/> tag
    return composedLogDetails.substring(0, firstBrIndex).trim();
}

async function updateCallLog({ user, existingCallLog, authHeader, recordingLink, subject, note, startTime, duration, result, aiNote, transcript, composedLogDetails, existingCallLogDetails }) {
    try {
        console.log({existingCallLog, composedLogDetails, existingCallLogDetails:existingCallLogDetails?.ServiceAppointmentDetail?.Appointment?.AppointmentNotes,SpecifiedPerson: existingCallLogDetails?.ServiceAppointmentHeader?.AppointmentContactParty?.SpecifiedPerson});
        
        // Get valid access token
        const accessToken = await getDominionAccessToken(user);
        
        // Extract authentication information from the user object
        const partyId = user.platformAdditionalInfo?.partyId;
        const dealerNumberId = user.platformAdditionalInfo?.dealerNumberId;
        const bodVersion = user.platformAdditionalInfo?.bodVersion;
        
        if (!partyId || !dealerNumberId || !bodVersion) {
            throw new Error('Missing required parameters: partyId, dealerNumberId, or bodVersion');
        }

        // Build the API URL for ProcessServiceAppointment
        const apiUrl = `${process.env.DOMINIONDMS_VUE_QA_BASE_URL}/secureapi/ProcessServiceAppointment/${partyId}/${dealerNumberId}/${bodVersion}`;

        // Generate unique BODID for this request
        const bodId = crypto.randomUUID();
        const currentDateTime = new Date().toISOString();
        
        const existingLogId = existingCallLog.thirdPartyLogId;
        
        // Truncate composedLogDetails at first <br/> tag
        const truncatedLogDetails = truncateLogDetailsAtBrTag(composedLogDetails);
        
        // Parse existing contact info from existingCallLogDetails if available
        let contactName = { firstName: '', middleName: '', lastName: '' };
        let phoneNumber = '';
        
        // Extract contact info from the structured SpecifiedPerson object
        const specifiedPerson = existingCallLogDetails?.ServiceAppointmentHeader?.AppointmentContactParty?.SpecifiedPerson;
        if (specifiedPerson) {
            contactName = {
                firstName: specifiedPerson.GivenName || '',
                middleName: specifiedPerson.MiddleName || '',
                lastName: specifiedPerson.FamilyName || ''
            };
            phoneNumber = specifiedPerson.TelephoneCommunication?.CompleteNumber || '';
        }

        
        // Create XML payload for ProcessServiceAppointment request with Change action
        const xmlPayload = `<?xml version="1.0" encoding="UTF-8"?>
<ProcessServiceAppointment xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" releaseID="${bodVersion}" xmlns="http://www.starstandard.org/STAR/5" xmlns:oagis="http://www.openapplications.org/oagis/9">
    <ApplicationArea>
        <Sender>
            <CreatorNameCode>EX</CreatorNameCode>
            <SenderNameCode>EX</SenderNameCode>
            <PartyID>${partyId}</PartyID>
        </Sender>
        <CreationDateTime>${currentDateTime}</CreationDateTime>
        <BODID>${bodId}</BODID>
        <Destination>
            <DestinationNameCode>D2</DestinationNameCode>
            <DealerNumberID>${dealerNumberId}</DealerNumberID>
            <ServiceMessageID>${bodVersion}</ServiceMessageID>
        </Destination>
    </ApplicationArea>
    <ProcessServiceAppointmentDataArea>
        <Process>
            <oagis:ActionCriteria>
                <oagis:ActionExpression actionCode="Change"/>
            </oagis:ActionCriteria>
        </Process>
        <ServiceAppointment>
            <ServiceAppointmentHeader>
                <DocumentIdentificationGroup>
                    <DocumentIdentification>
                        <DocumentID>N/A</DocumentID>
                    </DocumentIdentification>
                    <AlternateDocumentIdentification>
                        <DocumentID>${existingLogId}</DocumentID>
                    </AlternateDocumentIdentification>
                </DocumentIdentificationGroup>
                ${contactName.firstName || contactName.middleName || contactName.lastName || cleanPhoneNumber ? `<AppointmentContactParty>
                    <SpecifiedPerson>
                        <GivenName>${contactName.firstName || ''}</GivenName>
                        ${contactName.middleName ? `<MiddleName>${contactName.middleName}</MiddleName>` : ''}
                        <FamilyName>${contactName.lastName || ''}</FamilyName>
                        ${phoneNumber ? `<TelephoneCommunication>
                            <ChannelCode>Telephone</ChannelCode>
                            <CompleteNumber>${phoneNumber}</CompleteNumber>
                            <UseCode>Cellular/Pager</UseCode>
                        </TelephoneCommunication>` : ''}
                    </SpecifiedPerson>
                </AppointmentContactParty>` : ''}
            </ServiceAppointmentHeader>
            <ServiceAppointmentDetail>
                <Appointment>
                    <AppointmentNotes>${truncatedLogDetails}</AppointmentNotes>
                    <AppointmentType>Service</AppointmentType>
                </Appointment>
            </ServiceAppointmentDetail>
        </ServiceAppointment>
    </ProcessServiceAppointmentDataArea>
</ProcessServiceAppointment>`;

        // Make the API request to Dominion DMS
        const response = await axios.post(apiUrl, xmlPayload, {
            headers: {
                'Content-Type': 'application/xml',
                'Accept': 'application/xml',
                'Authorization': `Bearer ${accessToken}`
            },
            timeout: 30000 // 30 second timeout
        });

        return {
            updatedNote: note,
            returnMessage: {
                message: 'Call log updated successfully',
                messageType: 'success',
                ttl: 2000
            }
        };
    } catch (error) {
        console.log('Error in updateCallLog:', error);
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
        console.log({m:'getCallLog', callLogId});
        
        // Get valid access token
        const accessToken = await getDominionAccessToken(user);
        
        // Extract authentication information from the user object
        const partyId = user.platformAdditionalInfo?.partyId;
        const dealerNumberId = user.platformAdditionalInfo?.dealerNumberId;
        const bodVersion = user.platformAdditionalInfo?.bodVersion;
        
        if (!partyId || !dealerNumberId || !bodVersion) {
            throw new Error('Missing required parameters: partyId, dealerNumberId, or bodVersion');
        }

        // Build the API URL for GetServiceAppointment
        const apiUrl = `${process.env.DOMINIONDMS_VUE_QA_BASE_URL}/secureapi/GetServiceAppointment/${partyId}/${dealerNumberId}/${bodVersion}`;

        // Generate unique BODID for this request
        const bodId = crypto.randomUUID();
        const currentDateTime = new Date().toISOString();
        
        // Create XML payload for GetServiceAppointment request
        const xmlPayload = `<?xml version="1.0" encoding="UTF-8"?>
<GetServiceAppointment releaseID="${bodVersion}" xmlns="http://www.starstandard.org/STAR/5" xmlns:oagis="http://www.openapplications.org/oagis/9">
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
    <GetServiceAppointmentDataArea>
        <Get maxItems="250" recordSetStartNumber="1">
            <oagis:Expression>Get Service Appointment</oagis:Expression>
        </Get>
        <ServiceAppointment>
            <ServiceAppointmentHeader>
                <DocumentIdentificationGroup>
                    <DocumentIdentification>
                        <DocumentID>N/A</DocumentID>
                    </DocumentIdentification>
                    <AlternateDocumentIdentification>
                        <DocumentID>${callLogId}</DocumentID>
                    </AlternateDocumentIdentification>
                </DocumentIdentificationGroup>
            </ServiceAppointmentHeader>
            <ServiceAppointmentDetail/>
        </ServiceAppointment>
    </GetServiceAppointmentDataArea>
</GetServiceAppointment>`;

        console.log('Making GetServiceAppointment API call to:', apiUrl);
        console.log('Request payload:', xmlPayload);

        // Make the API request to Dominion DMS
        const response = await axios.post(apiUrl, xmlPayload, {
            headers: {
                'Content-Type': 'application/xml',
                'Accept': 'application/xml',
                'Authorization': `Bearer ${accessToken}`
            },
            timeout: 30000 // 30 second timeout
        });

        console.log('GetServiceAppointment API response received:', response.status);
        console.log('Response data:', response.data);

        // Parse XML response to extract appointment details
        const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: false });
        const result = await parser.parseStringPromise(response.data);
        
        // Extract appointment details from ShowServiceAppointment response
        const showServiceAppointment = result.ShowServiceAppointment;
        if (!showServiceAppointment || !showServiceAppointment.ShowServiceAppointmentDataArea) {
            throw new Error('No appointment found for call log ID: ' + callLogId);
        }
        
        const serviceAppointment = showServiceAppointment.ShowServiceAppointmentDataArea.ServiceAppointment;
        if (!serviceAppointment) {
            throw new Error('No appointment found for call log ID: ' + callLogId);
        }
        
        const header = serviceAppointment.ServiceAppointmentHeader;
        const detail = serviceAppointment.ServiceAppointmentDetail;
        
        // Extract contact information step by step
        let contactFirstName = '';
        let contactMiddleName = '';
        let contactLastName = '';
        let contactPhone = '';
        if (header && header.AppointmentContactParty && header.AppointmentContactParty.SpecifiedPerson) {
            const person = header.AppointmentContactParty.SpecifiedPerson;
            contactFirstName = person.GivenName || '';
            contactMiddleName = person.MiddleName || '';
            contactLastName = person.FamilyName || '';
            if (person.TelephoneCommunication && person.TelephoneCommunication.CompleteNumber) {
                contactPhone = person.TelephoneCommunication.CompleteNumber;
            }
        }
        
        // Build full contact name including middle name
        const nameParts = [];
        if (contactFirstName) nameParts.push(contactFirstName);
        if (contactMiddleName) nameParts.push(contactMiddleName);
        if (contactLastName) nameParts.push(contactLastName);
        const contactName = nameParts.join(' ');
        
        // Extract appointment details step by step
        let appointmentNotes = '';
        
        if (detail && detail.Appointment) {
            const appointment = detail.Appointment;
            appointmentNotes = appointment.AppointmentNotes?.toString() || '';
        }
        
        // Parse notes to extract structured information (similar to Bullhorn parsing)
        const fullBody = appointmentNotes;

        // Extract LAST note value from "- Note: Value" pattern
        let note = '';
        if (appointmentNotes.includes('Note:')) {
            const noteMatches = [...appointmentNotes.matchAll(/[-\s]*Note:\s*([^\n\r]*)/g)];
            if (noteMatches.length > 0) {
                // Get the last match
                const lastNoteMatch = noteMatches[noteMatches.length - 1];
                note = lastNoteMatch[1].trim();
            }
        }
        
        // Extract LAST subject from "- Summary: Value" pattern
        let subject = '';
        if (appointmentNotes.includes('Summary:')) {
            const summaryMatches = [...appointmentNotes.matchAll(/[-\s]*Summary:\s*([^\n\r]*)/g)];
            if (summaryMatches.length > 0) {
                // Get the last match
                const lastSummaryMatch = summaryMatches[summaryMatches.length - 1];
                subject = lastSummaryMatch[1].trim();
            }
        }
        
        // Build callLogInfo object step by step (similar to Bullhorn pattern)
        const callLogInfo = {
            subject: subject,
            note: note,
            fullBody: fullBody,
            fullLogResponse: serviceAppointment,
            contactName: contactName
            
        };

        return {
            callLogInfo,
            returnMessage: {
                messageType: 'success',
                message: 'Call log retrieved successfully from Dominion DMS'
            }
        };
    } catch (error) {
        console.log({m:'getCallLog error', error});
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
                                text: `There was an error loading the call log from Dominion DMS: ${error.response?.data || error.message}`
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
        console.log({m:'createMessageLog', contactInfo, message});
        
        // Get valid access token
        const accessToken = await getDominionAccessToken(user);
        
        // Extract authentication information from the user object
        const partyId = user.platformAdditionalInfo?.partyId;
        const dealerNumberId = user.platformAdditionalInfo?.dealerNumberId;
        const bodVersion = user.platformAdditionalInfo?.bodVersion;
        
        if (!partyId || !dealerNumberId || !bodVersion) {
            throw new Error('Missing required parameters: partyId, dealerNumberId, or bodVersion');
        }

        // Build the API URL for ProcessServiceAppointment
        const apiUrl = `${process.env.DOMINIONDMS_VUE_QA_BASE_URL}/secureapi/ProcessServiceAppointment/${partyId}/${dealerNumberId}/${bodVersion}`;

        // Generate unique BODID for this request
        const bodId = crypto.randomUUID();
        const currentDateTime = new Date().toISOString();
        
        // Parse contact name
        const nameParts = splitName(contactInfo.name || '');
        
        // Format message time
        const messageTime = moment(message.creationTime);
        const appointmentDateTime = messageTime.toISOString();
        
        // Parse phone number to get clean format
        const phoneNumberObj = parsePhoneNumber(contactInfo.phoneNumber?.replace(' ', '+') || '');
        const cleanPhoneNumber = phoneNumberObj?.number?.significant || contactInfo.phoneNumber || '';
        
        // Build message body data for appointment notes
        const userName = user?.dataValues?.platformAdditionalInfo?.name || 'User';
        let messageBodyData = '';
        
        if (recordingLink) {
            // Voicemail message body
            messageBodyData = `Voicemail from ${contactInfo.name}\n` +
                `Date/Time: ${messageTime.format('YYYY-MM-DD hh:mm:ss A')}\n` +
                `Recording Link: ${recordingLink}\n` +
                `Direction: ${message.direction}\n` +
                `--- Created via RingCentral App Connect`;
        } else if (faxDocLink) {
            // Fax message body
            messageBodyData = `Fax from ${contactInfo.name}\n` +
                `Date/Time: ${messageTime.format('YYYY-MM-DD hh:mm:ss A')}\n` +
                `Document Link: ${faxDocLink}\n` +
                `Direction: ${message.direction}\n` +
                `--- Created via RingCentral App Connect`;
        } else {
            // SMS message body
            messageBodyData = `SMS Conversation with ${contactInfo.name}\n` +
                `Date/Time: ${messageTime.format('YYYY-MM-DD hh:mm:ss A')}\n` +
                `Message: ${message.subject || 'No message content'}\n` +
                `From: ${message.direction === 'Inbound' ? contactInfo.name : userName}\n` +
                `Direction: ${message.direction}\n` +
                `--- Created via RingCentral App Connect`;
        }

        // Create XML payload for ProcessServiceAppointment request
        const xmlPayload = `<?xml version="1.0" encoding="UTF-8"?>
<ProcessServiceAppointment xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" releaseID="${bodVersion}" xmlns="http://www.starstandard.org/STAR/5" xmlns:oagis="http://www.openapplications.org/oagis/9">
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
    <ProcessServiceAppointmentDataArea>
        <Process>
            <oagis:ActionCriteria>
                <oagis:ActionExpression actionCode="Add"/>
            </oagis:ActionCriteria>
        </Process>
        <ServiceAppointment>
            <ServiceAppointmentHeader>
                <DocumentIdentificationGroup>
                    <DocumentIdentification>
                        <DocumentID>N/A</DocumentID>
                    </DocumentIdentification>
                </DocumentIdentificationGroup>
                <AppointmentContactParty>
                    <SpecifiedPerson>
                        <GivenName>${nameParts.firstName || ''}</GivenName>
                        <FamilyName>${nameParts.lastName || ''}</FamilyName>
                        ${cleanPhoneNumber ? `<TelephoneCommunication>
                            <ChannelCode>Telephone</ChannelCode>
                            <CompleteNumber>${cleanPhoneNumber}</CompleteNumber>
                            <UseCode>Cellular/Pager</UseCode>
                        </TelephoneCommunication>` : ''}
                    </SpecifiedPerson>
                </AppointmentContactParty>
            </ServiceAppointmentHeader>
            <ServiceAppointmentDetail>
                <Appointment>
                    <AppointmentDateTime>${appointmentDateTime}</AppointmentDateTime>
                    <AppointmentNotes>${messageBodyData}</AppointmentNotes>
                </Appointment>
            </ServiceAppointmentDetail>
        </ServiceAppointment>
    </ProcessServiceAppointmentDataArea>
</ProcessServiceAppointment>`;

        console.log('Making ProcessServiceAppointment API call to:', apiUrl);
        console.log('Request payload:', xmlPayload);

        // Make the API request to Dominion DMS
        const response = await axios.post(apiUrl, xmlPayload, {
            headers: {
                'Content-Type': 'application/xml',
                'Accept': 'application/xml',
                'Authorization': `Bearer ${accessToken}`
            },
            timeout: 30000 // 30 second timeout
        });

        console.log('ProcessServiceAppointment API response received:', response.status);
        console.log('Response data:', response.data);

        // Parse XML response to extract appointment ID
        const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: false });
        const result = await parser.parseStringPromise(response.data);
        
        let appointmentId = null;
        
        // Extract AlternateDocumentIdentification from AcknowledgeServiceAppointment response
        const acknowledgeServiceAppointment = result.AcknowledgeServiceAppointment;
        if (acknowledgeServiceAppointment && acknowledgeServiceAppointment.AcknowledgeServiceAppointmentDataArea) {
            const serviceAppointment = acknowledgeServiceAppointment.AcknowledgeServiceAppointmentDataArea.ServiceAppointment;
            if (serviceAppointment && serviceAppointment.ServiceAppointmentHeader) {
                const docGroup = serviceAppointment.ServiceAppointmentHeader.DocumentIdentificationGroup;
                if (docGroup && docGroup.AlternateDocumentIdentification) {
                    appointmentId = docGroup.AlternateDocumentIdentification.DocumentID.toString();
                }
            }
        }

        if (!appointmentId) {
            // Fallback: try to extract from response text if XML parsing didn't work
            const idMatch = response.data.match(/<AlternateDocumentIdentification[^>]*>[\s\S]*?<DocumentID[^>]*>([^<]+)<\/DocumentID>/);
            if (idMatch) {
                appointmentId = idMatch[1];
            } else {
                // Use BODID as fallback
                appointmentId = bodId;
            }
        }

        // Determine message type for success message
        let messageTypeText = 'Message';
        if (recordingLink) messageTypeText = 'Voicemail';
        else if (faxDocLink) messageTypeText = 'Fax';
        else messageTypeText = 'SMS';

        return {
            logId: appointmentId,
            returnMessage: {
                message: `${messageTypeText} logged successfully in Dominion DMS`,
                messageType: 'success',
                ttl: 2000
            }
        };
    } catch (error) {
        console.log({m:'createMessageLog error', error});
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
                                text: `There was an error creating the message log entry in Dominion DMS: ${error.response?.data || error.message}`
                            }
                        ]
                    }
                ],
                ttl: 3000
            }
        };
    }
}

async function updateMessageLog({ user, contactInfo, existingMessageLog, message, authHeader, contactNumber, existingMessageLogDetails }) {
    try {
        console.log({m:'updateMessageLog', existingMessageLog, message});
        
        // Get valid access token
        const accessToken = await getDominionAccessToken(user);
        
        // Extract authentication information from the user object
        const partyId = user.platformAdditionalInfo?.partyId;
        const dealerNumberId = user.platformAdditionalInfo?.dealerNumberId;
        const bodVersion = user.platformAdditionalInfo?.bodVersion;
        
        if (!partyId || !dealerNumberId || !bodVersion) {
            throw new Error('Missing required parameters: partyId, dealerNumberId, or bodVersion');
        }

        // Build the API URL for ProcessServiceAppointment
        const apiUrl = `${process.env.DOMINIONDMS_VUE_QA_BASE_URL}/secureapi/ProcessServiceAppointment/${partyId}/${dealerNumberId}/${bodVersion}`;

        // Generate unique BODID for this request
        const bodId = crypto.randomUUID();
        const currentDateTime = new Date().toISOString();
        
        const existingLogId = existingMessageLog.thirdPartyLogId;
        
        // Use the contactInfo parameter directly
        const nameParts = splitName(contactInfo.name || '');
        const phoneNumberObj = parsePhoneNumber(contactInfo.phoneNumber?.replace(' ', '+') || '');
        const cleanPhoneNumber = phoneNumberObj?.number?.significant || contactInfo.phoneNumber || '';

        // Get existing appointment notes (message body data) - we need existingMessageLogDetails only for this
        let existingMessageBodyData = existingMessageLogDetails?.ServiceAppointmentDetail?.Appointment?.AppointmentNotes || '';
        
        // Build new message body data to append
        const userName = user?.dataValues?.platformAdditionalInfo?.name || 'User';
        const messageTime = moment(message.creationTime);
        let newMessageBodyData = '';
        
        if (message.type === 'Voicemail' || message.recordingLink) {
            newMessageBodyData = `\n\n--- New Voicemail Message ---\n` +
                `From: ${contactInfo.name}\n` +
                `Date/Time: ${messageTime.format('YYYY-MM-DD hh:mm:ss A')}\n` +
                `Direction: ${message.direction}\n` +
                `Recording Link: ${message.recordingLink || 'N/A'}\n` +
                `--- Added via RingCentral App Connect`;
        } else if (message.type === 'Fax' || message.faxDocLink) {
            newMessageBodyData = `\n\n--- New Fax Message ---\n` +
                `From: ${contactInfo.name}\n` +
                `Date/Time: ${messageTime.format('YYYY-MM-DD hh:mm:ss A')}\n` +
                `Direction: ${message.direction}\n` +
                `Document Link: ${message.faxDocLink || 'N/A'}\n` +
                `--- Added via RingCentral App Connect`;
        } else {
            // SMS message
            newMessageBodyData = `\n\n--- New SMS Message ---\n` +
                `${message.direction === 'Inbound' ? contactInfo.name : userName} (${messageTime.format('hh:mm A')})\n` +
                `Message: ${message.subject || 'No message content'}\n` +
                `Direction: ${message.direction}\n` +
                `--- Added via RingCentral App Connect`;
        }
        
        // Combine existing and new message body data
        const updatedMessageBodyData = existingMessageBodyData + newMessageBodyData;

        // Create XML payload for ProcessServiceAppointment request with Change action
        const xmlPayload = `<?xml version="1.0" encoding="UTF-8"?>
<ProcessServiceAppointment xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" releaseID="${bodVersion}" xmlns="http://www.starstandard.org/STAR/5" xmlns:oagis="http://www.openapplications.org/oagis/9">
    <ApplicationArea>
        <Sender>
            <CreatorNameCode>EX</CreatorNameCode>
            <SenderNameCode>EX</SenderNameCode>
            <PartyID>${partyId}</PartyID>
        </Sender>
        <CreationDateTime>${currentDateTime}</CreationDateTime>
        <BODID>${bodId}</BODID>
        <Destination>
            <DestinationNameCode>D2</DestinationNameCode>
            <DealerNumberID>${dealerNumberId}</DealerNumberID>
            <ServiceMessageID>${bodVersion}</ServiceMessageID>
        </Destination>
    </ApplicationArea>
    <ProcessServiceAppointmentDataArea>
        <Process>
            <oagis:ActionCriteria>
                <oagis:ActionExpression actionCode="Change"/>
            </oagis:ActionCriteria>
        </Process>
        <ServiceAppointment>
            <ServiceAppointmentHeader>
                <DocumentIdentificationGroup>
                    <DocumentIdentification>
                        <DocumentID>N/A</DocumentID>
                    </DocumentIdentification>
                    <AlternateDocumentIdentification>
                        <DocumentID>${existingLogId}</DocumentID>
                    </AlternateDocumentIdentification>
                </DocumentIdentificationGroup>
                ${nameParts.firstName || nameParts.lastName || cleanPhoneNumber ? `<AppointmentContactParty>
                    <SpecifiedPerson>
                        <GivenName>${nameParts.firstName || ''}</GivenName>
                        <FamilyName>${nameParts.lastName || ''}</FamilyName>
                        ${cleanPhoneNumber ? `<TelephoneCommunication>
                            <ChannelCode>Telephone</ChannelCode>
                            <CompleteNumber>${cleanPhoneNumber}</CompleteNumber>
                            <UseCode>Cellular/Pager</UseCode>
                        </TelephoneCommunication>` : ''}
                    </SpecifiedPerson>
                </AppointmentContactParty>` : ''}
            </ServiceAppointmentHeader>
            <ServiceAppointmentDetail>
                <Appointment>
                    <AppointmentNotes>${updatedMessageBodyData}</AppointmentNotes>
                    <AppointmentType>Service</AppointmentType>
                </Appointment>
            </ServiceAppointmentDetail>
        </ServiceAppointment>
    </ProcessServiceAppointmentDataArea>
</ProcessServiceAppointment>`;

        console.log('Making ProcessServiceAppointment API call to:', apiUrl);
        console.log('Request payload:', xmlPayload);

        // Make the API request to Dominion DMS
        const response = await axios.post(apiUrl, xmlPayload, {
            headers: {
                'Content-Type': 'application/xml',
                'Accept': 'application/xml',
                'Authorization': `Bearer ${accessToken}`
            },
            timeout: 30000 // 30 second timeout
        });

        console.log('ProcessServiceAppointment API response received:', response.status);
        console.log('Response data:', response.data);

        return {
            returnMessage: {
                message: 'Message log updated successfully in Dominion DMS',
                messageType: 'success',
                ttl: 2000
            }
        };
    } catch (error) {
        console.log('Error in updateMessageLog:', error);
        return {
            successful: false,
            returnMessage: {
                message: 'Error updating message log',
                messageType: 'warning',
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
