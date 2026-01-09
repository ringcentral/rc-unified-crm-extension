const {
  composeCallLog,
  upsertCallAgentNote,
  upsertCallSessionId,
  upsertRingCentralUserName,
  upsertRingCentralNumberAndExtension,
  upsertCallSubject,
  upsertContactPhoneNumber,
  upsertCallDateTime,
  upsertCallDuration,
  upsertCallResult,
  upsertCallRecording,
  upsertAiNote,
  upsertTranscript,
  upsertLegs,
  upsertRingSenseTranscript,
  upsertRingSenseSummary,
  upsertRingSenseAIScore,
  upsertRingSenseBulletedSummary,
  upsertRingSenseLink,
} = require('../../lib/callLogComposer');
const { LOG_DETAILS_FORMAT_TYPE } = require('../../lib/constants');

describe('callLogComposer', () => {
  describe('composeCallLog', () => {
    const baseParams = {
      logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT,
      existingBody: '',
      callLog: {
        sessionId: 'session-123',
        direction: 'Outbound',
        startTime: '2024-01-15T10:30:00Z',
        duration: 120,
        result: 'Completed',
        from: { phoneNumber: '+1234567890', name: 'John Doe' },
        to: { phoneNumber: '+0987654321', name: 'Jane Smith' }
      },
      contactInfo: { phoneNumber: '+0987654321' },
      user: { userSettings: {}, timezoneOffset: '+00:00' },
      note: 'Test note',
      subject: 'Test Call',
      startTime: '2024-01-15T10:30:00Z',
      duration: 120,
      result: 'Completed'
    };

    test('should compose call log with default settings (plain text)', async () => {
      const result = await composeCallLog(baseParams);

      expect(result).toContain('- Note: Test note');
      expect(result).toContain('- Summary: Test Call');
      expect(result).toContain('- Duration:');
      expect(result).toContain('- Result: Completed');
    });

    test('should compose call log in HTML format', async () => {
      const result = await composeCallLog({
        ...baseParams,
        logFormat: LOG_DETAILS_FORMAT_TYPE.HTML
      });

      expect(result).toContain('<b>Agent notes</b>');
      expect(result).toContain('<b>Summary</b>');
      expect(result).toContain('<b>Duration</b>');
      expect(result).toContain('<b>Result</b>');
    });

    test('should compose call log in Markdown format', async () => {
      const result = await composeCallLog({
        ...baseParams,
        logFormat: LOG_DETAILS_FORMAT_TYPE.MARKDOWN
      });

      expect(result).toContain('## Agent notes');
      expect(result).toContain('**Summary**:');
      expect(result).toContain('**Duration**:');
      expect(result).toContain('**Result**:');
    });

    test('should respect user settings to disable fields', async () => {
      const result = await composeCallLog({
        ...baseParams,
        user: {
          userSettings: {
            addCallLogNote: { value: false },
            addCallLogSubject: { value: false },
            addCallLogDuration: { value: false }
          }
        }
      });

      expect(result).not.toContain('Note:');
      expect(result).not.toContain('Summary:');
      expect(result).not.toContain('Duration:');
      expect(result).toContain('Result: Completed');
    });

    test('should add session ID when enabled', async () => {
      const result = await composeCallLog({
        ...baseParams,
        user: {
          userSettings: { addCallSessionId: { value: true } },
          timezoneOffset: '+00:00'
        }
      });

      expect(result).toContain('Session Id: session-123');
    });

    test('should add recording link when provided', async () => {
      const result = await composeCallLog({
        ...baseParams,
        recordingLink: 'https://recording.example.com/123'
      });

      expect(result).toContain('Call recording link: https://recording.example.com/123');
    });

    test('should add AI note when provided', async () => {
      const result = await composeCallLog({
        ...baseParams,
        aiNote: 'AI generated summary of the call'
      });

      expect(result).toContain('AI Note');
      expect(result).toContain('AI generated summary of the call');
    });

    test('should add transcript when provided', async () => {
      const result = await composeCallLog({
        ...baseParams,
        transcript: 'Hello, this is a test transcript.'
      });

      expect(result).toContain('Transcript');
      expect(result).toContain('Hello, this is a test transcript.');
    });

    test('should add RingSense data when provided', async () => {
      const result = await composeCallLog({
        ...baseParams,
        ringSenseTranscript: 'RS Transcript',
        ringSenseSummary: 'RS Summary',
        ringSenseAIScore: '85',
        ringSenseBulletedSummary: '- Point 1\n- Point 2',
        ringSenseLink: 'https://ringsense.example.com/123'
      });

      expect(result).toContain('RingSense transcript');
      expect(result).toContain('RingSense summary');
      expect(result).toContain('Call score: 85');
      expect(result).toContain('RingSense recording link');
    });

    test('should add call legs when provided', async () => {
      const result = await composeCallLog({
        ...baseParams,
        callLog: {
          ...baseParams.callLog,
          legs: [
            { direction: 'Outbound', from: { phoneNumber: '+1234567890' }, to: { phoneNumber: '+0987654321' }, duration: 60 }
          ]
        }
      });

      expect(result).toContain('Call journey');
    });

    test('should handle RingCentral user name setting', async () => {
      // For Outbound calls, it picks from.name
      const result = await composeCallLog({
        ...baseParams,
        user: {
          userSettings: { addRingCentralUserName: { value: true } },
          timezoneOffset: '+00:00'
        }
      });

      // For Outbound, uses from.name which is John Doe
      expect(result).toContain('RingCentral user name: John Doe');
    });

    test('should handle RingCentral number and extension setting', async () => {
      const result = await composeCallLog({
        ...baseParams,
        user: {
          userSettings: { addRingCentralNumber: { value: true } },
          timezoneOffset: '+00:00'
        },
        callLog: {
          ...baseParams.callLog,
          from: { phoneNumber: '+1234567890', extensionNumber: '101' }
        }
      });

      expect(result).toContain('RingCentral number and extension');
    });
  });

  describe('upsertCallAgentNote', () => {
    test('should add note to empty body (plain text)', () => {
      const result = upsertCallAgentNote({
        body: '',
        note: 'Test note',
        logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT
      });

      expect(result).toBe('- Note: Test note\n');
    });

    test('should replace existing note (plain text)', () => {
      const body = '- Note: Old note\n- Duration: 2 minutes';
      const result = upsertCallAgentNote({
        body,
        note: 'New note',
        logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT
      });

      expect(result).toContain('- Note: New note');
      expect(result).not.toContain('Old note');
    });

    test('should add note in HTML format', () => {
      const result = upsertCallAgentNote({
        body: '',
        note: 'Test note',
        logFormat: LOG_DETAILS_FORMAT_TYPE.HTML
      });

      expect(result).toContain('<b>Agent notes</b>');
      expect(result).toContain('Test note');
      expect(result).toContain('<b>Call details</b>');
    });

    test('should add note in Markdown format', () => {
      const result = upsertCallAgentNote({
        body: '',
        note: 'Test note',
        logFormat: LOG_DETAILS_FORMAT_TYPE.MARKDOWN
      });

      expect(result).toContain('## Agent notes');
      expect(result).toContain('Test note');
      expect(result).toContain('## Call details');
    });

    test('should return body unchanged if note is empty', () => {
      const body = 'Existing content';
      const result = upsertCallAgentNote({
        body,
        note: '',
        logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT
      });

      expect(result).toBe(body);
    });
  });

  describe('upsertCallSessionId', () => {
    test('should add session ID to empty body (plain text)', () => {
      const result = upsertCallSessionId({
        body: '',
        id: 'session-123',
        logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT
      });

      expect(result).toBe('- Session Id: session-123\n');
    });

    test('should add session ID in HTML format', () => {
      const result = upsertCallSessionId({
        body: '',
        id: 'session-123',
        logFormat: LOG_DETAILS_FORMAT_TYPE.HTML
      });

      expect(result).toContain('<b>Session Id</b>: session-123');
    });

    test('should add session ID in Markdown format', () => {
      const result = upsertCallSessionId({
        body: '',
        id: 'session-123',
        logFormat: LOG_DETAILS_FORMAT_TYPE.MARKDOWN
      });

      expect(result).toContain('**Session Id**: session-123');
    });

    test('should return body unchanged if id is empty', () => {
      const body = 'Existing content';
      const result = upsertCallSessionId({
        body,
        id: '',
        logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT
      });

      expect(result).toBe(body);
    });
  });

  describe('upsertRingCentralUserName', () => {
    test('should add user name to empty body', () => {
      const result = upsertRingCentralUserName({
        body: '',
        userName: 'John Doe',
        logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT
      });

      expect(result).toContain('RingCentral user name: John Doe');
    });

    test('should replace pending placeholder', () => {
      const body = '- RingCentral user name: (pending...)\n';
      const result = upsertRingCentralUserName({
        body,
        userName: 'John Doe',
        logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT
      });

      expect(result).toContain('RingCentral user name: John Doe');
      expect(result).not.toContain('(pending...)');
    });

    test('should not replace existing non-pending value', () => {
      const body = '- RingCentral user name: Jane Smith\n';
      const result = upsertRingCentralUserName({
        body,
        userName: 'John Doe',
        logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT
      });

      expect(result).toContain('Jane Smith');
      expect(result).not.toContain('John Doe');
    });

    test('should add user name in HTML format', () => {
      const result = upsertRingCentralUserName({
        body: '',
        userName: 'John Doe',
        logFormat: LOG_DETAILS_FORMAT_TYPE.HTML
      });

      expect(result).toContain('<b>RingCentral user name</b>: John Doe');
    });

    test('should add user name in Markdown format', () => {
      const result = upsertRingCentralUserName({
        body: '',
        userName: 'John Doe',
        logFormat: LOG_DETAILS_FORMAT_TYPE.MARKDOWN
      });

      expect(result).toContain('**RingCentral user name**: John Doe');
    });

    test('should replace pending placeholder in Markdown format', () => {
      const body = '**RingCentral user name**: (pending...)\n';
      const result = upsertRingCentralUserName({
        body,
        userName: 'John Doe',
        logFormat: LOG_DETAILS_FORMAT_TYPE.MARKDOWN
      });

      expect(result).toContain('**RingCentral user name**: John Doe');
      expect(result).not.toContain('(pending...)');
    });
  });

  describe('upsertRingCentralNumberAndExtension', () => {
    test('should add number and extension to empty body (plain text)', () => {
      const result = upsertRingCentralNumberAndExtension({
        body: '',
        number: '+1234567890',
        extension: '101',
        logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT
      });

      expect(result).toContain('RingCentral number and extension: +1234567890 101');
    });

    test('should add in HTML format', () => {
      const result = upsertRingCentralNumberAndExtension({
        body: '',
        number: '+1234567890',
        extension: '101',
        logFormat: LOG_DETAILS_FORMAT_TYPE.HTML
      });

      expect(result).toContain('<b>RingCentral number and extension</b>: +1234567890 101');
    });

    test('should add in Markdown format', () => {
      const result = upsertRingCentralNumberAndExtension({
        body: '',
        number: '+1234567890',
        extension: '101',
        logFormat: LOG_DETAILS_FORMAT_TYPE.MARKDOWN
      });

      expect(result).toContain('**RingCentral number and extension**: +1234567890 101');
    });

    test('should replace existing value in plain text', () => {
      const body = '- RingCentral number and extension: +9999999999 999\n';
      const result = upsertRingCentralNumberAndExtension({
        body,
        number: '+1234567890',
        extension: '101',
        logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT
      });

      expect(result).toContain('RingCentral number and extension: +1234567890 101');
      expect(result).not.toContain('+9999999999');
    });

    test('should handle number without extension', () => {
      const result = upsertRingCentralNumberAndExtension({
        body: '',
        number: '+1234567890',
        extension: '',
        logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT
      });

      expect(result).toContain('RingCentral number and extension: +1234567890');
    });

    test('should return body unchanged if number and extension are empty', () => {
      const body = 'Existing content';
      const result = upsertRingCentralNumberAndExtension({
        body,
        number: '',
        extension: '',
        logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT
      });

      expect(result).toBe(body);
    });
  });

  describe('upsertCallSubject', () => {
    test('should add subject to empty body', () => {
      const result = upsertCallSubject({
        body: '',
        subject: 'Call with Client',
        logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT
      });

      expect(result).toBe('- Summary: Call with Client\n');
    });

    test('should replace existing subject', () => {
      const body = '- Summary: Old subject\n- Duration: 5 minutes';
      const result = upsertCallSubject({
        body,
        subject: 'New subject',
        logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT
      });

      expect(result).toContain('- Summary: New subject');
      expect(result).not.toContain('Old subject');
    });

    test('should add subject in HTML format', () => {
      const result = upsertCallSubject({
        body: '',
        subject: 'Test Subject',
        logFormat: LOG_DETAILS_FORMAT_TYPE.HTML
      });

      expect(result).toContain('<b>Summary</b>: Test Subject');
    });

    test('should add subject in Markdown format', () => {
      const result = upsertCallSubject({
        body: '',
        subject: 'Test Subject',
        logFormat: LOG_DETAILS_FORMAT_TYPE.MARKDOWN
      });

      expect(result).toContain('**Summary**: Test Subject');
    });

    test('should replace existing subject in Markdown format', () => {
      const body = '**Summary**: Old subject\n**Duration**: 5 minutes';
      const result = upsertCallSubject({
        body,
        subject: 'New subject',
        logFormat: LOG_DETAILS_FORMAT_TYPE.MARKDOWN
      });

      expect(result).toContain('**Summary**: New subject');
      expect(result).not.toContain('Old subject');
    });
  });

  describe('upsertContactPhoneNumber', () => {
    test('should add phone number for outbound call', () => {
      const result = upsertContactPhoneNumber({
        body: '',
        phoneNumber: '+1234567890',
        direction: 'Outbound',
        logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT
      });

      expect(result).toContain('Contact Number: +1234567890');
    });

    test('should add phone number for inbound call', () => {
      const result = upsertContactPhoneNumber({
        body: '',
        phoneNumber: '+1234567890',
        direction: 'Inbound',
        logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT
      });

      expect(result).toContain('Contact Number: +1234567890');
    });

    test('should add phone number in HTML format with direction label', () => {
      const result = upsertContactPhoneNumber({
        body: '',
        phoneNumber: '+1234567890',
        direction: 'Outbound',
        logFormat: LOG_DETAILS_FORMAT_TYPE.HTML
      });

      expect(result).toContain('<b>Recipient phone number</b>: +1234567890');
    });

    test('should add phone number in Markdown format', () => {
      const result = upsertContactPhoneNumber({
        body: '',
        phoneNumber: '+1234567890',
        direction: 'Outbound',
        logFormat: LOG_DETAILS_FORMAT_TYPE.MARKDOWN
      });

      expect(result).toContain('**Contact Number**: +1234567890');
    });
  });

  describe('upsertCallDateTime', () => {
    test('should add formatted date/time', () => {
      const result = upsertCallDateTime({
        body: '',
        startTime: '2024-01-15T10:30:00Z',
        timezoneOffset: '+00:00',
        logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT,
        logDateFormat: 'YYYY-MM-DD hh:mm:ss A'
      });

      expect(result).toContain('Date/Time:');
      expect(result).toContain('2024-01-15');
    });

    test('should apply timezone offset', () => {
      const result = upsertCallDateTime({
        body: '',
        startTime: '2024-01-15T10:30:00Z',
        timezoneOffset: '+05:00',
        logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT,
        logDateFormat: 'YYYY-MM-DD HH:mm'
      });

      expect(result).toContain('Date/Time:');
      expect(result).toContain('15:30'); // 10:30 + 5 hours
    });

    test('should add date/time in HTML format', () => {
      const result = upsertCallDateTime({
        body: '',
        startTime: '2024-01-15T10:30:00Z',
        timezoneOffset: '+00:00',
        logFormat: LOG_DETAILS_FORMAT_TYPE.HTML
      });

      expect(result).toContain('<b>Date/time</b>:');
    });

    test('should add date/time in Markdown format', () => {
      const result = upsertCallDateTime({
        body: '',
        startTime: '2024-01-15T10:30:00Z',
        timezoneOffset: '+00:00',
        logFormat: LOG_DETAILS_FORMAT_TYPE.MARKDOWN,
        logDateFormat: 'YYYY-MM-DD hh:mm:ss A'
      });

      expect(result).toContain('**Date/Time**:');
      expect(result).toContain('2024-01-15');
    });

    test('should replace existing date/time in Markdown format', () => {
      const body = '**Date/Time**: 2024-01-01 09:00:00 AM\n';
      const result = upsertCallDateTime({
        body,
        startTime: '2024-01-15T10:30:00Z',
        timezoneOffset: '+00:00',
        logFormat: LOG_DETAILS_FORMAT_TYPE.MARKDOWN,
        logDateFormat: 'YYYY-MM-DD HH:mm'
      });

      expect(result).toContain('**Date/Time**: 2024-01-15');
      expect(result).not.toContain('2024-01-01');
    });
  });

  describe('upsertCallDuration', () => {
    test('should add formatted duration', () => {
      const result = upsertCallDuration({
        body: '',
        duration: 120,
        logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT
      });

      expect(result).toContain('Duration: 2 minutes');
    });

    test('should handle hours, minutes, seconds', () => {
      const result = upsertCallDuration({
        body: '',
        duration: 3661, // 1 hour, 1 minute, 1 second
        logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT
      });

      expect(result).toContain('1 hour');
      expect(result).toContain('1 minute');
      expect(result).toContain('1 second');
    });

    test('should add duration in HTML format', () => {
      const result = upsertCallDuration({
        body: '',
        duration: 60,
        logFormat: LOG_DETAILS_FORMAT_TYPE.HTML
      });

      expect(result).toContain('<b>Duration</b>:');
    });

    test('should handle 0 duration', () => {
      const result = upsertCallDuration({
        body: '',
        duration: 0,
        logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT
      });

      expect(result).toContain('Duration: 0 seconds');
    });

    test('should add duration in Markdown format', () => {
      const result = upsertCallDuration({
        body: '',
        duration: 120,
        logFormat: LOG_DETAILS_FORMAT_TYPE.MARKDOWN
      });

      expect(result).toContain('**Duration**: 2 minutes');
    });

    test('should replace existing duration in Markdown format', () => {
      const body = '**Duration**: 1 minute\n';
      const result = upsertCallDuration({
        body,
        duration: 180,
        logFormat: LOG_DETAILS_FORMAT_TYPE.MARKDOWN
      });

      expect(result).toContain('**Duration**: 3 minutes');
      expect(result).not.toContain('1 minute');
    });
  });

  describe('upsertCallResult', () => {
    test('should add call result', () => {
      const result = upsertCallResult({
        body: '',
        result: 'Completed',
        logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT
      });

      expect(result).toContain('Result: Completed');
    });

    test('should replace existing result', () => {
      const body = '- Result: Pending\n';
      const result = upsertCallResult({
        body,
        result: 'Completed',
        logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT
      });

      expect(result).toContain('Result: Completed');
      expect(result).not.toContain('Pending');
    });

    test('should add result in HTML format', () => {
      const result = upsertCallResult({
        body: '',
        result: 'Missed',
        logFormat: LOG_DETAILS_FORMAT_TYPE.HTML
      });

      expect(result).toContain('<b>Result</b>: Missed');
    });

    test('should add result in Markdown format', () => {
      const result = upsertCallResult({
        body: '',
        result: 'Completed',
        logFormat: LOG_DETAILS_FORMAT_TYPE.MARKDOWN
      });

      expect(result).toContain('**Result**: Completed');
    });

    test('should replace existing result in Markdown format', () => {
      const body = '**Result**: Pending\n';
      const result = upsertCallResult({
        body,
        result: 'Completed',
        logFormat: LOG_DETAILS_FORMAT_TYPE.MARKDOWN
      });

      expect(result).toContain('**Result**: Completed');
      expect(result).not.toContain('Pending');
    });
  });

  describe('upsertCallRecording', () => {
    test('should add recording link', () => {
      const result = upsertCallRecording({
        body: '',
        recordingLink: 'https://recording.example.com/123',
        logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT
      });

      expect(result).toContain('Call recording link: https://recording.example.com/123');
    });

    test('should add recording link in HTML format with anchor', () => {
      const result = upsertCallRecording({
        body: '',
        recordingLink: 'https://recording.example.com/123',
        logFormat: LOG_DETAILS_FORMAT_TYPE.HTML
      });

      expect(result).toContain('<a target="_blank" href="https://recording.example.com/123">open</a>');
    });

    test('should show pending for non-http link', () => {
      const result = upsertCallRecording({
        body: '',
        recordingLink: 'pending',
        logFormat: LOG_DETAILS_FORMAT_TYPE.HTML
      });

      expect(result).toContain('(pending...)');
    });

    test('should add recording link in Markdown format', () => {
      const result = upsertCallRecording({
        body: '',
        recordingLink: 'https://recording.example.com/123',
        logFormat: LOG_DETAILS_FORMAT_TYPE.MARKDOWN
      });

      expect(result).toContain('**Call recording link**: https://recording.example.com/123');
    });

    test('should replace existing recording link in Markdown format', () => {
      const body = '**Call recording link**: https://old-link.com\n';
      const result = upsertCallRecording({
        body,
        recordingLink: 'https://new-link.com/456',
        logFormat: LOG_DETAILS_FORMAT_TYPE.MARKDOWN
      });

      expect(result).toContain('**Call recording link**: https://new-link.com/456');
      expect(result).not.toContain('old-link');
    });
  });

  describe('upsertAiNote', () => {
    test('should add AI note', () => {
      const result = upsertAiNote({
        body: '',
        aiNote: 'AI generated summary',
        logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT
      });

      expect(result).toContain('AI Note');
      expect(result).toContain('AI generated summary');
      expect(result).toContain('--- END');
    });

    test('should add AI note in HTML format', () => {
      const result = upsertAiNote({
        body: '',
        aiNote: 'AI summary\nWith multiple lines',
        logFormat: LOG_DETAILS_FORMAT_TYPE.HTML
      });

      expect(result).toContain('<b>AI Note</b>');
      expect(result).toContain('<br>');
    });

    test('should replace existing AI note', () => {
      const body = '- AI Note:\nOld note\n--- END\n';
      const result = upsertAiNote({
        body,
        aiNote: 'New AI note',
        logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT
      });

      expect(result).toContain('New AI note');
      expect(result).not.toContain('Old note');
    });

    test('should add AI note in Markdown format', () => {
      const result = upsertAiNote({
        body: '',
        aiNote: 'AI generated summary',
        logFormat: LOG_DETAILS_FORMAT_TYPE.MARKDOWN
      });

      expect(result).toContain('### AI Note');
      expect(result).toContain('AI generated summary');
    });

    test('should replace existing AI note in Markdown format', () => {
      const body = '### AI Note\nOld AI note\n';
      const result = upsertAiNote({
        body,
        aiNote: 'New AI note',
        logFormat: LOG_DETAILS_FORMAT_TYPE.MARKDOWN
      });

      expect(result).toContain('New AI note');
    });
  });

  describe('upsertTranscript', () => {
    test('should add transcript', () => {
      const result = upsertTranscript({
        body: '',
        transcript: 'Hello, this is a transcript.',
        logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT
      });

      expect(result).toContain('Transcript');
      expect(result).toContain('Hello, this is a transcript.');
      expect(result).toContain('--- END');
    });

    test('should add transcript in HTML format', () => {
      const result = upsertTranscript({
        body: '',
        transcript: 'Line 1\nLine 2',
        logFormat: LOG_DETAILS_FORMAT_TYPE.HTML
      });

      expect(result).toContain('<b>Transcript</b>');
      expect(result).toContain('<br>');
    });

    test('should add transcript in Markdown format', () => {
      const result = upsertTranscript({
        body: '',
        transcript: 'Hello, this is a transcript.',
        logFormat: LOG_DETAILS_FORMAT_TYPE.MARKDOWN
      });

      expect(result).toContain('### Transcript');
      expect(result).toContain('Hello, this is a transcript.');
    });

    test('should replace existing transcript in Markdown format', () => {
      const body = '### Transcript\nOld transcript\n';
      const result = upsertTranscript({
        body,
        transcript: 'New transcript content',
        logFormat: LOG_DETAILS_FORMAT_TYPE.MARKDOWN
      });

      expect(result).toContain('New transcript content');
    });
  });

  describe('upsertLegs', () => {
    test('should add call legs (outbound)', () => {
      const legs = [
        {
          direction: 'Outbound',
          from: { phoneNumber: '+1234567890', name: 'John' },
          to: { phoneNumber: '+0987654321' },
          duration: 60
        }
      ];

      const result = upsertLegs({
        body: '',
        legs,
        logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT
      });

      expect(result).toContain('Call journey');
      expect(result).toContain('Made call from');
    });

    test('should add call legs (inbound)', () => {
      const legs = [
        {
          direction: 'Inbound',
          from: { phoneNumber: '+1234567890' },
          to: { phoneNumber: '+0987654321', name: 'Support' },
          duration: 60
        }
      ];

      const result = upsertLegs({
        body: '',
        legs,
        logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT
      });

      expect(result).toContain('Received call at');
    });

    test('should handle transferred calls', () => {
      const legs = [
        {
          direction: 'Inbound',
          from: { phoneNumber: '+1234567890' },
          to: { phoneNumber: '+0987654321' },
          duration: 30
        },
        {
          direction: 'Outbound',
          from: { phoneNumber: '+0987654321', extensionNumber: '101' },
          to: { phoneNumber: '+1111111111' },
          duration: 45
        }
      ];

      const result = upsertLegs({
        body: '',
        legs,
        logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT
      });

      expect(result).toContain('Transferred to');
    });

    test('should return body unchanged for empty legs', () => {
      const result = upsertLegs({
        body: 'existing',
        legs: [],
        logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT
      });

      expect(result).toBe('existing');
    });

    test('should add call legs in HTML format', () => {
      const legs = [
        {
          direction: 'Outbound',
          from: { phoneNumber: '+1234567890', name: 'John' },
          to: { phoneNumber: '+0987654321' },
          duration: 60
        }
      ];

      const result = upsertLegs({
        body: '',
        legs,
        logFormat: LOG_DETAILS_FORMAT_TYPE.HTML
      });

      expect(result).toContain('<b>Call journey</b>');
      expect(result).toContain('Made call from');
    });

    test('should add call legs in Markdown format', () => {
      const legs = [
        {
          direction: 'Outbound',
          from: { phoneNumber: '+1234567890', name: 'John' },
          to: { phoneNumber: '+0987654321' },
          duration: 60
        }
      ];

      const result = upsertLegs({
        body: '',
        legs,
        logFormat: LOG_DETAILS_FORMAT_TYPE.MARKDOWN
      });

      expect(result).toContain('### Call journey');
      expect(result).toContain('Made call from');
    });

    test('should replace existing legs in Markdown format', () => {
      const body = '### Call journey\nOld journey info\n';
      const legs = [
        {
          direction: 'Inbound',
          from: { phoneNumber: '+1234567890' },
          to: { phoneNumber: '+0987654321', name: 'Support' },
          duration: 120
        }
      ];

      const result = upsertLegs({
        body,
        legs,
        logFormat: LOG_DETAILS_FORMAT_TYPE.MARKDOWN
      });

      expect(result).toContain('### Call journey');
      expect(result).toContain('Received call at');
    });
  });

  describe('RingSense Functions', () => {
    describe('upsertRingSenseTranscript', () => {
      test('should add RingSense transcript', () => {
        const result = upsertRingSenseTranscript({
          body: '',
          transcript: 'RS transcript content',
          logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT
        });

        expect(result).toContain('RingSense transcript');
        expect(result).toContain('RS transcript content');
      });

      test('should add in HTML format', () => {
        const result = upsertRingSenseTranscript({
          body: '',
          transcript: 'RS transcript',
          logFormat: LOG_DETAILS_FORMAT_TYPE.HTML
        });

        expect(result).toContain('<b>RingSense transcript</b>');
      });

      test('should add in Markdown format', () => {
        const result = upsertRingSenseTranscript({
          body: '',
          transcript: 'RS transcript content',
          logFormat: LOG_DETAILS_FORMAT_TYPE.MARKDOWN
        });

        expect(result).toContain('### RingSense transcript');
        expect(result).toContain('RS transcript content');
      });
    });

    describe('upsertRingSenseSummary', () => {
      test('should add RingSense summary', () => {
        const result = upsertRingSenseSummary({
          body: '',
          summary: 'RS summary content',
          logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT
        });

        expect(result).toContain('RingSense summary');
        expect(result).toContain('RS summary content');
      });

      test('should add in HTML format', () => {
        const result = upsertRingSenseSummary({
          body: '',
          summary: 'RS summary',
          logFormat: LOG_DETAILS_FORMAT_TYPE.HTML
        });

        expect(result).toContain('<b>RingSense summary</b>');
      });

      test('should add in Markdown format', () => {
        const result = upsertRingSenseSummary({
          body: '',
          summary: 'RS summary content',
          logFormat: LOG_DETAILS_FORMAT_TYPE.MARKDOWN
        });

        expect(result).toContain('### RingSense summary');
        expect(result).toContain('RS summary content');
      });
    });

    describe('upsertRingSenseAIScore', () => {
      test('should add RingSense AI score', () => {
        const result = upsertRingSenseAIScore({
          body: '',
          score: '85',
          logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT
        });

        expect(result).toContain('Call score: 85');
      });

      test('should add in HTML format', () => {
        const result = upsertRingSenseAIScore({
          body: '',
          score: '90',
          logFormat: LOG_DETAILS_FORMAT_TYPE.HTML
        });

        expect(result).toContain('<b>Call score</b>: 90');
      });

      test('should add in Markdown format', () => {
        const result = upsertRingSenseAIScore({
          body: '',
          score: '85',
          logFormat: LOG_DETAILS_FORMAT_TYPE.MARKDOWN
        });

        expect(result).toContain('**Call score**: 85');
      });
    });

    describe('upsertRingSenseBulletedSummary', () => {
      test('should add RingSense bulleted summary', () => {
        const result = upsertRingSenseBulletedSummary({
          body: '',
          summary: '- Point 1\n- Point 2',
          logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT
        });

        expect(result).toContain('RingSense bulleted summary');
        expect(result).toContain('- Point 1');
      });

      test('should add in HTML format', () => {
        const result = upsertRingSenseBulletedSummary({
          body: '',
          summary: '- Item 1\n- Item 2',
          logFormat: LOG_DETAILS_FORMAT_TYPE.HTML
        });

        expect(result).toContain('<b>RingSense bulleted summary</b>');
      });

      test('should add in Markdown format', () => {
        const result = upsertRingSenseBulletedSummary({
          body: '',
          summary: '- Point 1\n- Point 2',
          logFormat: LOG_DETAILS_FORMAT_TYPE.MARKDOWN
        });

        expect(result).toContain('### RingSense bulleted summary');
        expect(result).toContain('- Point 1');
      });
    });

    describe('upsertRingSenseLink', () => {
      test('should add RingSense recording link', () => {
        const result = upsertRingSenseLink({
          body: '',
          link: 'https://ringsense.example.com/123',
          logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT
        });

        expect(result).toContain('RingSense recording link: https://ringsense.example.com/123');
      });

      test('should add in HTML format with anchor', () => {
        const result = upsertRingSenseLink({
          body: '',
          link: 'https://ringsense.example.com/123',
          logFormat: LOG_DETAILS_FORMAT_TYPE.HTML
        });

        expect(result).toContain('<a target="_blank" href="https://ringsense.example.com/123">open</a>');
      });

      test('should add in Markdown format', () => {
        const result = upsertRingSenseLink({
          body: '',
          link: 'https://ringsense.example.com/123',
          logFormat: LOG_DETAILS_FORMAT_TYPE.MARKDOWN
        });

        expect(result).toContain('**RingSense recording link**: https://ringsense.example.com/123');
      });
    });
  });

  describe('Edge Cases', () => {
    test('should handle null user settings', async () => {
      const result = await composeCallLog({
        logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT,
        callLog: { direction: 'Outbound', startTime: new Date() },
        user: { userSettings: null },
        note: 'Test',
        duration: 60
      });

      expect(result).toContain('Note: Test');
      expect(result).toContain('Duration:');
    });

    test('should handle undefined user settings', async () => {
      const result = await composeCallLog({
        logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT,
        callLog: { direction: 'Outbound' },
        user: {},
        result: 'Completed'
      });

      expect(result).toContain('Result: Completed');
    });

    test('should return empty string for empty params', async () => {
      const result = await composeCallLog({
        logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT,
        user: {}
      });

      expect(result).toBe('');
    });
  });
});

