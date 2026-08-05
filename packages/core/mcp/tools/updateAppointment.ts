// @ts-check

const jwt = /** @type {any} */ (require('../../lib/jwt'));
const connectorRegistry = /** @type {any} */ (require('../../connector/registry'));
const appointmentCore = /** @type {any} */ (require('../../handlers/appointment'));

/**
 * MCP Tool: Update Appointment
 *
 * Updates (reschedules or edits) an existing appointment/event in the CRM platform.
 */

const toolDefinition = {
    name: 'updateAppointment',
    description: '⚠️ REQUIRES CRM CONNECTION. | Update or reschedule an existing appointment or event in the CRM platform. Provide only the fields you want to change alongside the appointmentId.',
    inputSchema: {
        type: 'object',
        properties: {
            appointmentId: {
                type: 'string',
                description: 'The CRM appointment or event ID to update.'
            },
            title: {
                type: 'string',
                description: 'New title or subject for the appointment.'
            },
            summary: {
                type: 'string',
                description: 'New description or notes for the appointment.'
            },
            startTimeUtc: {
                type: 'string',
                description: 'New start date and time in ISO 8601 UTC format (e.g. "2026-05-10T15:00:00Z"). Required when rescheduling.'
            },
            durationMinutes: {
                type: 'number',
                description: 'New duration in minutes. Required when rescheduling.'
            },
            contacts: {
                type: 'array',
                description: 'Updated list of CRM contact IDs to invite as attendees. Replaces the existing attendee list. Omit to leave attendees unchanged.',
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
        required: ['appointmentId']
    },
    annotations: {
        readOnlyHint: false,
        openWorldHint: true,
        destructiveHint: false
    }
};

/**
 * Execute the updateAppointment tool
 * @param {Object} args
 * @param {string} args.jwtToken - Injected server-side JWT token
 * @param {string} args.appointmentId - CRM appointment ID to update
 * @param {string} [args.title] - New appointment title
 * @param {string} [args.summary] - New appointment description
 * @param {string} [args.startTimeUtc] - New ISO 8601 UTC start time
 * @param {number} [args.durationMinutes] - New duration in minutes
 * @param {Array}  [args.contacts] - Updated attendee contact IDs
 * @returns {Promise<any>} Result with updated appointment data
 */
async function execute(args) {
    try {
        const { jwtToken, appointmentId, title, summary, startTimeUtc, durationMinutes, contacts } = args;

        if (!jwtToken) {
            throw new Error('Please go to Settings and authorize CRM platform');
        }

        if (!appointmentId) {
            throw new Error('appointmentId is required');
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

        if (!platformModule.updateAppointment) {
            throw new Error(`updateAppointment is not implemented for platform: ${platform}`);
        }

        // Build the patch body from only the fields the caller supplied
        const patchBody: any = {};
        if (title !== undefined) patchBody.title = title;
        if (summary !== undefined) patchBody.summary = summary;
        if (startTimeUtc !== undefined) patchBody.startTimeUtc = startTimeUtc;
        if (durationMinutes !== undefined) patchBody.durationMinutes = Number(durationMinutes);
        if (contacts !== undefined) patchBody.contacts = contacts;

        const { successful, appointment, returnMessage } = await appointmentCore.updateAppointment({
            platform,
            userId,
            appointmentId,
            patchBody
        });

        if (successful) {
            return {
                success: true,
                data: {
                    appointment,
                    message: returnMessage?.message || 'Appointment updated successfully'
                }
            };
        }
        else {
            return {
                success: false,
                error: returnMessage?.message || 'Failed to update appointment'
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
