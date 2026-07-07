// @ts-check

const jwt = /** @type {any} */ (require('../../lib/jwt'));
const connectorRegistry = /** @type {any} */ (require('../../connector/registry'));
const appointmentCore = /** @type {any} */ (require('../../handlers/appointment'));

/**
 * MCP Tool: Cancel Appointment
 *
 * Cancels (deletes) an existing appointment/event in the CRM platform.
 */

const toolDefinition = {
    name: 'cancelAppointment',
    description: '⚠️ REQUIRES CRM CONNECTION. | Cancel an existing appointment or event in the CRM platform by its ID. This action is destructive — the appointment will be removed.',
    inputSchema: {
        type: 'object',
        properties: {
            appointmentId: {
                type: 'string',
                description: 'The CRM appointment or event ID to cancel.'
            }
        },
        required: ['appointmentId']
    },
    annotations: {
        readOnlyHint: false,
        openWorldHint: true,
        destructiveHint: true
    }
};

/**
 * Execute the cancelAppointment tool
 * @param {Object} args
 * @param {string} args.jwtToken - Injected server-side JWT token
 * @param {string} args.appointmentId - CRM appointment ID to cancel
 * @returns {Promise<any>} Result with cancelled appointment data
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

        if (!platformModule.cancelAppointment) {
            throw new Error(`cancelAppointment is not implemented for platform: ${platform}`);
        }

        const { successful, appointment, returnMessage } = await appointmentCore.cancelAppointment({
            platform,
            userId,
            appointmentId
        });

        if (successful) {
            return {
                success: true,
                data: {
                    appointment,
                    message: returnMessage?.message || 'Appointment cancelled successfully'
                }
            };
        }
        else {
            return {
                success: false,
                error: returnMessage?.message || 'Failed to cancel appointment'
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
