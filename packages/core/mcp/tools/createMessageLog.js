const jwt = require('../../lib/jwt');
const connectorRegistry = require('../../connector/registry');
const logCore = require('../../handlers/log');

/**
 * MCP Tool: Create Message Log
 * 
 * This tool creates message logs in the CRM platform.
 */

const toolDefinition = {
    name: 'createMessageLog',
    description: '⚠️ REQUIRES AUTHENTICATION: User must first authenticate using the "auth" tool to obtain a JWT token before using this tool. | Create message logs in the CRM platform. Returns the created log IDs if successful.',
    inputSchema: {
        type: 'object',
        properties: {
            jwtToken: {
                type: 'string',
                description: 'JWT token containing userId and platform information. If user does not have this, direct them to use the "auth" tool first.'
            },
            incomingData: {
                type: 'object',
                description: 'Message log data including messages array with conversation info',
                properties: {
                    conversation: {
                        type: 'object',
                        description: 'Log info object. Sometimes it is named logInfo',
                        properties: {
                            messages: {
                                type: 'array',
                                description: 'Array of message objects to log',
                                minItems: 1,
                                items: {
                                    type: 'object',
                                    properties: {
                                        id: {
                                            type: 'string',
                                            description: 'Message ID'
                                        },
                                        creationTime: {
                                            type: 'number',
                                            description: 'Message creation time'
                                        },
                                        subject: {
                                            type: 'string',
                                            description: 'Message subject'
                                        },
                                        conversationId: {
                                            type: 'string',
                                            description: 'Conversation/session ID'
                                        },
                                        phoneNumber: {
                                            type: 'string',
                                            description: 'Phone number associated with the message'
                                        },
                                        direction: {
                                            type: 'string',
                                            description: 'Message direction (inbound/outbound)'
                                        },
                                        from: {
                                            type: 'object',
                                            description: 'From object',
                                            properties: {
                                                phoneNumber: {
                                                    type: 'string',
                                                    description: 'Phone number associated with the from'
                                                },
                                                location: {
                                                    type: 'string',
                                                    description: 'Location associated with the from'
                                                },
                                                name: {
                                                    type: 'string',
                                                    description: 'Name associated with the from'
                                                }
                                            }
                                        },
                                        to: {
                                            type: 'array',
                                            description: 'Array of to objects',
                                            items: {
                                                type: 'object',
                                                properties: {
                                                    phoneNumber: {
                                                        type: 'string',
                                                        description: 'Phone number associated with the to'
                                                    },
                                                    location: {
                                                        type: 'string',
                                                        description: 'Location associated with the to'
                                                    },
                                                    name: {
                                                        type: 'string',
                                                        description: 'Name associated with the to'
                                                    }
                                                }
                                            }
                                        },
                                        messageStatus: {
                                            type: 'string',
                                            description: 'Message status, just for fax document'
                                        },
                                        faxPageCount: {
                                            type: 'number',
                                            description: 'Fax page count, just for fax document'
                                        },
                                        attachments: {
                                            type: 'array',
                                            description: 'Array of attachment objects',
                                            items: {
                                                type: 'object',
                                                properties: {
                                                    type: {
                                                        type: 'string',
                                                        description: 'Attachment type'
                                                    },
                                                    link: {
                                                        type: 'string',
                                                        description: 'Attachment link'
                                                    },
                                                    uri: {
                                                        type: 'string',
                                                        description: 'Attachment URI'
                                                    },
                                                    contentType: {
                                                        type: 'string',
                                                        description: 'Attachment content type'
                                                    }
                                                }
                                            }
                                        }
                                    }
                                },
                                required: ['id', 'conversationId', 'phoneNumber', 'direction']
                            },
                            correspondents: {
                                type: 'array',
                                description: 'Array of correspondent objects',
                                minItems: 1,
                                items: {
                                    type: 'object',
                                    properties: {
                                        phoneNumber: {
                                            type: 'string',
                                            description: 'Phone number associated with the correspondent'
                                        }
                                    }
                                }
                            },
                            conversationId:{
                                type: 'string',
                                description: 'Conversation ID'
                            },
                            conversationLogId: {
                                type: 'string',
                                description: 'Conversation log ID, conversationId + date. The same conversation happen during the same day will have the same conversationLogId'
                            },
                            rcAccessToken: {
                                type: 'string',
                                description: 'RingCentral access token'
                            },
                            type: {
                                type: 'string',
                                description: 'Conversation type'
                            },
                            date: {
                                type: 'string',
                                description: 'Conversation date'
                            },
                            creationTime:{
                                type: 'number',
                                description: 'Conversation creation time'
                            }
                        },
                        required: ['messages', 'correspondents', 'conversationLogId']
                    },
                    contactId: {
                        type: 'string',
                        description: 'Contact ID'
                    },
                    contactName: {
                        type: 'string',
                        description: 'Contact name'
                    },
                    contactType: {
                        type: 'string',
                        description: 'Contact type'
                    },
                    additionalSubmission: {
                        type: 'object',
                        description: 'Additional submission object',
                        properties: {
                            isAssignedToUser: {
                                type: 'boolean',
                                description: 'Whether to assign to a specific user'
                            }
                        }
                    }
                },
                required: ['conversation', 'contactId', 'contactName']
            }
        },
        required: ['jwtToken', 'incomingData']
    }
};

/**
 * Execute the createMessageLog tool
 * @param {Object} args - The tool arguments
 * @param {string} args.jwtToken - JWT token with user and platform info
 * @param {Object} args.incomingData - Message log data
 * @returns {Object} Result object with created log IDs
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

        if(incomingData.conversation && !incomingData.logInfo) {
            incomingData.logInfo = incomingData.conversation;
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

        // Check if createMessageLog is implemented
        if (!platformModule.createMessageLog) {
            throw new Error(`createMessageLog is not implemented for platform: ${platform}`);
        }

        // Call the createMessageLog method
        const { successful, returnMessage, logIds } = await logCore.createMessageLog({ 
            platform, 
            userId, 
            incomingData
        });
        
        if (successful) {
            return {
                success: true,
                data: {
                    logIds,
                    message: returnMessage?.message || 'Message logs created successfully'
                }
            };
        }
        else {
            return {
                success: false,
                error: returnMessage?.message || 'Failed to create message logs',
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

