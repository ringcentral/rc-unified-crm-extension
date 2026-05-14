const jwt = require('../../lib/jwt');
const connectorRegistry = require('../../connector/registry');
const appointmentCore = require('../../handlers/appointment');

/**
 * MCP Tool: Confirm Appointment
 *
 * Marks an existing appointment/event as confirmed in the CRM platform.
 */

const toolDefinition = {
    name: 'confirmAppointment',
    description: '⚠️ REQUIRES CRM CONNECTION. | Confirm an existing appointment or event in the CRM platform by its ID. Returns the updated appointment details.',
    inputSchema: {
        type: 'object',
        properties: {
            appointmentId: {
                type: 'string',
                description: 'The CRM appointment or event ID to confirm.'
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
 * Execute the confirmAppointment tool
 * @param {Object} args
 * @param {string} args.jwtToken - Injected server-side JWT token
 * @param {string} args.appointmentId - CRM appointment ID to confirm
 * @returns {Object} Result with updated appointment data
 */
async function execute(args) {
    try {
        const { jwtToken, appointmentId } = args;

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

        if (!platformModule.confirmAppointment) {
            throw new Error(`confirmAppointment is not implemented for platform: ${platform}`);
        }

        const { successful, appointment, returnMessage } = await appointmentCore.confirmAppointment({
            platform,
            userId,
            appointmentId
        });

        if (successful) {
            return {
                success: true,
                data: {
                    appointment,
                    message: returnMessage?.message || 'Appointment confirmed successfully'
                }
            };
        }
        else {
            return {
                success: false,
                error: returnMessage?.message || 'Failed to confirm appointment'
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
