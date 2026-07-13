// @ts-check

const jwt = /** @type {any} */ (require('../../lib/jwt'));
const connectorRegistry = /** @type {any} */ (require('../../connector/registry'));
const appointmentCore = /** @type {any} */ (require('../../handlers/appointment'));

/**
 * MCP Tool: List Appointments
 *
 * Fetches appointments/events from the CRM platform.
 * Accepts a named filter (upcoming, today, past, all) or a custom date range.
 */

const toolDefinition = {
    name: 'listAppointments',
    description: '⚠️ REQUIRES CRM CONNECTION. | List appointments or events from the CRM platform. Use the `filter` param to get upcoming, today\'s, past, or all appointments. For a specific window, supply `startDate` and `endDate` (YYYY-MM-DD) directly.',
    inputSchema: {
        type: 'object',
        properties: {
            filter: {
                type: 'string',
                enum: ['upcoming', 'today', 'past', 'all', 'custom'],
                description: [
                    'Named time filter:',
                    '  • "upcoming" — from today onward (next 3 months)',
                    '  • "today"    — only today\'s appointments',
                    '  • "past"     — everything before today (last 3 months)',
                    '  • "all"      — last 3 months through next 3 months',
                    '  • "custom"   — use startDate + endDate you provide',
                ].join('\n')
            },
            startDate: {
                type: 'string',
                description: 'Start of custom date range in YYYY-MM-DD format. Only used when filter is "custom".'
            },
            endDate: {
                type: 'string',
                description: 'End of custom date range in YYYY-MM-DD format. Only used when filter is "custom".'
            },
            mineOnly: {
                type: 'boolean',
                description: 'When true, returns only appointments assigned to the current user. Defaults to false.'
            }
        },
        required: []
    },
    annotations: {
        readOnlyHint: true,
        openWorldHint: true,
        destructiveHint: false
    }
};

/**
 * Build a YYYY-MM-DD string offset by `days` from today.
 */
function offsetDate(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
}

function todayStr() {
    return new Date().toISOString().slice(0, 10);
}

/**
 * Resolve the range object from the filter name or explicit dates.
 */
function resolveRange({ filter, startDate, endDate }) {
    const f = (filter ?? 'all').toLowerCase();
    switch (f) {
        case 'upcoming':
            return { startDate: todayStr(), endDate: offsetDate(90) };
        case 'today':
            return { startDate: todayStr(), endDate: todayStr() };
        case 'past':
            return { startDate: offsetDate(-90), endDate: offsetDate(-1) };
        case 'custom':
            return {
                startDate: startDate ?? offsetDate(-90),
                endDate: endDate ?? offsetDate(90)
            };
        case 'all':
        default:
            return { startDate: offsetDate(-90), endDate: offsetDate(90) };
    }
}

/**
 * Execute the listAppointments tool
 * @param {Object} args
 * @param {string} args.jwtToken - Injected server-side JWT token
 * @param {string} [args.filter] - Named filter: upcoming | today | past | all | custom
 * @param {string} [args.startDate] - Custom range start (YYYY-MM-DD), used when filter="custom"
 * @param {string} [args.endDate] - Custom range end (YYYY-MM-DD), used when filter="custom"
 * @param {boolean} [args.mineOnly] - Restrict to the current user's appointments
 * @returns {Promise<any>} Result with appointment list
 */
async function execute(args) {
    try {
        const { jwtToken, filter, startDate, endDate, mineOnly } = args;

        if (!jwtToken) {
            throw new Error('Please go to Settings and authorize CRM platform');
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

        if (!platformModule.listAppointments) {
            throw new Error(`listAppointments is not implemented for platform: ${platform}`);
        }

        const range = resolveRange({ filter, startDate, endDate });

        const { successful, appointments, returnMessage } = await appointmentCore.listAppointments({
            platform,
            userId,
            range,
            mineOnly: mineOnly ?? false,
            forceSync: false
        });

        if (successful) {
            return {
                success: true,
                data: {
                    filter: filter ?? 'all',
                    range,
                    totalCount: appointments?.length ?? 0,
                    appointments: appointments ?? []
                }
            };
        }
        else {
            return {
                success: false,
                error: returnMessage?.message || 'Failed to list appointments'
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
