const jwt = require('../../lib/jwt');
const connectorRegistry = require('../../connector/registry');
const logCore = require('../../handlers/log');
const util = require('../../lib/util');
const { CallLogModel } = require('../../models/callLogModel');
/**
 * MCP Tool: Create Call Log
 * 
 * This tool creates a call log in the CRM platform.
 */

const toolDefinition = {
    name: 'createCallLog',
    description: '⚠️ REQUIRES AUTHENTICATION: User must first authenticate using the "auth" tool to obtain a JWT token before using this tool. | Create a call log in the CRM platform. Returns the created log ID if successful.',
    inputSchema: {
        type: 'object',
        properties: {
            jwtToken: {
                type: 'string',
                description: 'JWT token containing userId and platform information. If user does not have this, direct them to use the "auth" tool first.'
            },
            incomingData: {
                type: 'object',
                description: 'Call log data to create',
                properties: {
                    logInfo: {
                        type: 'object',
                        description: 'RingCentral call log information (follows RingCentral Call Log schema)',
                        properties: {
                            id: {
                                type: 'string',
                                description: 'Call log ID from RingCentral'
                            },
                            sessionId: {
                                type: 'string',
                                description: 'Unique session identifier for the call'
                            },
                            telephonySessionId: {
                                type: 'string',
                                description: 'Telephony session ID'
                            },
                            startTime: {
                                type: 'string',
                                description: 'Call start time in ISO 8601 format'
                            },
                            duration: {
                                type: 'number',
                                description: 'Call duration in seconds'
                            },
                            type: {
                                type: 'string',
                                description: 'Call type (e.g., Voice)'
                            },
                            direction: {
                                type: 'string',
                                description: 'Call direction: "Inbound" or "Outbound"'
                            },
                            action: {
                                type: 'string',
                                description: 'Call action (e.g., Phone Call)'
                            },
                            result: {
                                type: 'string',
                                description: 'Call result (e.g., Accepted, Missed, Voicemail)'
                            },
                            to: {
                                type: 'object',
                                description: 'Recipient information',
                                properties: {
                                    phoneNumber: {
                                        type: 'string',
                                        description: 'Recipient phone number in E.164 format'
                                    },
                                    name: {
                                        type: 'string',
                                        description: 'Recipient name'
                                    }
                                }
                            },
                            from: {
                                type: 'object',
                                description: 'Caller information',
                                properties: {
                                    phoneNumber: {
                                        type: 'string',
                                        description: 'Caller phone number in E.164 format'
                                    },
                                    name: {
                                        type: 'string',
                                        description: 'Caller name'
                                    },
                                    location: {
                                        type: 'string',
                                        description: 'Caller location'
                                    }
                                }
                            },
                            recording: {
                                type: 'object',
                                description: 'Recording information',
                                properties: {
                                    link: {
                                        type: 'string',
                                        description: 'Recording link URL'
                                    }
                                }
                            },
                            customSubject: {
                                type: 'string',
                                description: 'Custom subject for the call log'
                            },
                            legs: {
                                type: 'array',
                                description: 'Call legs information (for multi-party calls)',
                                items: {
                                    type: 'object'
                                }
                            },
                            accountId: {
                                type: 'string',
                                description: 'RingCentral account ID'
                            }
                        },
                        required: ['id','sessionId', 'direction', 'startTime', 'duration', 'to', 'from']
                    },
                    contactId: {
                        type: ['string', 'number'],
                        description: 'CRM contact ID to associate the call log with'
                    },
                    contactName: {
                        type: 'string',
                        description: 'Contact name'
                    },
                    contactType: {
                        type: 'string',
                        description: 'Contact type in the CRM'
                    },
                    note: {
                        type: 'string',
                        description: 'User-entered call note/description'
                    },
                    aiNote: {
                        type: 'string',
                        description: 'AI-generated summary of the phone call'
                    },
                    transcript: {
                        type: 'string',
                        description: 'Call transcript text'
                    },
                    additionalSubmission: {
                        type: 'object',
                        description: 'Additional platform-specific custom fields (e.g., deals, matters, nonBillable flags, assigned users)',
                        properties: {
                            isAssignedToUser: {
                                type: 'boolean',
                                description: 'Whether to assign to a specific user'
                            },
                            adminAssignedUserToken: {
                                type: 'string',
                                description: 'JWT token of the assigned user'
                            },
                            adminAssignedUserRcId: {
                                type: 'string',
                                description: 'RingCentral extension ID of the assigned user'
                            }
                        }
                    }
                },
                required: ['logInfo', 'contactId']
            }
        },
        required: ['jwtToken', 'incomingData']
    }
};

/**
 * Execute the createCallLog tool
 * @param {Object} args - The tool arguments
 * @param {string} args.jwtToken - JWT token with user and platform info
 * @param {Object} args.incomingData - Call log data including logInfo (RingCentral call log schema), contactId, contactName, contactType, note, aiNote, transcript, and additionalSubmission
 * @param {Object} args.incomingData.logInfo - RingCentral call log information with sessionId, direction, startTime, duration, from, to, result, recording, customSubject, etc.
 * @param {string|number} args.incomingData.contactId - CRM contact ID to associate with the call
 * @param {string} [args.incomingData.contactName] - Contact name
 * @param {string} [args.incomingData.contactType] - Contact type in CRM
 * @param {string} [args.incomingData.note] - User-entered call note
 * @param {string} [args.incomingData.aiNote] - AI-generated call summary
 * @param {string} [args.incomingData.transcript] - Call transcript
 * @param {Object} [args.incomingData.additionalSubmission] - Platform-specific custom fields
 * @returns {Object} Result object with created log ID
 */
async function execute(args) {
    try {
        const { jwtToken, incomingData } = args;
        
        if (!jwtToken) {
            throw new Error('Please go to Settings and authorize CRM platform');
        }

        if (!incomingData) {
            throw new Error('Incoming data must be provided');
        }

        // Validate logInfo exists
        if (!incomingData.logInfo) {
            throw new Error('incomingData.logInfo is required');
        }

        const { logInfo } = incomingData;

        // Check in DB if the call log already exists
        const existingCallLog = await CallLogModel.findOne({
            where: {
                sessionId: logInfo.sessionId
            }
        });
        if (existingCallLog) {
            throw new Error(`Call log already exists for session ${logInfo.sessionId}`);
        }

        // Decode JWT to get userId and platform
        const { id: userId, platform } = jwt.decodeJwt(jwtToken);
        
        if (!userId) {
            throw new Error('Invalid JWT token: userId not found');
        }

        // Get the platform connector module
        const platformModule = connectorRegistry.getConnector(platform);
        
        if (!platformModule) {
            throw new Error(`Platform connector not found for: ${platform}`);
        }

        // Check if createCallLog is implemented
        if (!platformModule.createCallLog) {
            throw new Error(`createCallLog is not implemented for platform: ${platform}`);
        }

        // Calculate hashed account ID
        const hashedAccountId = incomingData.logInfo?.accountId 
            ? util.getHashValue(incomingData.logInfo.accountId, process.env.HASH_KEY) 
            : undefined;

        // Call the createCallLog method
        const { successful, logId, returnMessage } = await logCore.createCallLog({ 
            platform, 
            userId, 
            incomingData, 
            hashedAccountId,
            isFromSSCL: false 
        });
        
        if (successful) {
            return {
                success: true,
                data: {
                    logId,
                    message: returnMessage?.message || 'Call log created successfully'
                }
            };
        }
        else {
            return {
                success: false,
                error: returnMessage?.message || 'Failed to create call log',
            };
        }
    }
    catch (error) {
        return {
            success: false,
            error: error.message || 'Unknown error occurred',
            errorDetails: error.stack
        };
    }
}

exports.definition = toolDefinition;
exports.execute = execute;

