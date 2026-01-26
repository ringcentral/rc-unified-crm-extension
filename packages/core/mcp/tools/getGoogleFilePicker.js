const jwt = require('../../lib/jwt');
const { UserModel } = require('../../models/userModel');
const axios = require('axios');

/**
 * MCP Tool: Get Google File Picker
 * 
 * Returns the URL for the Google Sheets file picker.
 * The user must visit this URL in a browser to select a Google Sheet.
 */

const toolDefinition = {
    name: 'getGoogleFilePicker',
    description: '⚠️ REQUIRES AUTHENTICATION: User must first authenticate with googleSheets platform. | Returns a URL for the Google Sheets file picker (1st preference) OR create a new sheet with input sheet name (2nd preference). The user should open this URL in their browser to select a Google Sheet for logging.',
    inputSchema: {
        type: 'object',
        properties: {
            jwtToken: {
                type: 'string',
                description: 'JWT token obtained from authentication. If user does not have this, direct them to use the "doAuth" tool first with googleSheets platform.'
            },
            sheetName: {
                type: 'string',
                description: 'OPTIONAL. Name of the new sheet to create.'
            }
        },
        required: ['jwtToken']
    },
    annotations: {
        readOnlyHint: false,
        openWorldHint: true,
        destructiveHint: false
    }
};

/**
 * Execute the getGoogleFilePicker tool
 * @param {Object} args - The tool arguments
 * @param {string} args.jwtToken - JWT token containing userId
 * @param {string} args.sheetName - Name of the new sheet to create
 * @returns {Object} Result object with file picker URL
 */
async function execute(args) {
    try {
        const { jwtToken, sheetName } = args;

        if (!jwtToken) {
            return {
                success: false,
                error: 'JWT token is required. Please authenticate with googleSheets platform first using the doAuth tool.'
            };
        }

        // Decode JWT to get userId
        const unAuthData = jwt.decodeJwt(jwtToken);

        if (!unAuthData?.id) {
            return {
                success: false,
                error: 'Invalid JWT token: userId not found'
            };
        }

        // Find the user
        const user = await UserModel.findByPk(unAuthData.id);

        if (!user) {
            return {
                success: false,
                error: 'User not found. Please authenticate with googleSheets platform first.'
            };
        }


        if (sheetName) {
            const createSheetResponse = await axios.post(`${process.env.APP_SERVER}/googleSheets/sheet?jwtToken=${jwtToken}`, { name: sheetName });
            return createSheetResponse.data;
        }
        else {
            // Generate the file picker URL
            const filePickerUrl = `${process.env.APP_SERVER}/googleSheets/filePicker?token=${jwtToken}}`;

            return {
                success: true,
                data: {
                    filePickerUrl,
                    message: 'Please open this URL in a browser to select a Google Sheet. After selecting a sheet, it will be configured for logging your calls and messages.'
                }
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

