/**
 * MCP Tool: Get Help
 * 
 * This tool provides users with a friendly guide to available capabilities
 * and how to get started with the RingCentral CRM integration.
 */

const toolDefinition = {
    name: 'getHelp',
    description: 'Get a quick guide on what this integration can do and how to get started.',
    inputSchema: {
        type: 'object',
        properties: {},
        required: []
    }
};

/**
 * Execute the getHelp tool
 * @returns {Object} Result object with help information
 */
async function execute() {
    return {
        success: true,
        data: {
            overview: "I help you connect RingCentral with your CRM to log calls.",
            steps:[
                '1. Tell me to show all connectors and let me connect you to your CRM',
                '2. Follow authorization flow to authorize your CRM',
                '3. Once authorized, I can help find contacts and log your calls'
            ],
            supportedCRMs: ["Clio"],
        }
    };
}

exports.definition = toolDefinition;
exports.execute = execute;

