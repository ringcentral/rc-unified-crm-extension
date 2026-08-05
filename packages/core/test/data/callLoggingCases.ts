const FIXED_CALL_START_TIME = '2026-07-14T02:30:00.000Z';
const FIXED_CALL_LAST_MODIFIED_TIME = '2026-07-14T02:32:05.000Z';

const RC_ACCOUNT_ID = '400100000001';
const RC_EXTENSION_ID = '400200000001';
const RC_PLATFORM_URL = 'https://platform.ringcentral.com/restapi/v1.0';
const RC_MEDIA_URL = 'https://media.ringcentral.com/restapi/v1.0';

function hasOwn(object: any, key: string) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function cloneCallLeg(leg: any) {
  return {
    ...leg,
    ...(hasOwn(leg, 'from') && leg.from ? { from: { ...leg.from } } : {}),
    ...(hasOwn(leg, 'to') && leg.to ? { to: { ...leg.to } } : {}),
    ...(hasOwn(leg, 'extension') && leg.extension ? { extension: { ...leg.extension } } : {}),
  };
}

function mergeCallRecord(baseRecord: any, overrides: any = {}) {
  const result = { ...baseRecord, ...overrides };

  for (const key of ['from', 'to', 'recording', 'extension']) {
    if (hasOwn(overrides, key)) {
      result[key] = overrides[key] && typeof overrides[key] === 'object'
        ? { ...(baseRecord[key] || {}), ...overrides[key] }
        : overrides[key];
      if (result[key] && typeof result[key] === 'object') {
        for (const nestedKey of Object.keys(result[key])) {
          if (result[key][nestedKey] === undefined) {
            delete result[key][nestedKey];
          }
        }
      }
    } else if (baseRecord[key] && typeof baseRecord[key] === 'object') {
      result[key] = { ...baseRecord[key] };
    }
  }

  if (hasOwn(overrides, 'legs')) {
    result.legs = Array.isArray(overrides.legs)
      ? overrides.legs.map(cloneCallLeg)
      : overrides.legs;
  } else if (Array.isArray(baseRecord.legs)) {
    result.legs = baseRecord.legs.map(cloneCallLeg);
  }

  return result;
}

function buildRingCentralCallParty(overrides: any = {}) {
  return {
    phoneNumber: '+14155550199',
    name: 'Test Contact',
    location: 'San Francisco, CA',
    ...overrides,
  };
}

function buildRingCentralCallRecording(overrides: any = {}) {
  const id = overrides.id || 'recording-1001';
  return {
    uri: `${RC_PLATFORM_URL}/account/${RC_ACCOUNT_ID}/recording/${id}`,
    id,
    type: 'OnDemand',
    contentUri: `${RC_MEDIA_URL}/account/${RC_ACCOUNT_ID}/recording/${id}/content`,
    ...overrides,
  };
}

function buildRingCentralCallLeg(overrides: any = {}) {
  const baseLeg = {
    startTime: FIXED_CALL_START_TIME,
    duration: 54,
    type: 'Voice',
    direction: 'Inbound',
    action: 'Phone Call',
    result: 'Accepted',
    to: buildRingCentralCallParty({
      phoneNumber: '+14155550101',
      extensionNumber: '101',
      name: 'Test Agent',
      location: 'San Mateo, CA',
    }),
    from: buildRingCentralCallParty(),
    telephonySessionId: 's-call-log-telephony-session',
    transport: 'PSTN',
    legType: 'Accept',
  };

  return mergeCallRecord(baseLeg, overrides);
}

// Raw records below follow RingCentral's Call Log Simple/Detailed response shapes:
// https://developers.ringcentral.com/guide/voice/call-log/api
// Recording metadata follows:
// https://developers.ringcentral.com/guide/voice/call-log/recordings
function buildSimpleCallLogRecord(overrides: any = {}) {
  const id = overrides.id || 'call-log-simple-inbound';
  const baseRecord = {
    uri: `${RC_PLATFORM_URL}/account/${RC_ACCOUNT_ID}/call-log/${id}?view=Simple`,
    id,
    sessionId: 'call-log-simple-session',
    startTime: FIXED_CALL_START_TIME,
    telephonySessionId: 's-call-log-simple-session',
    duration: 54,
    type: 'Voice',
    direction: 'Inbound',
    action: 'Phone Call',
    result: 'Accepted',
    to: {
      phoneNumber: '+14155550101',
    },
    from: buildRingCentralCallParty(),
  };

  return mergeCallRecord(baseRecord, overrides);
}

function buildDetailedCallLogRecord(overrides: any = {}) {
  const id = overrides.id || 'call-log-detailed-forwarded';
  const telephonySessionId = overrides.telephonySessionId || 's-call-log-detailed-session';
  const defaultLegs = [
    buildRingCentralCallLeg({
      telephonySessionId,
      to: { phoneNumber: '+14155550101' },
    }),
    buildRingCentralCallLeg({
      telephonySessionId,
      to: {
        phoneNumber: '+14155550101',
        extensionNumber: '101',
        name: 'Test Agent',
      },
      extension: {
        uri: `${RC_PLATFORM_URL}/account/${RC_ACCOUNT_ID}/extension/${RC_EXTENSION_ID}`,
        id: RC_EXTENSION_ID,
      },
    }),
    buildRingCentralCallLeg({
      startTime: '2026-07-14T02:30:04.000Z',
      duration: 50,
      direction: 'Outbound',
      action: 'FindMe',
      telephonySessionId,
      legType: 'FindMe',
      from: {
        phoneNumber: '+14155550199',
        name: 'Test Agent',
      },
      to: buildRingCentralCallParty({
        phoneNumber: '+14155550188',
        name: 'Agent Mobile',
        location: 'Oakland, CA',
      }),
      extension: {
        uri: `${RC_PLATFORM_URL}/account/${RC_ACCOUNT_ID}/extension/${RC_EXTENSION_ID}`,
        id: RC_EXTENSION_ID,
      },
    }),
  ];
  const baseRecord = buildSimpleCallLogRecord({
    uri: `${RC_PLATFORM_URL}/account/${RC_ACCOUNT_ID}/call-log/${id}?view=Detailed`,
    id,
    sessionId: 'call-log-detailed-session',
    telephonySessionId,
    transport: 'PSTN',
    lastModifiedTime: FIXED_CALL_LAST_MODIFIED_TIME,
    legs: defaultLegs,
  });

  return mergeCallRecord(baseRecord, overrides);
}

const rcCallLogSimpleCases = [
  {
    label: 'inbound accepted call without a recording',
    view: 'Simple',
    record: buildSimpleCallLogRecord(),
    expectedContactNumber: '+14155550199',
    expectedHasRecording: false,
  },
  {
    label: 'outbound connected call with on-demand recording metadata',
    view: 'Simple',
    record: buildSimpleCallLogRecord({
      id: 'call-log-simple-outbound-recorded',
      uri: `${RC_PLATFORM_URL}/account/${RC_ACCOUNT_ID}/call-log/call-log-simple-outbound-recorded?view=Simple`,
      sessionId: 'call-log-simple-outbound-recorded-session',
      telephonySessionId: 's-call-log-simple-outbound-recorded',
      duration: 125,
      direction: 'Outbound',
      result: 'Call connected',
      from: {
        phoneNumber: '+14155550101',
        extensionNumber: '101',
        name: 'Test Agent',
      },
      to: buildRingCentralCallParty(),
      recording: buildRingCentralCallRecording(),
    }),
    expectedContactNumber: '+14155550199',
    expectedHasRecording: true,
  },
  {
    label: 'inbound missed call with optional party metadata omitted',
    view: 'Simple',
    record: buildSimpleCallLogRecord({
      id: 'call-log-simple-inbound-missed',
      uri: `${RC_PLATFORM_URL}/account/${RC_ACCOUNT_ID}/call-log/call-log-simple-inbound-missed?view=Simple`,
      sessionId: 'call-log-simple-inbound-missed-session',
      telephonySessionId: 's-call-log-simple-inbound-missed',
      duration: 0,
      result: 'Missed',
      from: { phoneNumber: '+14155550177', name: undefined, location: undefined },
      to: { phoneNumber: '+14155550101' },
    }),
    expectedContactNumber: '+14155550177',
    expectedHasRecording: false,
  },
  {
    label: 'outbound unanswered call without a recording',
    view: 'Simple',
    record: buildSimpleCallLogRecord({
      id: 'call-log-simple-outbound-no-answer',
      uri: `${RC_PLATFORM_URL}/account/${RC_ACCOUNT_ID}/call-log/call-log-simple-outbound-no-answer?view=Simple`,
      sessionId: 'call-log-simple-outbound-no-answer-session',
      telephonySessionId: 's-call-log-simple-outbound-no-answer',
      duration: 30,
      direction: 'Outbound',
      result: 'No Answer',
      from: {
        phoneNumber: '+14155550101',
        extensionNumber: '101',
        name: 'Test Agent',
      },
      to: { phoneNumber: '+14155550166' },
    }),
    expectedContactNumber: '+14155550166',
    expectedHasRecording: false,
  },
];

const rcCallLogResultCases = [
  { label: 'inbound accepted', direction: 'Inbound', result: 'Accepted', duration: 54 },
  { label: 'inbound missed', direction: 'Inbound', result: 'Missed', duration: 0 },
  { label: 'inbound voicemail', direction: 'Inbound', result: 'Voicemail', duration: 32 },
  { label: 'outbound connected', direction: 'Outbound', result: 'Call connected', duration: 125 },
  { label: 'outbound no answer', direction: 'Outbound', result: 'No Answer', duration: 30 },
  { label: 'outbound busy', direction: 'Outbound', result: 'Busy', duration: 4 },
].map((item, index) => ({
  ...item,
  record: buildSimpleCallLogRecord({
    id: `call-log-result-${index + 1}`,
    uri: `${RC_PLATFORM_URL}/account/${RC_ACCOUNT_ID}/call-log/call-log-result-${index + 1}?view=Simple`,
    sessionId: `call-log-result-session-${index + 1}`,
    telephonySessionId: `s-call-log-result-${index + 1}`,
    direction: item.direction,
    result: item.result,
    duration: item.duration,
    from: item.direction === 'Inbound'
      ? buildRingCentralCallParty()
      : { phoneNumber: '+14155550101', extensionNumber: '101', name: 'Test Agent' },
    to: item.direction === 'Inbound'
      ? { phoneNumber: '+14155550101', extensionNumber: '101', name: 'Test Agent' }
      : buildRingCentralCallParty(),
  }),
}));

const rcCallLogDetailedCases = [
  {
    label: 'inbound forwarded call with accept and FindMe legs',
    view: 'Detailed',
    record: buildDetailedCallLogRecord(),
    expectedLegDirections: ['Inbound', 'Inbound', 'Outbound'],
    expectedLegTypes: ['Accept', 'Accept', 'FindMe'],
  },
  {
    label: 'outbound detailed call with recording and extension metadata',
    view: 'Detailed',
    record: buildDetailedCallLogRecord({
      id: 'call-log-detailed-outbound-recorded',
      uri: `${RC_PLATFORM_URL}/account/${RC_ACCOUNT_ID}/call-log/call-log-detailed-outbound-recorded?view=Detailed`,
      sessionId: 'call-log-detailed-outbound-recorded-session',
      telephonySessionId: 's-call-log-detailed-outbound-recorded',
      duration: 125,
      direction: 'Outbound',
      result: 'Call connected',
      from: {
        phoneNumber: '+14155550101',
        extensionNumber: '101',
        name: 'Test Agent',
      },
      to: buildRingCentralCallParty(),
      recording: buildRingCentralCallRecording({ id: 'recording-1002', type: 'Automatic' }),
      legs: [
        buildRingCentralCallLeg({
          duration: 125,
          direction: 'Outbound',
          result: 'Call connected',
          telephonySessionId: 's-call-log-detailed-outbound-recorded',
          legType: 'SipToPstnMetered',
          from: {
            phoneNumber: '+14155550101',
            extensionNumber: '101',
            name: 'Test Agent',
          },
          to: buildRingCentralCallParty(),
          extension: {
            uri: `${RC_PLATFORM_URL}/account/${RC_ACCOUNT_ID}/extension/${RC_EXTENSION_ID}`,
            id: RC_EXTENSION_ID,
          },
        }),
      ],
    }),
    expectedLegDirections: ['Outbound'],
    expectedLegTypes: ['SipToPstnMetered'],
  },
];

const rcCallLogRecordCases = [
  ...rcCallLogSimpleCases,
  ...rcCallLogDetailedCases,
];

function buildCallLogUser(overrides: any = {}) {
  const baseUser = {
    id: 'call-log-user',
    platform: 'testCRM',
    accessToken: 'call-log-access-token',
    rcAccountId: 'call-log-account',
    hostname: 'crm.example.test',
    platformAdditionalInfo: {},
  };

  return {
    ...baseUser,
    ...overrides,
    platformAdditionalInfo: {
      ...baseUser.platformAdditionalInfo,
      ...(overrides.platformAdditionalInfo || {}),
    },
  };
}

function buildCallLogInfoFromRingCentralRecord(record: any, overrides: any = {}) {
  const rawRecord = mergeCallRecord({}, record);
  const enrichedRecord = mergeCallRecord(rawRecord, overrides);
  const extensionParty = enrichedRecord.direction === 'Inbound'
    ? enrichedRecord.to
    : enrichedRecord.from;

  return {
    ...enrichedRecord,
    extensionNumber: enrichedRecord.extensionNumber
      || extensionParty?.extensionNumber
      || '101',
    ...(enrichedRecord.recording
      ? {
        recording: {
          ...enrichedRecord.recording,
          // App Connect's client envelope adds this alias; it is not part of raw RC metadata.
          link: enrichedRecord.recording.link || enrichedRecord.recording.contentUri,
        },
      }
      : {}),
  };
}

function buildCallLogInfo(overrides: any = {}) {
  const rawRecord = buildSimpleCallLogRecord({
    id: 'call-log-id',
    uri: `${RC_PLATFORM_URL}/account/${RC_ACCOUNT_ID}/call-log/call-log-id?view=Simple`,
    sessionId: 'call-log-session',
    telephonySessionId: 'call-log-telephony-session',
    duration: 125,
    direction: 'Outbound',
    result: 'Call connected',
    from: {
      phoneNumber: '+14155550101',
      extensionNumber: '101',
      name: 'Test Agent',
    },
    to: buildRingCentralCallParty(),
    recording: buildRingCentralCallRecording(),
  });

  return buildCallLogInfoFromRingCentralRecord(rawRecord, {
    extensionNumber: '101',
    ...overrides,
  });
}

function buildCallLogIncomingData(overrides: any = {}) {
  const baseIncomingData = {
    logInfo: buildCallLogInfo(),
    contactId: 'call-log-contact',
    contactType: 'Contact',
    contactName: 'Test Contact',
    note: 'Deterministic call note',
    aiNote: '',
    transcript: '',
    additionalSubmission: {},
  };

  return {
    ...baseIncomingData,
    ...overrides,
    logInfo: overrides.logInfo?.uri && overrides.logInfo?.type && overrides.logInfo?.action
      ? buildCallLogInfoFromRingCentralRecord(overrides.logInfo)
      : buildCallLogInfo(overrides.logInfo || {}),
    additionalSubmission: {
      ...baseIncomingData.additionalSubmission,
      ...(overrides.additionalSubmission || {}),
    },
  };
}

function buildCallLogUpdateData(overrides: any = {}) {
  const baseUpdateData = {
    sessionId: 'call-log-session',
    extensionNumber: '101',
    subject: 'Updated deterministic call',
    note: 'Updated deterministic note',
    startTime: FIXED_CALL_START_TIME,
    duration: 245,
    result: 'Call connected',
    direction: 'Outbound',
    from: {
      phoneNumber: '+14155550101',
      extensionNumber: '101',
      name: 'Test Agent',
    },
    to: buildRingCentralCallParty(),
    recordingLink: `${RC_MEDIA_URL}/account/${RC_ACCOUNT_ID}/recording/recording-1002/content`,
    recordingDownloadLink: `${RC_MEDIA_URL}/account/${RC_ACCOUNT_ID}/recording/recording-1002/content?download=true`,
    aiNote: 'Deterministic AI note',
    transcript: 'Deterministic transcript',
    legs: [
      buildRingCentralCallLeg({
        duration: 245,
        direction: 'Outbound',
        result: 'Call connected',
        telephonySessionId: 'call-log-telephony-session',
        legType: 'SipToPstnMetered',
        from: {
          phoneNumber: '+14155550101',
          extensionNumber: '101',
          name: 'Test Agent',
        },
        to: buildRingCentralCallParty(),
      }),
    ],
    ringSenseTranscript: 'ACE transcript',
    ringSenseSummary: 'ACE summary',
    ringSenseAIScore: 91,
    ringSenseBulletedSummary: '- First point\n- Second point',
    ringSenseLink: 'https://ringsense.example.test/call-log',
    additionalSubmission: { disposition: 'Resolved' },
  };

  return {
    ...mergeCallRecord(baseUpdateData, overrides),
    additionalSubmission: {
      ...baseUpdateData.additionalSubmission,
      ...(overrides.additionalSubmission || {}),
    },
  };
}

const callLogLifecycleCases = [
  { label: 'Create', operation: 'createCallLog', sessionId: 'auth-create-session' },
  { label: 'Get', operation: 'getCallLog', sessionId: 'auth-get-session' },
  { label: 'Update', operation: 'updateCallLog', sessionId: 'auth-update-session' },
];

const callLogAuthCases = callLogLifecycleCases.map((item) => ({
  ...item,
  proxyId: `proxy-${item.operation}`,
}));

const callLogDatabaseFailureCases = [
  { label: 'Create duplicate lookup', operation: 'createCallLog', modelMethod: 'findOne' },
  { label: 'Create persistence', operation: 'createCallLog', modelMethod: 'create' },
  { label: 'Get lookup', operation: 'getCallLog', modelMethod: 'findAll' },
  { label: 'Update lookup', operation: 'updateCallLog', modelMethod: 'findOne' },
];

const callLogResultCases = [
  {
    label: 'provider omits the log id',
    connectorResult: {
      returnMessage: { message: 'Provider did not create a log', messageType: 'warning', ttl: 3000 },
      extraDataTracking: { providerAccepted: false },
    },
    expectedSuccessful: false,
    expectedLogId: undefined,
    expectedPersistedLogId: null,
  },
  {
    label: 'provider returns a numeric log id',
    connectorResult: {
      logId: 42,
      returnMessage: { message: 'Call logged', messageType: 'success', ttl: 3000 },
      extraDataTracking: { providerAccepted: true },
    },
    expectedSuccessful: true,
    expectedLogId: 42,
    expectedPersistedLogId: '42',
  },
];

const callLogUpdateInputCases = [
  {
    label: 'uses fullBody before note for plain text',
    logFormat: 'text/plain',
    getResult: {
      callLogInfo: {
        fullBody: 'Existing full body',
        note: 'Existing note fallback',
        fullLogResponse: { id: 'provider-call-log', body: 'Existing full body' },
      },
    },
    expectedExistingBody: 'Existing full body',
    expectedExistingDetails: { id: 'provider-call-log', body: 'Existing full body' },
  },
  {
    label: 'falls back to note for HTML',
    logFormat: 'text/html',
    getResult: {
      callLogInfo: {
        note: '<p>Existing note</p>',
        fullLogResponse: { id: 'provider-call-log', body: '<p>Existing note</p>' },
      },
    },
    expectedExistingBody: '<p>Existing note</p>',
    expectedExistingDetails: { id: 'provider-call-log', body: '<p>Existing note</p>' },
  },
  {
    label: 'continues with an empty body when detail lookup fails',
    logFormat: 'text/markdown',
    getError: 'Provider detail lookup failed',
    expectedExistingBody: '',
    expectedExistingDetails: null,
  },
  {
    label: 'skips composition for a custom format',
    logFormat: 'application/vnd.test-call-log',
    expectedExistingBody: undefined,
    expectedExistingDetails: null,
    expectDetailLookup: false,
  },
];

module.exports = {
  FIXED_CALL_START_TIME,
  FIXED_CALL_LAST_MODIFIED_TIME,
  buildRingCentralCallParty,
  buildRingCentralCallRecording,
  buildRingCentralCallLeg,
  buildSimpleCallLogRecord,
  buildDetailedCallLogRecord,
  buildCallLogInfoFromRingCentralRecord,
  rcCallLogSimpleCases,
  rcCallLogResultCases,
  rcCallLogDetailedCases,
  rcCallLogRecordCases,
  buildCallLogUser,
  buildCallLogInfo,
  buildCallLogIncomingData,
  buildCallLogUpdateData,
  callLogLifecycleCases,
  callLogAuthCases,
  callLogDatabaseFailureCases,
  callLogResultCases,
  callLogUpdateInputCases,
};

export {};
