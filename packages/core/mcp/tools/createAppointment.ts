// @ts-check

const jwt = /** @type {any} */ (require('../../lib/jwt'));
const connectorRegistry = /** @type {any} */ (require('../../connector/registry'));
const appointmentCore = /** @type {any} */ (require('../../handlers/appointment'));

/**
 * MCP Tool: Create Appointment
 *
 * Creates a new appointment/event in the CRM platform.
 */

const toolDefinition = {
    name: 'createAppointment',
    description: '⚠️ REQUIRES CRM CONNECTION. | Create a new appointment or event in the CRM platform. Returns the created appointment ID and details.',
    inputSchema: {
        type: 'object',
        properties: {
            title: {
                type: 'string',
                description: 'Title or subject of the appointment (e.g. "Client Meeting").'
            },
            summary: {
                type: 'string',
                description: 'Description or notes for the appointment.'
            },
            startTimeUtc: {
                type: 'string',
                description: 'Start date and time in ISO 8601 UTC format (e.g. "2026-05-10T14:00:00Z").'
            },
            durationMinutes: {
                type: 'number',
                description: 'Duration of the appointment in minutes (e.g. 60 for one hour).'
            },
            contacts: {
                type: 'array',
                description: 'List of CRM contact IDs to invite as attendees. Each item should be a contact ID string or an object with an "id" field.',
                items: {
                    oneOf: [
                        {
                            type: 'string',
                            description: 'CRM contact ID'
                        },
                        {
                            type: 'object',
                            description: 'Contact object with id field',
                            properties: {
                                id: {
                                    type: 'string',
                                    description: 'CRM contact ID'
                                }
                            },
                            required: ['id']
                        }
                    ]
                }
            }
        },
        required: ['title', 'startTimeUtc', 'durationMinutes']
    },
    annotations: {
        readOnlyHint: false,
        openWorldHint: true,
        destructiveHint: false
    }
};

/**
 * Execute the createAppointment tool
 * @param {Object} args
 * @param {string} args.jwtToken - Injected server-side JWT token
 * @param {string} args.title - Appointment title
 * @param {string} [args.summary] - Appointment description
 * @param {string} args.startTimeUtc - ISO 8601 UTC start time
 * @param {number} args.durationMinutes - Duration in minutes
 * @param {Array} [args.contacts] - List of contact IDs or contact objects to invite
 * @returns {Promise<any>} Result with created appointment ID and data
 */
async function execute(args) {
    try {
        const { jwtToken, title, summary, startTimeUtc, durationMinutes, contacts } = args;

        if (!jwtToken) {
            throw new Error('Please go to Settings and authorize CRM platform');
        }

        if (!title) {
            throw new Error('title is required');
        }

        if (!startTimeUtc) {
            throw new Error('startTimeUtc is required (ISO 8601 UTC format, e.g. "2026-05-10T14:00:00Z")');
        }

        if (durationMinutes == null) {
            throw new Error('durationMinutes is required');
        }

        const decodedToken = jwt.decodeJwt(jwtToken);
        if (!decodedToken) {
            throw new Error('Invalid JWT token');
        }
        const { id: userId, platform } = decodedToken;

        if (!userId) {
            throw new Error('Invalid JWT token: userId not found');
        }

        const platformModule = connectorRegistry.getConnector(platform);
        if (!platformModule) {
            throw new Error(`Platform connector not found for: ${platform}`);
        }

        if (!platformModule.createAppointment) {
            throw new Error(`createAppointment is not implemented for platform: ${platform}`);
        }

        const payload = {
            title,
            summary: summary ?? '',
            startTimeUtc,
            durationMinutes: Number(durationMinutes),
            contacts: contacts ?? []
        };

        const { successful, appointmentId, appointment, returnMessage } = await appointmentCore.createAppointment({
            platform,
            userId,
            payload
        });

        if (successful) {
            return {
                success: true,
                data: {
                    appointmentId,
                    appointment,
                    message: returnMessage?.message || 'Appointment created successfully'
                }
            };
        }
        else {
            return {
                success: false,
                error: returnMessage?.message || 'Failed to create appointment'
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

export {};
