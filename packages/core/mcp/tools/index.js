/**
 * MCP Tools Index
 * 
 * This file exports all available MCP tools for the RC Unified CRM Extension.
 */

// const auth = require('./auth');
const getHelp = require('./getHelp');
const getPublicConnectors = require('./getPublicConnectors');
const setConnector = require('./setConnector');
const collectAuthInfo = require('./collectAuthInfo');
const doAuth = require('./doAuth');
const checkAuthStatus = require('./checkAuthStatus');
const logout = require('./logout');
const findContact = require('./findContactByPhone');
const findContactWithName = require('./findContactByName');
const getCallLog = require('./getCallLog');
const createCallLog = require('./createCallLog');
const updateCallLog = require('./updateCallLog');
const createMessageLog = require('./createMessageLog');
const rcGetCallLogs = require('./rcGetCallLogs');

// Export all tools
module.exports = {
    getHelp,
    getPublicConnectors,
    setConnector,
    collectAuthInfo,
    doAuth,
    checkAuthStatus,
    logout,
    findContact,
    findContactWithName,
    //getCallLog,
    createCallLog,
    //updateCallLog,
    //createMessageLog,
    rcGetCallLogs
};

// Export tools as an array for easy iteration
module.exports.tools = [
    getHelp,
    getPublicConnectors,
    setConnector,
    collectAuthInfo,
    doAuth,
    checkAuthStatus,
    logout,
    findContact,
    findContactWithName,
    //getCallLog,
    createCallLog,
    //updateCallLog,
    //createMessageLog,
    rcGetCallLogs
];

