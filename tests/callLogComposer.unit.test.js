const moment = require('moment-timezone');
const {
    composeCallLog,
    getLogFormatType,
    upsertCallAgentNote,
    upsertCallSessionId,
    upsertCallSubject,
    upsertContactPhoneNumber,
    upsertCallDateTime,
    upsertCallDuration,
    upsertCallResult,
    upsertCallRecording,
    upsertAiNote,
    upsertTranscript,
    upsertLegs
} = require('../packages/core/lib/callLogComposer');

const { LOG_DETAILS_FORMAT_TYPE } = require('../packages/core/lib/constants');
// Register adapters for testing
const { adapterRegistry } = require('@app-connect/core');
const bullhorn = require('../src/adapters/bullhorn');
const clio = require('../src/adapters/clio');
const googleSheets = require('../src/adapters/googleSheets');
const insightly = require('../src/adapters/insightly');
const netsuite = require('../src/adapters/netsuite');
const pipedrive = require('../src/adapters/pipedrive');
const redtail = require('../src/adapters/redtail');
const testCRM = require('../src/adapters/testCRM');

adapterRegistry.setDefaultManifest(require('../src/adapters/manifest.json'));
adapterRegistry.registerAdapter('bullhorn', bullhorn);
adapterRegistry.registerAdapter('clio', clio);
adapterRegistry.registerAdapter('googleSheets', googleSheets);
adapterRegistry.registerAdapter('insightly', insightly);
adapterRegistry.registerAdapter('netsuite', netsuite);
adapterRegistry.registerAdapter('pipedrive', pipedrive);
adapterRegistry.registerAdapter('redtail', redtail);
adapterRegistry.registerAdapter('testCRM', testCRM, require('../src/adapters/testCRM/manifest.json'));

describe('callLogComposer', () => {
    describe('LOG_DETAILS_FORMAT_TYPE', () => {
        test('should export correct format types', () => {
            expect(LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT).toBe('text/plain');
            expect(LOG_DETAILS_FORMAT_TYPE.HTML).toBe('text/html');
            expect(LOG_DETAILS_FORMAT_TYPE.MARKDOWN).toBe('text/markdown');
        });
    });

    describe('getLogFormatType', () => {
        test('should return correct format for pipedrive', () => {
            expect(getLogFormatType('pipedrive')).toBe('text/html');
        });

        test('should return undefined for unknown platform', () => {
            expect(getLogFormatType('unknownPlatform')).toBeUndefined();
        });
    });

    describe('upsertCallAgentNote', () => {
        describe('HTML format', () => {
            test('should add agent note to empty body', () => {
                const result = upsertCallAgentNote({
                    body: '',
                    note: 'Test note',
                    logFormat: LOG_DETAILS_FORMAT_TYPE.HTML
                });
                expect(result).toBe('<b>Agent notes</b><br>Test note<br><br><b>Call details</b><br>');
            });

            test('should replace existing agent note', () => {
                const body = '<b>Agent notes</b><br>Old note<br><br><b>Call details</b><br>Some details';
                const result = upsertCallAgentNote({
                    body,
                    note: 'New note',
                    logFormat: LOG_DETAILS_FORMAT_TYPE.HTML
                });
                expect(result).toBe('<b>Agent notes</b><br>New note<br><br><b>Call details</b><br>Some details');
            });

            test('should return body unchanged when note is empty', () => {
                const body = 'Some existing body';
                const result = upsertCallAgentNote({
                    body,
                    note: '',
                    logFormat: LOG_DETAILS_FORMAT_TYPE.HTML
                });
                expect(result).toBe(body);
            });
        });

        describe('Plain text format', () => {
            test('should add note to empty body', () => {
                const result = upsertCallAgentNote({
                    body: '',
                    note: 'Test note',
                    logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT
                });
                expect(result).toBe('- Note: Test note\n');
            });

            test('should replace existing note', () => {
                const body = '- Note: Old note\n- Duration: 30 seconds\n';
                const result = upsertCallAgentNote({
                    body,
                    note: 'New note',
                    logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT
                });
                expect(result).toBe('- Note: New note\n- Duration: 30 seconds\n');
            });

            test('should handle multiline notes', () => {
                const body = '- Note: Old note\nwith multiple lines\n- Duration: 30 seconds\n';
                const result = upsertCallAgentNote({
                    body,
                    note: 'New note',
                    logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT
                });
                expect(result).toBe('- Note: New note\n- Duration: 30 seconds\n');
            });
        });
    });

    describe('upsertCallSessionId', () => {
        describe('HTML format', () => {
            test('should add session ID to empty body', () => {
                const result = upsertCallSessionId({
                    body: '',
                    id: 'session123',
                    logFormat: LOG_DETAILS_FORMAT_TYPE.HTML
                });
                expect(result).toBe('<li><b>Session Id</b>: session123</li>');
            });

            test('should replace existing session ID', () => {
                const body = '<li><b>Session Id</b>: old123</li>';
                const result = upsertCallSessionId({
                    body,
                    id: 'new123',
                    logFormat: LOG_DETAILS_FORMAT_TYPE.HTML
                });
                expect(result).toBe('<li><b>Session Id</b>: new123</li>');
            });

            test('should return body unchanged when id is empty', () => {
                const body = 'Some existing body';
                const result = upsertCallSessionId({
                    body,
                    id: '',
                    logFormat: LOG_DETAILS_FORMAT_TYPE.HTML
                });
                expect(result).toBe(body);
            });
        });

        describe('Plain text format', () => {
            test('should add session ID to empty body', () => {
                const result = upsertCallSessionId({
                    body: '',
                    id: 'session123',
                    logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT
                });
                expect(result).toBe('- Session Id: session123\n');
            });

            test('should replace existing session ID', () => {
                const body = '- Session Id: old123\n- Duration: 30 seconds\n';
                const result = upsertCallSessionId({
                    body,
                    id: 'new123',
                    logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT
                });
                expect(result).toBe('- Session Id: new123\n- Duration: 30 seconds\n');
            });
        });
    });

    describe('upsertCallSubject', () => {
        describe('HTML format', () => {
            test('should add subject to empty body', () => {
                const result = upsertCallSubject({
                    body: '',
                    subject: 'Test subject',
                    logFormat: LOG_DETAILS_FORMAT_TYPE.HTML
                });
                expect(result).toBe('<li><b>Summary</b>: Test subject</li>');
            });

            test('should replace existing subject', () => {
                const body = '<li><b>Summary</b>: Old subject</li>';
                const result = upsertCallSubject({
                    body,
                    subject: 'New subject',
                    logFormat: LOG_DETAILS_FORMAT_TYPE.HTML
                });
                expect(result).toBe('<li><b>Summary</b>: New subject</li>');
            });
        });

        describe('Plain text format', () => {
            test('should add subject to empty body', () => {
                const result = upsertCallSubject({
                    body: '',
                    subject: 'Test subject',
                    logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT
                });
                expect(result).toBe('- Summary: Test subject\n');
            });

            test('should replace existing subject', () => {
                const body = '- Summary: Old subject\n- Duration: 30 seconds\n';
                const result = upsertCallSubject({
                    body,
                    subject: 'New subject',
                    logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT
                });
                expect(result).toBe('- Summary: New subject\n- Duration: 30 seconds\n');
            });
        });
    });

    describe('upsertContactPhoneNumber', () => {
        describe('HTML format', () => {
            test('should add caller phone number for inbound call', () => {
                const result = upsertContactPhoneNumber({
                    body: '',
                    phoneNumber: '+1234567890',
                    direction: 'Inbound',
                    logFormat: LOG_DETAILS_FORMAT_TYPE.HTML
                });
                expect(result).toBe('<li><b>Caller phone number</b>: +1234567890</li>');
            });

            test('should add recipient phone number for outbound call', () => {
                const result = upsertContactPhoneNumber({
                    body: '',
                    phoneNumber: '+1234567890',
                    direction: 'Outbound',
                    logFormat: LOG_DETAILS_FORMAT_TYPE.HTML
                });
                expect(result).toBe('<li><b>Recipient phone number</b>: +1234567890</li>');
            });

            test('should replace existing phone number', () => {
                const body = '<li><b>Caller phone number</b>: +0987654321</li>';
                const result = upsertContactPhoneNumber({
                    body,
                    phoneNumber: '+1234567890',
                    direction: 'Inbound',
                    logFormat: LOG_DETAILS_FORMAT_TYPE.HTML
                });
                expect(result).toBe('<li><b>Caller phone number</b>: +1234567890</li>');
            });
        });

        describe('Plain text format', () => {
            test('should add contact number', () => {
                const result = upsertContactPhoneNumber({
                    body: '',
                    phoneNumber: '+1234567890',
                    direction: 'Inbound',
                    logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT
                });
                expect(result).toBe('- Contact Number: +1234567890\n');
            });

            test('should replace existing contact number', () => {
                const body = '- Contact Number: +0987654321\n- Duration: 30 seconds\n';
                const result = upsertContactPhoneNumber({
                    body,
                    phoneNumber: '+1234567890',
                    direction: 'Inbound',
                    logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT
                });
                expect(result).toBe('- Contact Number: +1234567890\n\n- Duration: 30 seconds\n');
            });
        });
    });

    describe('upsertCallDateTime', () => {
        const testDate = new Date('2023-01-01T12:00:00Z');

        describe('HTML format', () => {
            test('should add datetime without timezone', () => {
                const result = upsertCallDateTime({
                    body: '',
                    startTime: testDate,
                    logFormat: LOG_DETAILS_FORMAT_TYPE.HTML
                });
                expect(result).toMatch(/<li><b>Date\/time<\/b>: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} [AP]M<\/li>/);
            });

            test('should add datetime with timezone offset', () => {
                const result = upsertCallDateTime({
                    body: '',
                    startTime: testDate,
                    timezoneOffset: '+05:30',
                    logFormat: LOG_DETAILS_FORMAT_TYPE.HTML
                });
                expect(result).toMatch(/<li><b>Date\/time<\/b>: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} [AP]M<\/li>/);
            });

            test('should replace existing datetime', () => {
                const body = '<li><b>Date/time</b>: 2022-12-31 11:00:00 AM</li>';
                const result = upsertCallDateTime({
                    body,
                    startTime: testDate,
                    logFormat: LOG_DETAILS_FORMAT_TYPE.HTML
                });
                expect(result).toMatch(/<li><b>Date\/time<\/b>: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} [AP]M<\/li>/);
            });
        });

        describe('Plain text format', () => {
            test('should add datetime', () => {
                const result = upsertCallDateTime({
                    body: '',
                    startTime: testDate,
                    logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT
                });
                expect(result).toMatch(/- Date\/Time: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} [AP]M\n/);
            });

            test('should replace existing datetime', () => {
                const body = '- Date/Time: 2023-01-01 12:00:00 AM\n- Duration: 30 seconds\n';
                const result = upsertCallDateTime({
                    body,
                    timezoneOffset: '+08:00',
                    startTime: testDate,
                    logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT
                });
                expect(result).toBe('- Date/Time: 2023-01-01 08:00:00 PM\n- Duration: 30 seconds\n');
            });
        });
    });

    describe('upsertCallDuration', () => {
        describe('HTML format', () => {
            test('should add duration', () => {
                const result = upsertCallDuration({
                    body: '',
                    duration: 90,
                    logFormat: LOG_DETAILS_FORMAT_TYPE.HTML
                });
                expect(result).toBe('<li><b>Duration</b>: 1 minute, 30 seconds</li>');
            });

            test('should replace existing duration', () => {
                const body = '<li><b>Duration</b>: 30 seconds</li>';
                const result = upsertCallDuration({
                    body,
                    duration: 90,
                    logFormat: LOG_DETAILS_FORMAT_TYPE.HTML
                });
                expect(result).toBe('<li><b>Duration</b>: 1 minute, 30 seconds</li>');
            });
        });

        describe('Plain text format', () => {
            test('should add duration', () => {
                const result = upsertCallDuration({
                    body: '',
                    duration: 90,
                    logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT
                });
                expect(result).toBe('- Duration: 1 minute, 30 seconds\n');
            });

            test('should replace existing duration', () => {
                const body = '- Duration: 30 seconds\n- Result: Answered\n';
                const result = upsertCallDuration({
                    body,
                    duration: 90,
                    logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT
                });
                expect(result).toBe('- Duration: 1 minute, 30 seconds\n\n- Result: Answered\n');
            });
        });
    });

    describe('upsertCallResult', () => {
        describe('HTML format', () => {
            test('should add result', () => {
                const result = upsertCallResult({
                    body: '',
                    result: 'Answered',
                    logFormat: LOG_DETAILS_FORMAT_TYPE.HTML
                });
                expect(result).toBe('<li><b>Result</b>: Answered</li>');
            });

            test('should replace existing result', () => {
                const body = '<li><b>Result</b>: Missed</li>';
                const result = upsertCallResult({
                    body,
                    result: 'Answered',
                    logFormat: LOG_DETAILS_FORMAT_TYPE.HTML
                });
                expect(result).toBe('<li><b>Result</b>: Answered</li>');
            });
        });

        describe('Plain text format', () => {
            test('should add result', () => {
                const result = upsertCallResult({
                    body: '',
                    result: 'Answered',
                    logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT
                });
                expect(result).toBe('- Result: Answered\n');
            });

            test('should replace existing result', () => {
                const body = '- Result: Missed\n- Duration: 30 seconds\n';
                const result = upsertCallResult({
                    body,
                    result: 'Answered',
                    logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT
                });
                expect(result).toBe('- Result: Answered\n\n- Duration: 30 seconds\n');
            });
        });
    });

    describe('upsertCallRecording', () => {
        describe('HTML format', () => {
            test('should add recording link with http URL', () => {
                const result = upsertCallRecording({
                    body: '',
                    recordingLink: 'https://example.com/recording.mp3',
                    logFormat: LOG_DETAILS_FORMAT_TYPE.HTML
                });
                expect(result).toBe('<li><b>Call recording link</b>: <a target="_blank" href="https://example.com/recording.mp3">open</a></li>');
            });

            test('should add pending recording link', () => {
                const result = upsertCallRecording({
                    body: '',
                    recordingLink: 'pending-recording-id',
                    logFormat: LOG_DETAILS_FORMAT_TYPE.HTML
                });
                expect(result).toBe('<li><b>Call recording link</b>: (pending...)</li>');
            });

            test('should replace existing recording link', () => {
                const body = '<li><b>Call recording link</b>: (pending...)</li>';
                const result = upsertCallRecording({
                    body,
                    recordingLink: 'https://example.com/recording.mp3',
                    logFormat: LOG_DETAILS_FORMAT_TYPE.HTML
                });
                expect(result).toBe('<li><b>Call recording link</b>: <a target="_blank" href="https://example.com/recording.mp3">open</a></li>');
            });

            test('should insert recording link before closing </ul> tag', () => {
                const body = '<ul><li><b>Duration</b>: 30 seconds</li></ul>';
                const result = upsertCallRecording({
                    body,
                    recordingLink: 'https://example.com/recording.mp3',
                    logFormat: LOG_DETAILS_FORMAT_TYPE.HTML
                });
                expect(result).toBe('<ul><li><b>Duration</b>: 30 seconds</li><li><b>Call recording link</b>: <a target="_blank" href="https://example.com/recording.mp3">open</a></li></ul>');
            });
        });

        describe('Plain text format', () => {
            test('should add recording link', () => {
                const result = upsertCallRecording({
                    body: '',
                    recordingLink: 'https://example.com/recording.mp3',
                    logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT
                });
                expect(result).toBe('- Call recording link: https://example.com/recording.mp3\n');
            });

            test('should replace existing recording link', () => {
                const body = '- Call recording link: old-link\n- Duration: 30 seconds\n';
                const result = upsertCallRecording({
                    body,
                    recordingLink: 'https://example.com/recording.mp3',
                    logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT
                });
                expect(result).toBe('- Call recording link: https://example.com/recording.mp3\n- Duration: 30 seconds\n');
            });

            test('should add newline before recording link if body does not end with newline', () => {
                const body = 'Some content';
                const result = upsertCallRecording({
                    body,
                    recordingLink: 'https://example.com/recording.mp3',
                    logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT
                });
                expect(result).toBe('Some content\n- Call recording link: https://example.com/recording.mp3\n');
            });
        });
    });

    describe('upsertAiNote', () => {
        describe('HTML format', () => {
            test('should add AI note', () => {
                const result = upsertAiNote({
                    body: '',
                    aiNote: 'AI generated note',
                    logFormat: LOG_DETAILS_FORMAT_TYPE.HTML
                });
                expect(result).toBe('<div><b>AI Note</b><br>AI generated note</div><br>');
            });

            test('should replace existing AI note', () => {
                const body = '<div><b>AI Note</b><br>Old AI note</div><br>';
                const result = upsertAiNote({
                    body,
                    aiNote: 'New AI note',
                    logFormat: LOG_DETAILS_FORMAT_TYPE.HTML
                });
                expect(result).toBe('<div><b>AI Note</b><br>New AI note</div><br>');
            });

            test('should handle multiline AI note', () => {
                const result = upsertAiNote({
                    body: '',
                    aiNote: 'AI note\nwith multiple\nlines',
                    logFormat: LOG_DETAILS_FORMAT_TYPE.HTML
                });
                expect(result).toBe('<div><b>AI Note</b><br>AI note<br>with multiple<br>lines</div><br>');
            });

            test('should clear trailing newlines from AI note', () => {
                const result = upsertAiNote({
                    body: '',
                    aiNote: 'AI note\n\n\n',
                    logFormat: LOG_DETAILS_FORMAT_TYPE.HTML
                });
                expect(result).toBe('<div><b>AI Note</b><br>AI note</div><br>');
            });
        });

        describe('Plain text format', () => {
            test('should add AI note', () => {
                const result = upsertAiNote({
                    body: '',
                    aiNote: 'AI generated note',
                    logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT
                });
                expect(result).toBe('- AI Note:\nAI generated note\n--- END\n');
            });

            test('should replace existing AI note', () => {
                const body = '- AI Note:\nOld AI note\n--- END\n';
                const result = upsertAiNote({
                    body,
                    aiNote: 'New AI note',
                    logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT
                });
                expect(result).toBe('- AI Note:\nNew AI note\n--- END\n');
            });

            test('should clear trailing newlines from AI note', () => {
                const result = upsertAiNote({
                    body: '',
                    aiNote: 'AI note\n\n\n',
                    logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT
                });
                expect(result).toBe('- AI Note:\nAI note\n--- END\n');
            });
        });
    });

    describe('upsertTranscript', () => {
        describe('HTML format', () => {
            test('should add transcript', () => {
                const result = upsertTranscript({
                    body: '',
                    transcript: 'Call transcript',
                    logFormat: LOG_DETAILS_FORMAT_TYPE.HTML
                });
                expect(result).toBe('<div><b>Transcript</b><br>Call transcript</div><br>');
            });

            test('should replace existing transcript', () => {
                const body = '<div><b>Transcript</b><br>Old transcript</div><br>';
                const result = upsertTranscript({
                    body,
                    transcript: 'New transcript',
                    logFormat: LOG_DETAILS_FORMAT_TYPE.HTML
                });
                expect(result).toBe('<div><b>Transcript</b><br>New transcript</div><br>');
            });

            test('should handle multiline transcript', () => {
                const result = upsertTranscript({
                    body: '',
                    transcript: 'Line 1\nLine 2\nLine 3',
                    logFormat: LOG_DETAILS_FORMAT_TYPE.HTML
                });
                expect(result).toBe('<div><b>Transcript</b><br>Line 1<br>Line 2<br>Line 3</div><br>');
            });
        });

        describe('Plain text format', () => {
            test('should add transcript', () => {
                const result = upsertTranscript({
                    body: '',
                    transcript: 'Call transcript',
                    logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT
                });
                expect(result).toBe('- Transcript:\nCall transcript\n--- END\n');
            });

            test('should replace existing transcript', () => {
                const body = '- Transcript:\nOld transcript\n--- END\n';
                const result = upsertTranscript({
                    body,
                    transcript: 'New transcript',
                    logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT
                });
                expect(result).toBe('- Transcript:\nNew transcript\n--- END\n');
            });
        });
    });

    describe('upsertLegs', () => {
        const sampleLegs = [
            {
                direction: 'Outbound',
                from: { name: 'Agent', phoneNumber: '+100', extensionNumber: '101' },
                to: { name: 'John', phoneNumber: '+200' },
                duration: 30
            },
            {
                direction: 'Outbound',
                from: { name: 'Agent', phoneNumber: '+100', extensionNumber: '101' },
                to: { name: 'Queue', extensionNumber: '500' },
                legType: 'PstnToSip',
                duration: 45
            }
        ];

        const journeyText = 'Made call from Agent, +100, ext 101\nTransferred to Queue, ext 500, duration: 45 seconds';

        describe('HTML format', () => {
            test('should add legs section to empty body', () => {
                const result = upsertLegs({
                    body: '',
                    legs: sampleLegs,
                    logFormat: LOG_DETAILS_FORMAT_TYPE.HTML
                });
                expect(result).toBe(`<div><b>Call journey</b><br>${journeyText.replace(/\n/g, '<br>')}</div>`);
            });

            test('should replace existing legs section', () => {
                const body = '<div><b>Call journey</b><br>Made call from Agent, +000, ext 101<br>Transferred to Queue, ext 500, duration: 12 seconds</div>';
                const result = upsertLegs({
                    body,
                    legs: sampleLegs,
                    logFormat: LOG_DETAILS_FORMAT_TYPE.HTML
                });
                expect(result).toBe(`<div><b>Call journey</b><br>${journeyText.replace(/\n/g, '<br>')}</div>`);
            });
        });

        describe('Markdown format', () => {
            test('should add legs section', () => {
                const result = upsertLegs({
                    body: '',
                    legs: sampleLegs,
                    logFormat: LOG_DETAILS_FORMAT_TYPE.MARKDOWN
                });
                expect(result).toBe(`### Call journey\n${journeyText}\n`);
            });

            test('should replace existing legs section', () => {
                const body = '### Call journey\nMade call from Agent, +000, ext 101\nTransferred to Queue, ext 500, duration: 12 seconds\n';
                const result = upsertLegs({
                    body,
                    legs: sampleLegs,
                    logFormat: LOG_DETAILS_FORMAT_TYPE.MARKDOWN
                });
                expect(result).toBe(`### Call journey\n${journeyText}\n\n`);
            });
        });

        describe('Plain text format', () => {
            test('should add legs block', () => {
                const result = upsertLegs({
                    body: '',
                    legs: sampleLegs,
                    logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT
                });
                expect(result).toBe(`- Call journey:\n${journeyText}\n--- JOURNEY END\n`);
            });

            test('should replace existing legs block', () => {
                const body = `- Note: From auto logging 123\- Summary: Inbound Call from Embbnux Rcorg\n- Contact Number: +16579991394\- Call journey:\nMade call from Agent, +000, ext 101\nTransferred to Queue, ext 500, duration: 12 seconds\n--- JOURNEY END\n`;
                const result = upsertLegs({
                    body,
                    legs: sampleLegs,
                    logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT
                });
                expect(result).toBe(`- Note: From auto logging 123\- Summary: Inbound Call from Embbnux Rcorg\n- Contact Number: +16579991394\- Call journey:\n${journeyText}\n--- JOURNEY END\n`);
            });

            test('should keep journey when upserting Note', () => {
                const body = `- Note: From auto logging 123\n- Summary: Inbound Call from Embbnux Rcorg\n- Contact Number: +16579991394\- Call journey:\nMade call from Agent, +000, ext 101\nTransferred to Queue, ext 500, duration: 12 seconds\n--- JOURNEY END\n`;
                const result = upsertCallAgentNote({
                    body,
                    note: 'New note',
                    logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT
                });
                expect(result).toBe(`- Note: New note\n- Summary: Inbound Call from Embbnux Rcorg\n- Contact Number: +16579991394\- Call journey:\nMade call from Agent, +000, ext 101\nTransferred to Queue, ext 500, duration: 12 seconds\n--- JOURNEY END\n`);
            });
        });

        test('should return body unchanged when legs are empty or missing', () => {
            const body = 'Some existing body';
            expect(upsertLegs({ body, legs: [], logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT })).toBe(body);
            expect(upsertLegs({ body, legs: null, logFormat: LOG_DETAILS_FORMAT_TYPE.HTML })).toBe(body);
        });
    });

    describe('composeCallLog', () => {
        const mockUser = {
            timezoneOffset: '+05:30',
            userSettings: {
                addCallLogNote: { value: true },
                addCallLogSubject: { value: true },
                addCallLogDateTime: { value: true },
                addCallLogDuration: { value: true },
                addCallLogResult: { value: true },
                addCallLogRecording: { value: true },
                addCallLogAINote: { value: true },
                addCallLogTranscript: { value: true },
                addCallSessionId: { value: true },
                addCallLogContactNumber: { value: true }
            }
        };

        const mockCallLog = {
            sessionId: 'session123',
            startTime: new Date('2023-01-01T12:00:00Z'),
            duration: 90,
            result: 'Answered',
            direction: 'Inbound'
        };

        const mockContactInfo = {
            phoneNumber: '+1234567890',
            name: 'John Doe'
        };

        test('should compose complete call log with all fields in HTML format', async () => {
            const result = await composeCallLog({
                logFormat: LOG_DETAILS_FORMAT_TYPE.HTML,
                callLog: mockCallLog,
                contactInfo: mockContactInfo,
                user: mockUser,
                note: 'Test note',
                subject: 'Test subject',
                aiNote: 'AI generated note',
                transcript: 'Call transcript',
                recordingLink: 'https://example.com/recording.mp3',
                duration: mockCallLog.duration,
                result: mockCallLog.result
            });

            expect(result).toContain('<b>Agent notes</b>');
            expect(result).toContain('Test note');
            expect(result).toContain('<b>Session Id</b>: session123');
            expect(result).toContain('<b>Summary</b>: Test subject');
            expect(result).toContain('<b>Caller phone number</b>: +1234567890');
            expect(result).toContain('<b>Date/time</b>:');
            expect(result).toContain('<b>Duration</b>: 1 minute, 30 seconds');
            expect(result).toContain('<b>Result</b>: Answered');
            expect(result).toContain('<b>Call recording link</b>');
            expect(result).toContain('<b>AI Note</b>');
            expect(result).toContain('<b>Transcript</b>');
        });

        test('should compose complete call log with all fields in plain text format', async () => {
            const result = await composeCallLog({
                logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT,
                callLog: mockCallLog,
                contactInfo: mockContactInfo,
                user: mockUser,
                note: 'Test note',
                subject: 'Test subject',
                aiNote: 'AI generated note',
                transcript: 'Call transcript',
                recordingLink: 'https://example.com/recording.mp3',
                duration: mockCallLog.duration,
                result: mockCallLog.result
            });

            expect(result).toContain('- Note: Test note');
            expect(result).toContain('- Session Id: session123');
            expect(result).toContain('- Summary: Test subject');
            expect(result).toContain('- Contact Number: +1234567890');
            expect(result).toContain('- Date/Time:');
            expect(result).toContain('- Duration: 1 minute, 30 seconds');
            expect(result).toContain('- Result: Answered');
            expect(result).toContain('- Call recording link:');
            expect(result).toContain('- AI Note:');
            expect(result).toContain('- Transcript:');
        });

        test('should respect user settings and skip disabled fields', async () => {
            const userWithDisabledSettings = {
                ...mockUser,
                userSettings: {
                    ...mockUser.userSettings,
                    addCallLogNote: { value: false },
                    addCallLogSubject: { value: false },
                    addCallLogDateTime: { value: false }
                }
            };

            const result = await composeCallLog({
                logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT,
                callLog: mockCallLog,
                contactInfo: mockContactInfo,
                user: userWithDisabledSettings,
                note: 'Test note',
                subject: 'Test subject',
                duration: mockCallLog.duration,
                result: mockCallLog.result
            });

            expect(result).not.toContain('- Note: Test note');
            expect(result).not.toContain('- Summary: Test subject');
            expect(result).not.toContain('- Date/Time:');
            expect(result).toContain('- Duration: 1 minute, 30 seconds'); // This should still be included
        });

        test('should handle empty user settings with defaults', async () => {
            const userWithoutSettings = {
                ...mockUser,
                userSettings: {}
            };

            const result = await composeCallLog({
                logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT,
                callLog: mockCallLog,
                contactInfo: mockContactInfo,
                user: userWithoutSettings,
                note: 'Test note',
                subject: 'Test subject',
                duration: mockCallLog.duration,
                result: mockCallLog.result
            });

            // Should use default values (true for most fields)
            expect(result).toContain('- Note: Test note');
            expect(result).toContain('- Summary: Test subject');
            expect(result).toContain('- Date/Time:');
            expect(result).toContain('- Duration: 1 minute, 30 seconds');
        });

        test('should handle updating existing body', async () => {
            const existingBody = '- Note: Old note\n- Duration: 30 seconds\n';
            const result = await composeCallLog({
                logFormat: LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT,
                existingBody,
                callLog: mockCallLog,
                contactInfo: mockContactInfo,
                user: mockUser,
                note: 'New note',
                duration: mockCallLog.duration,
                result: mockCallLog.result
            });

            expect(result).toContain('- Note: New note');
            expect(result).toContain('- Duration: 1 minute, 30 seconds'); // Should be updated
        });
    });
}); 