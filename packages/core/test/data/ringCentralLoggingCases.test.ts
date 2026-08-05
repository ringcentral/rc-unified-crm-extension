const {
  buildCallLogIncomingData,
  rcCallLogSimpleCases,
  rcCallLogResultCases,
  rcCallLogDetailedCases,
} = require('./callLoggingCases');
const {
  buildMessageIncomingData,
  rcMessageFormatCases,
  rcMessageMediaCases,
  rcMessageStatusCases,
  rcMessageAvailabilityCases,
  rcMessageReadStatusCases,
  rcMessagePriorityCases,
  rcMessageWithOptionalFieldsOmitted,
} = require('./messageLoggingCases');

describe('RingCentral logging test data', () => {
  describe('Call Log records', () => {
    test.each<[any]>(rcCallLogSimpleCases as [any][])(
      '$label uses the RingCentral Simple record shape',
      ({ record, expectedHasRecording }) => {
        expect(record).toEqual(expect.objectContaining({
          uri: expect.stringContaining('?view=Simple'),
          id: expect.any(String),
          sessionId: expect.any(String),
          telephonySessionId: expect.any(String),
          startTime: expect.any(String),
          duration: expect.any(Number),
          type: 'Voice',
          direction: expect.stringMatching(/^(Inbound|Outbound)$/),
          action: expect.any(String),
          result: expect.any(String),
          from: expect.any(Object),
          to: expect.any(Object),
        }));
        expect(record.legs).toBeUndefined();
        expect(!!record.recording).toBe(expectedHasRecording);
      },
    );

    test.each<[any]>(rcCallLogDetailedCases as [any][])(
      '$label uses structured RingCentral Detailed legs',
      ({ record, expectedLegDirections, expectedLegTypes }) => {
        expect(record.uri).toContain('?view=Detailed');
        expect(record.transport).toBe('PSTN');
        expect(record.lastModifiedTime).toEqual(expect.any(String));
        expect(record.legs.map((leg) => leg.direction)).toEqual(expectedLegDirections);
        expect(record.legs.map((leg) => leg.legType)).toEqual(expectedLegTypes);
        for (const leg of record.legs) {
          expect(leg).toEqual(expect.objectContaining({
            startTime: expect.any(String),
            duration: expect.any(Number),
            from: expect.any(Object),
            to: expect.any(Object),
          }));
        }
      },
    );

    test('covers the main RingCentral call result and direction combinations', () => {
      expect(rcCallLogResultCases.map(({ direction, result }) => `${direction}:${result}`)).toEqual([
        'Inbound:Accepted',
        'Inbound:Missed',
        'Inbound:Voicemail',
        'Outbound:Call connected',
        'Outbound:No Answer',
        'Outbound:Busy',
      ]);
    });

    test('keeps raw recording metadata separate from the App Connect link alias', () => {
      const rawRecordedCall = rcCallLogSimpleCases.find(({ record }) => !!record.recording).record;
      const rawUnrecordedCall = rcCallLogSimpleCases.find(({ record }) => !record.recording).record;

      expect(rawRecordedCall.recording).toEqual(expect.objectContaining({
        uri: expect.any(String),
        id: expect.any(String),
        type: expect.stringMatching(/^(Automatic|OnDemand)$/),
        contentUri: expect.any(String),
      }));
      expect(rawRecordedCall.recording.link).toBeUndefined();
      expect(buildCallLogIncomingData({ logInfo: rawRecordedCall }).logInfo.recording.link)
        .toBe(rawRecordedCall.recording.contentUri);
      expect(buildCallLogIncomingData({ logInfo: rawUnrecordedCall }).logInfo.recording)
        .toBeUndefined();
    });
  });

  describe('Message Store records', () => {
    test.each<[any]>(rcMessageFormatCases as [any][])(
      '$label preserves a RingCentral Message Store record',
      ({ message }) => {
        expect(message).toEqual(expect.objectContaining({
          uri: expect.any(String),
          id: expect.anything(),
          type: 'SMS',
          direction: expect.stringMatching(/^(Inbound|Outbound)$/),
          creationTime: expect.any(String),
          from: expect.any(Object),
          to: expect.any(Array),
          subject: expect.any(String),
          messageStatus: expect.any(String),
          conversationId: expect.anything(),
        }));
        expect(message.conversationLogId).toBeUndefined();
        expect(message.correspondents).toBeUndefined();
      },
    );

    test('covers RingCentral delivery, availability, read, and priority values', () => {
      expect(rcMessageStatusCases.map(({ message }) => message.messageStatus)).toEqual([
        'Received',
        'Queued',
        'Sent',
        'Delivered',
        'SendingFailed',
        'DeliveryFailed',
      ]);
      expect(rcMessageAvailabilityCases.map(({ message }) => message.availability)).toEqual([
        'Alive',
        'Deleted',
        'Purged',
      ]);
      expect(rcMessageReadStatusCases.map(({ message }) => message.readStatus)).toEqual([
        'Unread',
        'Read',
      ]);
      expect(rcMessagePriorityCases.map(({ message }) => message.priority)).toEqual([
        'Normal',
        'High',
      ]);
    });

    test.each<[any]>(rcMessageMediaCases as [any][])(
      '$label keeps RC media metadata separate from AC attachment enrichment',
      ({ rawMessage, acMessage }) => {
        expect(rawMessage.type).toMatch(/^(SMS|Fax|VoiceMail)$/);
        expect(rawMessage.attachments).toEqual(expect.arrayContaining([
          expect.objectContaining({
            id: expect.anything(),
            uri: expect.any(String),
            type: expect.stringMatching(/^(AudioRecording|RenderedDocument|Text|MmsAttachment)$/),
            contentType: expect.any(String),
          }),
        ]));
        expect(rawMessage.attachments.every((attachment) => attachment.link === undefined)).toBe(true);
        expect(acMessage).not.toBe(rawMessage);
      },
    );

    test('preserves an exact sparse Message Store record without rehydrating optional fields', () => {
      const incomingData = buildMessageIncomingData({
        logInfo: {
          conversationId: rcMessageWithOptionalFieldsOmitted.conversationId,
          conversationLogId: 'sparse-message-conversation-log',
          correspondents: [{ phoneNumber: rcMessageWithOptionalFieldsOmitted.from.phoneNumber }],
          messages: [rcMessageWithOptionalFieldsOmitted],
        },
      });
      const [message] = incomingData.logInfo.messages;

      expect(message).toEqual(rcMessageWithOptionalFieldsOmitted);
      expect(message).not.toHaveProperty('attachments');
      expect(message).not.toHaveProperty('readStatus');
      expect(message).not.toHaveProperty('priority');
      expect(message).not.toHaveProperty('conversation');
      expect(message).not.toHaveProperty('lastModifiedTime');
    });
  });
});

export {};
