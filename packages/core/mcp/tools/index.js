/**
 * MCP Tools Index
 * 
 * This file exports all available MCP tools for the RC Unified CRM Extension.
 */

// const auth = require('./auth');
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

// Export all tools
module.exports = {
    getPublicConnectors,
    setConnector,
    collectAuthInfo,
    doAuth,
    checkAuthStatus,
    logout,
    findContact,
    findContactWithName,
    getCallLog,
    createCallLog,
    updateCallLog,
    createMessageLog
};

// Export tools as an array for easy iteration
module.exports.tools = [
    getPublicConnectors,
    setConnector,
    collectAuthInfo,
    doAuth,
    checkAuthStatus,
    logout,
    findContact,
    findContactWithName,
    getCallLog,
    createCallLog,
    updateCallLog,
    createMessageLog
];

