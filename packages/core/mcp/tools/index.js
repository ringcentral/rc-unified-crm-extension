/**
 * MCP Tools Index
 * 
 * This file exports all available MCP tools for the RC Unified CRM Extension.
 */

const findContact = require('./findContact');
const findContactWithName = require('./findContactWithName');
const getCallLog = require('./getCallLog');
const createCallLog = require('./createCallLog');
const updateCallLog = require('./updateCallLog');
const createMessageLog = require('./createMessageLog');

// Export all tools
module.exports = {
    findContact,
    findContactWithName,
    getCallLog,
    createCallLog,
    updateCallLog,
    createMessageLog
};

// Export tools as an array for easy iteration
module.exports.tools = [
    findContact,
    findContactWithName,
    getCallLog,
    createCallLog,
    updateCallLog,
    createMessageLog
];

