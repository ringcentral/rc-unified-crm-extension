/* eslint-disable no-param-reassign */
const { parsePhoneNumber } = require('awesome-phonenumber');
const moment = require('moment');
const {
  performRequest,
  mapFindContactResponse,
  mapCreateCallLogResponse,
  mapGetCallLogResponse,
  getByPath,
} = require('./engine');
const { Connector } = require('../../models/dynamo/connectorSchema');

function getAuthType() {
  // TODO: implement oauth auth type
  return 'apiKey';
}

function getBasicAuth({ apiKey }) {
  return Buffer.from(`${apiKey}:`).toString('base64');
}

async function loadPlatformConfig(proxyId) {
  if (!proxyId) {
    return null;
  }
  try {
    const proxyConfig = await Connector.getProxyConfig(proxyId);
    return proxyConfig;
  } catch (error) {
    console.error('Error getting proxy config: ', proxyId);
    return null;
  }
}

async function getUserInfo({ authHeader, hostname, additionalInfo, platform, apiKey, proxyId }) {
  const cfg = await loadPlatformConfig(proxyId);
  if (!cfg || !cfg.operations?.getUserInfo) {
    // Fallback if no getUserInfo operation defined
    return {
      successful: false,
      returnMessage: {
        messageType: 'warning',
        message: `Could not load user information. The platform does not support getUserInfo operation.`,
        ttl: 1000
      }
    };
  }
  const response = await performRequest({
    config: cfg,
    opName: 'getUserInfo',
    inputs: {
      additionalInfo,
      apiKey,
      hostname,
      platform,
    },
    user: {},
    authHeader
  });
  const map = cfg.operations.getUserInfo.responseMapping || {};
  const responseCtx = {
    response: response.data,
    additionalInfo,
    apiKey,
    hostname,
    platform,
  };
  const rawUserId = map.idPath ? getByPath(responseCtx, map.idPath) : undefined;
  const id = `${rawUserId}-${platform}`;
  const name = map.namePath ? getByPath(responseCtx, map.namePath) : rawUserId;
  const timezoneName = map.timezoneNamePath ? getByPath(responseCtx, map.timezoneNamePath) : undefined;
  const overridingApiKey = map.overridingApiKeyPath ? getByPath(responseCtx, map.overridingApiKeyPath) : undefined;
  // platformAdditionalInfo mapping and cleanup
  const platformAdditionalInfo = Object.assign({}, additionalInfo || {});
  if (platformAdditionalInfo.password) delete platformAdditionalInfo.password;
  if (map.platformAdditionalInfoPaths && typeof map.platformAdditionalInfoPaths === 'object') {
    for (const [key, expr] of Object.entries(map.platformAdditionalInfoPaths)) {
      platformAdditionalInfo[key] = getByPath(responseCtx, expr);
    }
  }
  const message = map.messagePath ? (getByPath(responseCtx, map.messagePath) || `Connected to ${platform}.`) : `Connected to ${platform}.`;
  return {
    successful: true,
    platformUserInfo: Object.assign(
      { id, name },
      timezoneName ? { timezoneName } : {},
      overridingApiKey ? { overridingApiKey } : {},
      Object.keys(platformAdditionalInfo).length ? { platformAdditionalInfo } : {}
    ),
    returnMessage: {
      messageType: 'success',
      message,
      ttl: 1000
    }
  };
}

async function unAuthorize({ user }) {
  const cfg = await loadPlatformConfig(user?.platformAdditionalInfo?.proxyId);
  if (cfg?.operations?.unAuthorize) {
    await performRequest({
      config: cfg,
      opName: 'unAuthorize',
      inputs: { user },
      user,
    });
  }
  user.accessToken = '';
  user.refreshToken = '';
  await user.save();
  return {
    successful: true,
    returnMessage: {
      messageType: 'success',
      message: 'Logged out',
      ttl: 1000
    }
  };
}

async function findContact({ user, authHeader, phoneNumber, overridingFormat, isExtension }) {
  const cfg = await loadPlatformConfig(user?.platformAdditionalInfo?.proxyId);
  if (!cfg.operations?.findContact) {
    return { successful: true, matchedContactInfo: [] };
  }
  let formattedPhoneNumber = phoneNumber.replace(' ', '+')
  const parsedPhoneNumber = parsePhoneNumber(formattedPhoneNumber);
  const response = await performRequest({
    config: cfg,
    opName: 'findContact',
    inputs: { phoneNumber, parsedPhoneNumber, overridingFormat, isExtension },
    user,
    authHeader
  });
  const matchedContactInfo = mapFindContactResponse({ config: cfg, response });
  return {
    successful: true,
    matchedContactInfo,
    returnMessage: {
      messageType: 'success',
      message: `Found ${matchedContactInfo.length} contacts`,
      ttl: 3000
    }
  };
}

async function createContact({ user, authHeader, phoneNumber, newContactName, newContactType, additionalSubmission }) {
  const cfg = await loadPlatformConfig(user?.platformAdditionalInfo?.proxyId);
  if (!cfg.operations?.createContact) {
    return { contactInfo: null, returnMessage: { message: 'Not supported', messageType: 'warning', ttl: 2000 } };
  }
  const response = await performRequest({
    config: cfg,
    opName: 'createContact',
    inputs: { phoneNumber, newContactName, newContactType, additionalSubmission },
    user,
    authHeader
  });
  const map = cfg.operations.createContact.responseMapping || {};
  const responseCtx = { response: response.data };
  const contactInfo = map.idPath ? {
    id: getByPath(responseCtx, map.idPath || 'response.id'),
    name: getByPath(responseCtx, map.namePath || 'response.name'),
    type: getByPath(responseCtx, map.typePath || 'response.type') || 'Contact',
  } : null;
  return { contactInfo, returnMessage: { message: 'Contact created', messageType: 'success', ttl: 2000 } };
}

async function createCallLog({ user, contactInfo, authHeader, callLog, note, additionalSubmission, aiNote, transcript, hashedAccountId, isFromSSCL, composedLogDetails, proxyConfig = null }) {
  const cfg = proxyConfig ? proxyConfig : (await loadPlatformConfig(user?.platformAdditionalInfo?.proxyId));
  if (!cfg || !cfg.operations?.createCallLog) {
    return { logId: undefined, returnMessage: { message: 'Not supported', messageType: 'warning', ttl: 2000 } };
  }
  const response = await performRequest({
    config: cfg,
    opName: 'createCallLog',
    inputs: {
      contactInfo,
      callLog,
      note,
      additionalSubmission,
      aiNote,
      transcript,
      composedLogDetails,
      hashedAccountId,
      isFromSSCL,
      subject: callLog.customSubject ?? `${callLog.direction} Call ${callLog.direction === 'Outbound' ? 'to' : 'from'} ${contactInfo.name}`,
      startTime: moment(callLog.startTime).utc().toISOString(),
      endTime: moment(callLog.startTime).utc().add(callLog.duration, 'seconds').toISOString()
    },
    user,
    authHeader
  });
  const { logId } = mapCreateCallLogResponse({ config: cfg, response });
  return {
    logId,
    returnMessage: {
      message: 'Call logged',
      messageType: 'success',
      ttl: 2000
    }
  };
}

async function getCallLog({ user, callLogId, contactId, authHeader, proxyConfig = null }) {
  const cfg = proxyConfig ? proxyConfig : (await loadPlatformConfig(user?.platformAdditionalInfo?.proxyId));
  if (!cfg || !cfg.operations?.getCallLog) {
    return { callLogInfo: null, returnMessage: { message: 'Not supported', messageType: 'warning', ttl: 2000 } };
  }
  const response = await performRequest({
    config: cfg,
    opName: 'getCallLog',
    inputs: { thirdPartyLogId: callLogId, contactId },
    user,
    authHeader
  });
  const mapped = mapGetCallLogResponse({ config: cfg, response });
  return Object.assign(mapped, { returnMessage: { message: 'Call log fetched.', messageType: 'success', ttl: 3000 } });
}

async function updateCallLog({ user, existingCallLog, authHeader, recordingLink, recordingDownloadLink, subject, note, startTime, duration, result, aiNote, transcript, legs, additionalSubmission, composedLogDetails, existingCallLogDetails, hashedAccountId, isFromSSCL, proxyConfig = null }) {
  const cfg = proxyConfig ? proxyConfig : (await loadPlatformConfig(user?.platformAdditionalInfo?.proxyId));
  if (!cfg || !cfg.operations?.updateCallLog) {
    return { returnMessage: { message: 'Not supported', messageType: 'warning', ttl: 2000 } };
  }
  await performRequest({
    config: cfg,
    opName: 'updateCallLog',
    inputs: {
      existingCallLog,
      recordingLink,
      recordingDownloadLink,
      subject,
      note,
      startTime: moment(startTime).utc().toISOString(),
      endTime: moment(startTime).utc().add(duration, 'seconds').toISOString(),
      duration,
      result, aiNote, transcript, legs, additionalSubmission, composedLogDetails, existingCallLogDetails, hashedAccountId, isFromSSCL,
    },
    user,
    authHeader
  });
  return {
    updatedNote: null,
    returnMessage: {
      message: 'Call log updated.',
      messageType: 'success',
      ttl: 3000
    }
  };
}

async function upsertCallDisposition({ user, existingCallLog, authHeader, dispositions }) {
  const cfg = await loadPlatformConfig(user?.platformAdditionalInfo?.proxyId);
  if (!cfg.operations?.upsertCallDisposition) {
    return { returnMessage: { message: 'Not supported', messageType: 'warning', ttl: 2000 } };
  }
  await performRequest({
    config: cfg,
    opName: 'upsertCallDisposition',
    inputs: { existingCallLog, dispositions },
    user,
    authHeader
  });
  return { logId: existingCallLog.thirdPartyLogId, returnMessage: { message: 'Disposition updated', messageType: 'success', ttl: 2000 } };
}

async function createMessageLog({ user, contactInfo, authHeader, message, additionalSubmission, recordingLink, faxDocLink, faxDownloadLink }) {
  const cfg = await loadPlatformConfig(user?.platformAdditionalInfo?.proxyId);
  if (!cfg.operations?.createMessageLog) {
    return { logId: undefined, returnMessage: { message: 'Not supported', messageType: 'warning', ttl: 2000 } };
  }
  const response = await performRequest({
    config: cfg,
    opName: 'createMessageLog',
    inputs: { contactInfo, message, additionalSubmission, recordingLink, faxDocLink, faxDownloadLink },
    user,
    authHeader
  });
  const map = cfg.operations.createMessageLog.responseMapping || {};
  const responseCtx = { response: response.data };
  const logId = getByPath(responseCtx, map.idPath || 'response.id');
  return { logId, returnMessage: { message: 'Message logged', messageType: 'success', ttl: 1000 } };
}

async function updateMessageLog({ user, contactInfo, existingMessageLog, message, authHeader, additionalSubmission }) {
  const cfg = await loadPlatformConfig(user?.platformAdditionalInfo?.proxyId);
  if (!cfg.operations?.updateMessageLog) {
    return { returnMessage: { message: 'Not supported', messageType: 'warning', ttl: 2000 } };
  }
  await performRequest({
    config: cfg,
    opName: 'updateMessageLog',
    inputs: { contactInfo, existingMessageLog, message, additionalSubmission },
    user,
    authHeader
  });
  return { returnMessage: { message: 'Message log updated', messageType: 'success', ttl: 3000 } };
}

async function getLicenseStatus({ userId, proxyId, platform }) {
  const cfg = await loadPlatformConfig(proxyId);
  if (!cfg.operations?.getLicenseStatus) {
    return { isLicenseValid: true, licenseStatus: 'Basic', licenseStatusDescription: '' };
  }
  const response = await performRequest({
    config: cfg,
    opName: 'getLicenseStatus',
    inputs: { userId, platform },
  });
  const map = cfg.operations.getLicenseStatus.responseMapping || {};
  const responseCtx = { response: response.data };
  const isLicenseValid = getByPath(responseCtx, map.isLicenseValidPath || 'response.isLicenseValid');
  const licenseStatus = getByPath(responseCtx, map.licenseStatusPath || 'response.licenseStatus');
  const licenseStatusDescription = getByPath(responseCtx, map.licenseStatusDescriptionPath || 'response.licenseStatusDescription');
  return { isLicenseValid, licenseStatus, licenseStatusDescription };
}

exports.getAuthType = getAuthType;
exports.getBasicAuth = getBasicAuth;
exports.getUserInfo = getUserInfo;
exports.createCallLog = createCallLog;
exports.updateCallLog = updateCallLog;
exports.getCallLog = getCallLog;
exports.createMessageLog = createMessageLog;
exports.updateMessageLog = updateMessageLog;
exports.findContact = findContact;
exports.createContact = createContact;
exports.unAuthorize = unAuthorize;
exports.getLicenseStatus = getLicenseStatus;
exports.upsertCallDisposition = upsertCallDisposition;
