/**
 * MCP Tools Index
 *
 * Two separate registries:
 *  - tools:       Registered in the MCP server — visible to and callable by the AI model
 *  - widgetTools: Only accessible via POST /mcp/widget-tool-call — hidden from the AI model
 */

const getHelp = require('./getHelp');
const getPublicConnectors = require('./getPublicConnectors');
const doAuth = require('./doAuth');
const checkAuthStatus = require('./checkAuthStatus');
const logout = require('./logout');
const findContact = require('./findContactByPhone');
const findContactWithName = require('./findContactByName');
const createCallLog = require('./createCallLog');
const rcGetCallLogs = require('./rcGetCallLogs');
const getGoogleFilePicker = require('./getGoogleFilePicker');
const createContact = require('./createContact');

// AI-visible MCP tools — registered in the MCP server
module.exports.tools = [
    getHelp,
    getPublicConnectors,
    logout,
    findContact,
    findContactWithName,
    createCallLog,
    rcGetCallLogs,
    // getGoogleFilePicker,
    createContact,
];

// Widget-only tools — callable via /mcp/widget-tool-call, NOT registered as MCP tools
module.exports.widgetTools = [
    doAuth,
    checkAuthStatus,
];

