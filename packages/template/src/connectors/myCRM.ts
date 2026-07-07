// Overview:
// 1. Try to play with it first. Login, make a call, log a call, edit its call logs etc. Most functionalities are working under mock data
// 2. Here it defaults to use 3 JSON files as mock data for CRM API responses, so data will be there for easy view
// 3. Modify and implement the interfaces to meet actual CRM APIs' requirements

// Note: Some interfaces are optional (marked below) 

exports.getAuthType = require('./interfaces/getAuthType');
exports.getLogFormatType = require('./interfaces/getLogFormatType');

// Choose 1 of the following 2 functions, delete the rest. getBasicAuth is used for default testing
exports.getBasicAuth = require('./interfaces/getBasicAuth');
// exports.getOauthInfo = require('./interfaces/getOauthInfo');

// -----------------------------------------------------------------
// ---TODO.1: Implement API call to retrieve user info--------------
// -----------------------------------------------------------------
exports.getUserInfo = require('./interfaces/getUserInfo');

// -----------------------------------------------------------------
// ---TODO.2: Implement token revocation if CRM platform requires---
// -----------------------------------------------------------------
exports.unAuthorize = require('./interfaces/unAuthorize');

// -----------------------------------------------------------------
// ---TODO.3: Implement contact matching----------------------------
// -----------------------------------------------------------------
exports.findContact = require('./interfaces/findContact');

// -----------------------------------------------------------------
// ---TODO.4: Implement call logging--------------------------------
// -----------------------------------------------------------------
exports.createCallLog = require('./interfaces/createCallLog');

// -----------------------------------------------------------------
// ---TODO.5: Implement call log fetching----------------------------
// -----------------------------------------------------------------
exports.getCallLog = require('./interfaces/getCallLog');

// -----------------------------------------------------------------
// ---TODO.6: Implement call log update----------------------------
// -----------------------------------------------------------------
exports.updateCallLog = require('./interfaces/updateCallLog');

// -----------------------------------------------------------------
// ---TODO.7: Implement message logging----------------------------
// -----------------------------------------------------------------
exports.createMessageLog = require('./interfaces/createMessageLog');

// -----------------------------------------------------------------
// ---TODO.8: Implement message logging----------------------------
// -----------------------------------------------------------------
exports.updateMessageLog = require('./interfaces/updateMessageLog');

// -----------------------------------------------------------------
// ---TODO.9: Implement contact creation----------------------------
// -----------------------------------------------------------------
exports.createContact = require('./interfaces/createContact');

// Optional
// It's where you want to associate the call log with another entity depending on CRM's own concepts(e.g. Deal, Matter, Case etc.)
exports.upsertCallDisposition = require('./interfaces/upsertCallDisposition');

// Optional
// It's where you want to get user list for server-side call logging user mapping
exports.getUserList = require('./interfaces/getUserList');

// Optional
// It's where you want to provide additional feature for users to search contact by name
exports.findContactWithName = require('./interfaces/findContactWithName');