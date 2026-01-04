const moment = require('moment-timezone');
const { secondsToHoursMinutesSeconds } = require('./util');
const connectorRegistry = require('../connector/registry');
const { LOG_DETAILS_FORMAT_TYPE } = require('./constants');

/**
 * Centralized call log composition module
 * Supports both plain text and HTML formats used across different CRM connectors
 */

/**
 * Compose call log details based on user settings and format type
 * @param {Object} params - Composition parameters
 * @param {string} params.logFormat - logFormat type: 'plainText' or 'html'
 * @param {string} params.existingBody - Existing log body (for updates)
 * @param {Object} params.callLog - Call log information
 * @param {Object} params.contactInfo - Contact information
 * @param {Object} params.user - User information
 * @param {string} params.note - User note
 * @param {string} params.aiNote - AI generated note
 * @param {string} params.transcript - Call transcript
 * @param {string} params.recordingLink - Recording link
 * @param {string} params.subject - Call subject
 * @param {Date} params.startTime - Call start time
 * @param {number} params.duration - Call duration in seconds
 * @param {string} params.result - Call result
 * @returns {Promise<string>} Composed log body
 */
function composeCallLog(params) {
    const {
        logFormat = LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT,
        existingBody = '',
        callLog,
        contactInfo,
        user,
        note,
        aiNote,
        transcript,
        recordingLink,
        subject,
        startTime,
        duration,
        result,
        ringSenseTranscript,
        ringSenseSummary,
        ringSenseAIScore,
        ringSenseBulletedSummary,
        ringSenseLink,
        platform
    } = params;

    let body = existingBody;
    const userSettings = user.userSettings || {};
    // Determine timezone handling
    let resolvedStartTime = startTime || callLog?.startTime;
    let timezoneOffset = user.timezoneOffset;
    if (resolvedStartTime) {
        resolvedStartTime = moment(resolvedStartTime);
    }
    // Apply upsert functions based on user settings
    if (note && (userSettings?.addCallLogNote?.value ?? true)) {
        body = upsertCallAgentNote({ body, note, logFormat });
    }

    if (callLog?.sessionId && (userSettings?.addCallSessionId?.value ?? false)) {
        body = upsertCallSessionId({ body, id: callLog.sessionId, logFormat });
    }

    if (userSettings?.addRingCentralUserName?.value) {
        const ringcentralUsername = (callLog.direction === 'Inbound' ? callLog?.to?.name : callLog?.from?.name) ?? null;
        if (ringcentralUsername) {
            body = upsertRingCentralUserName({ body, userName: ringcentralUsername, logFormat });
        }
    }

    if (userSettings?.addRingCentralNumber?.value ?? false) {
        const ringcentralNumber = callLog.direction === 'Inbound' ? callLog?.to?.phoneNumber : callLog?.from?.phoneNumber;
        if (ringcentralNumber) {
            const ringcentralExtensionNumber = callLog.direction === 'Inbound' ? callLog?.from?.extensionNumber : callLog?.to?.extensionNumber;
            body = upsertRingCentralNumberAndExtension({ body, number: ringcentralNumber, extension: ringcentralExtensionNumber ?? '', logFormat });
        }
    }

    if (subject && (userSettings?.addCallLogSubject?.value ?? true)) {
        body = upsertCallSubject({ body, subject, logFormat });
    }

    if (contactInfo?.phoneNumber && (userSettings?.addCallLogContactNumber?.value ?? false)) {
        body = upsertContactPhoneNumber({
            body,
            phoneNumber: contactInfo.phoneNumber,
            direction: callLog?.direction,
            logFormat
        });
    }

    if (resolvedStartTime && (userSettings?.addCallLogDateTime?.value ?? true)) {
        body = upsertCallDateTime({
            body,
            startTime: resolvedStartTime,
            timezoneOffset,
            logDateFormat: userSettings?.logDateFormat?.value ?? 'YYYY-MM-DD hh:mm:ss A',
            logFormat
        });
    }

    if (typeof duration !== 'undefined' && (userSettings?.addCallLogDuration?.value ?? true)) {
        body = upsertCallDuration({ body, duration, logFormat });
    }

    if (result && (userSettings?.addCallLogResult?.value ?? true)) {
        body = upsertCallResult({ body, result, logFormat });
    }

    if (recordingLink && (userSettings?.addCallLogRecording?.value ?? true)) {
        body = upsertCallRecording({ body, recordingLink, logFormat });
    }

    if (aiNote && (userSettings?.addCallLogAINote?.value ?? true)) {
        body = upsertAiNote({ body, aiNote, logFormat });
    }

    if (transcript && (userSettings?.addCallLogTranscript?.value ?? true)) {
        body = upsertTranscript({ body, transcript, logFormat });
    }

    if (ringSenseTranscript && (userSettings?.addCallLogRingSenseRecordingTranscript?.value ?? true)) {
        body = upsertRingSenseTranscript({ body, transcript: ringSenseTranscript, logFormat });
    }

    if (ringSenseSummary && (userSettings?.addCallLogRingSenseRecordingSummary?.value ?? true)) {
        body = upsertRingSenseSummary({ body, summary: ringSenseSummary, logFormat });
    }

    if (ringSenseAIScore && (userSettings?.addCallLogRingSenseRecordingAIScore?.value ?? true)) {
        body = upsertRingSenseAIScore({ body, score: ringSenseAIScore, logFormat });
    }

    if (ringSenseBulletedSummary && (userSettings?.addCallLogRingSenseRecordingBulletedSummary?.value ?? true)) {
        body = upsertRingSenseBulletedSummary({ body, summary: ringSenseBulletedSummary, logFormat });
    }

    if (ringSenseLink && (userSettings?.addCallLogRingSenseRecordingLink?.value ?? true)) {
        body = upsertRingSenseLink({ body, link: ringSenseLink, logFormat });
    }

    if (callLog?.legs && (userSettings?.addCallLogLegs?.value ?? true)) {
        body = upsertLegs({ body, legs: callLog.legs, logFormat });
    }

    return body;
}

/**
 * Upsert functions for different log components
 */

function upsertCallAgentNote({ body, note, logFormat }) {
    if (!note) return body;

    let noteRegex = null;
    switch (logFormat) {
        case LOG_DETAILS_FORMAT_TYPE.HTML:
            // HTML logFormat with proper Agent notes section handling
            noteRegex = RegExp('<b>Agent notes</b>([\\s\\S]+?)Call details</b>');
            if (noteRegex.test(body)) {
                return body.replace(noteRegex, `<b>Agent notes</b><br>${note}<br><br><b>Call details</b>`);
            }
            return `<b>Agent notes</b><br>${note}<br><br><b>Call details</b><br>` + body;
        case LOG_DETAILS_FORMAT_TYPE.MARKDOWN:
            // Markdown logFormat with proper Agent notes section handling
            noteRegex = /## Agent notes\n([\s\S]*?)\n## Call details/;
            if (noteRegex.test(body)) {
                return body.replace(noteRegex, `## Agent notes\n${note}\n\n## Call details`);
            }
            if (body.startsWith('## Call details')) {
                return `## Agent notes\n${note}\n\n` + body;
            }
            return `## Agent notes\n${note}\n\n## Call details\n` + body;
        case LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT:
            // Plain text logFormat - FIXED REGEX for multi-line notes with blank lines
            noteRegex = /- (?:Note|Agent notes): ([\s\S]*?)(?=\n- [A-Z][a-zA-Z\s/]*:|\n$|$)/;
            if (noteRegex.test(body)) {
                return body.replace(noteRegex, `- Note: ${note}`);
            }
            return `- Note: ${note}\n` + body;
    }
}

function upsertCallSessionId({ body, id, logFormat }) {
    if (!id) return body;

    let idRegex = null;
    switch (logFormat) {
        case LOG_DETAILS_FORMAT_TYPE.HTML:
            // More flexible regex that handles both <li> wrapped and unwrapped content
            idRegex = /(?:<li>)?<b>Session Id<\/b>:\s*([^<\n]+)(?:<\/li>|(?=<|$))/i;
            if (idRegex.test(body)) {
                return body.replace(idRegex, `<li><b>Session Id</b>: ${id}</li>`);
            }
            return body + `<li><b>Session Id</b>: ${id}</li>`;
        case LOG_DETAILS_FORMAT_TYPE.MARKDOWN:
            // Markdown format: **Session Id**: value
            idRegex = /\*\*Session Id\*\*: [^\n]*\n*/;
            if (idRegex.test(body)) {
                return body.replace(idRegex, `**Session Id**: ${id}\n`);
            }
            return body + `**Session Id**: ${id}\n`;
        case LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT:
            // Match Session Id field and any trailing newlines, replace with single newline
            idRegex = /- Session Id: [^\n]*\n*/;
            if (idRegex.test(body)) {
                return body.replace(idRegex, `- Session Id: ${id}\n`);
            }
            return body + `- Session Id: ${id}\n`;
    }
}

function upsertRingCentralUserName({ body, userName, logFormat }) {
    if (!userName) return body;

    let userNameRegex = null;
    let match = null;
    switch (logFormat) {
        case LOG_DETAILS_FORMAT_TYPE.HTML:
            userNameRegex = /(?:<li>)?<b>RingCentral user name<\/b>:\s*([^<\n]+)(?:<\/li>|(?=<|$))/i;
            match = body.match(userNameRegex);
            if (match) {
                // Only replace if existing value is (pending...)
                if (match[1].trim() === '(pending...)') {
                    return body.replace(userNameRegex, `<li><b>RingCentral user name</b>: ${userName}</li>`);
                }
                return body;
            } else {
                return body + `<li><b>RingCentral user name</b>: ${userName}</li>`;
            }
        case LOG_DETAILS_FORMAT_TYPE.MARKDOWN:
            userNameRegex = /\*\*RingCentral user name\*\*: ([^\n]*)\n*/i;
            match = body.match(userNameRegex);
            if (match) {
                // Only replace if existing value is (pending...)
                if (match[1].trim() === '(pending...)') {
                    return body.replace(userNameRegex, `**RingCentral user name**: ${userName}\n`);
                }
                return body;
            } else {
                return body + `**RingCentral user name**: ${userName}\n`;
            }
        case LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT:
            userNameRegex = /- RingCentral user name: ([^\n]*)\n*/;
            match = body.match(userNameRegex);
            if (match) {
                // Only replace if existing value is (pending...)
                if (match[1].trim() === '(pending...)') {
                    return body.replace(userNameRegex, `- RingCentral user name: ${userName}\n`);
                }
                return body;
            } else {
                return body + `- RingCentral user name: ${userName}\n`;
            }
    }
}

function upsertRingCentralNumberAndExtension({ body, number, extension, logFormat }) {
    if (!number && !extension) return body;

    let numberAndExtensionRegex = null;
    switch (logFormat) {
        case LOG_DETAILS_FORMAT_TYPE.HTML:
            numberAndExtensionRegex = /(?:<li>)?<b>RingCentral number and extension<\/b>:\s*([^<\n]+)(?:<\/li>|(?=<|$))/i;
            if (numberAndExtensionRegex.test(body)) {
                return body.replace(numberAndExtensionRegex, `<li><b>RingCentral number and extension</b>: ${number} ${extension}</li>`);
            }
            return body + `<li><b>RingCentral number and extension</b>: ${number} ${extension}</li>`;
        case LOG_DETAILS_FORMAT_TYPE.MARKDOWN:
            numberAndExtensionRegex = /\*\*RingCentral number and extension\*\*: [^\n]*\n*/i;
            if (numberAndExtensionRegex.test(body)) {
                return body.replace(numberAndExtensionRegex, `**RingCentral number and extension**: ${number} ${extension}\n`);
            }
            return body + `**RingCentral number and extension**: ${number} ${extension}\n`;
        case LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT:
            numberAndExtensionRegex = /- RingCentral number and extension: [^\n]*\n*/;
            if (numberAndExtensionRegex.test(body)) {
                return body.replace(numberAndExtensionRegex, `- RingCentral number and extension: ${number} ${extension}\n`);
            }
            return body + `- RingCentral number and extension: ${number} ${extension}\n`;
    }
}

function upsertCallSubject({ body, subject, logFormat }) {
    if (!subject) return body;

    let subjectRegex = null;
    switch (logFormat) {
        case LOG_DETAILS_FORMAT_TYPE.HTML:
            // More flexible regex that handles both <li> wrapped and unwrapped content
            subjectRegex = /(?:<li>)?<b>Summary<\/b>:\s*([^<\n]+)(?:<\/li>|(?=<|$))/i;
            if (subjectRegex.test(body)) {
                return body.replace(subjectRegex, `<li><b>Summary</b>: ${subject}</li>`);
            }
            return body + `<li><b>Summary</b>: ${subject}</li>`;
        case LOG_DETAILS_FORMAT_TYPE.MARKDOWN:
            // Markdown format: **Summary**: value
            subjectRegex = /\*\*Summary\*\*: [^\n]*\n*/;
            if (subjectRegex.test(body)) {
                return body.replace(subjectRegex, `**Summary**: ${subject}\n`);
            }
            return body + `**Summary**: ${subject}\n`;
        case LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT:
            // Match Summary field and any trailing newlines, replace with single newline
            subjectRegex = /- Summary: [^\n]*\n*/;
            if (subjectRegex.test(body)) {
                return body.replace(subjectRegex, `- Summary: ${subject}\n`);
            }
            return body + `- Summary: ${subject}\n`;
    }
}

function upsertContactPhoneNumber({ body, phoneNumber, direction, logFormat }) {
    if (!phoneNumber) return body;

    const label = direction === 'Outbound' ? 'Recipient' : 'Caller';
    let result = body;

    let phoneNumberRegex = null;
    switch (logFormat) {
        case LOG_DETAILS_FORMAT_TYPE.HTML:
            // More flexible regex that handles both <li> wrapped and unwrapped content
            phoneNumberRegex = new RegExp(`(?:<li>)?<b>${label} phone number</b>:\\s*([^<\\n]+)(?:</li>|(?=<|$))`, 'i');
            if (phoneNumberRegex.test(result)) {
                result = result.replace(phoneNumberRegex, `<li><b>${label} phone number</b>: ${phoneNumber}</li>`);
            } else {
                result += `<li><b>${label} phone number</b>: ${phoneNumber}</li>`;
            }
            break;
        case LOG_DETAILS_FORMAT_TYPE.MARKDOWN:
            // Markdown format: **Contact Number**: value
            phoneNumberRegex = /\*\*Contact Number\*\*: [^\n]*\n*/;
            if (phoneNumberRegex.test(result)) {
                result = result.replace(phoneNumberRegex, `**Contact Number**: ${phoneNumber}\n`);
            } else {
                result += `**Contact Number**: ${phoneNumber}\n`;
            }
            break;
        case LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT:
            // More flexible regex that handles both with and without newlines
            phoneNumberRegex = /- Contact Number: ([^\n-]+)(?=\n-|\n|$)/;
            if (phoneNumberRegex.test(result)) {
                result = result.replace(phoneNumberRegex, `- Contact Number: ${phoneNumber}\n`);
            } else {
                result += `- Contact Number: ${phoneNumber}\n`;
            }
            break;
    }
    return result;
}

function upsertCallDateTime({ body, startTime, timezoneOffset, logFormat, logDateFormat }) {
    if (!startTime) return body;

    // Simple approach: convert to moment and apply timezone offset
    let momentTime = moment(startTime);
    if (timezoneOffset) {
        // Handle both string offsets ('+05:30') and numeric offsets (330 minutes or 5.5 hours)
        if (typeof timezoneOffset === 'string' && timezoneOffset.includes(':')) {
            // String logFormat like '+05:30' or '-05:00'
            momentTime = momentTime.utcOffset(timezoneOffset);
        } else {
            // Numeric logFormat (minutes or hours)
            momentTime = momentTime.utcOffset(Number(timezoneOffset));
        }
    }
    const formattedDateTime = momentTime.format(logDateFormat || 'YYYY-MM-DD hh:mm:ss A');
    let result = body;

    let dateTimeRegex = null;
    switch (logFormat) {
        case LOG_DETAILS_FORMAT_TYPE.HTML:
            // More flexible regex that handles both <li> wrapped and unwrapped content
            dateTimeRegex = /(?:<li>)?<b>Date\/time<\/b>:\s*([^<\n]+)(?:<\/li>|(?=<|$))/i;
            if (dateTimeRegex.test(result)) {
                result = result.replace(dateTimeRegex, `<li><b>Date/time</b>: ${formattedDateTime}</li>`);
            } else {
                result += `<li><b>Date/time</b>: ${formattedDateTime}</li>`;
            }
            break;
        case LOG_DETAILS_FORMAT_TYPE.MARKDOWN:
            // Markdown format: **Date/Time**: value
            dateTimeRegex = /\*\*Date\/Time\*\*: [^\n]*\n*/;
            if (dateTimeRegex.test(result)) {
                result = result.replace(dateTimeRegex, `**Date/Time**: ${formattedDateTime}\n`);
            } else {
                result += `**Date/Time**: ${formattedDateTime}\n`;
            }
            break;
        case LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT:
            // Handle duplicated Date/Time entries and match complete date/time values
            dateTimeRegex = /^(- Date\/Time:).*$/m;
            if (dateTimeRegex.test(result)) {
                result = result.replace(dateTimeRegex, `- Date/Time: ${formattedDateTime}`);
            } else {
                result += `- Date/Time: ${formattedDateTime}\n`;
            }
            break;
    }
    return result;
}

function upsertCallDuration({ body, duration, logFormat }) {
    if (typeof duration === 'undefined') return body;

    const formattedDuration = secondsToHoursMinutesSeconds(duration);
    let result = body;
    let durationRegex = null;
    switch (logFormat) {
        case LOG_DETAILS_FORMAT_TYPE.HTML:
            // More flexible regex that handles both <li> wrapped and unwrapped content
            durationRegex = /(?:<li>)?<b>Duration<\/b>:\s*([^<\n]+)(?:<\/li>|(?=<|$))/i;
            if (durationRegex.test(result)) {
                result = result.replace(durationRegex, `<li><b>Duration</b>: ${formattedDuration}</li>`);
            } else {
                result += `<li><b>Duration</b>: ${formattedDuration}</li>`;
            }
            break;
        case LOG_DETAILS_FORMAT_TYPE.MARKDOWN:
            // Markdown format: **Duration**: value
            durationRegex = /\*\*Duration\*\*: [^\n]*\n*/;
            if (durationRegex.test(result)) {
                result = result.replace(durationRegex, `**Duration**: ${formattedDuration}\n`);
            } else {
                result += `**Duration**: ${formattedDuration}\n`;
            }
            break;
        case LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT:
            // More flexible regex that handles both with and without newlines
            durationRegex = /- Duration: ([^\n-]+)(?=\n-|\n|$)/;
            if (durationRegex.test(result)) {
                result = result.replace(durationRegex, `- Duration: ${formattedDuration}`);
            } else {
                result += `- Duration: ${formattedDuration}\n`;
            }
            break;
    }
    return result;
}

function upsertCallResult({ body, result, logFormat }) {
    if (!result) return body;

    let bodyResult = body;

    let resultRegex = null;
    switch (logFormat) {
        case LOG_DETAILS_FORMAT_TYPE.HTML:
            // More flexible regex that handles both <li> wrapped and unwrapped content
            resultRegex = /(?:<li>)?<b>Result<\/b>:\s*([^<\n]+)(?:<\/li>|(?=<|$))/i;
            if (resultRegex.test(bodyResult)) {
                bodyResult = bodyResult.replace(resultRegex, `<li><b>Result</b>: ${result}</li>`);
            } else {
                bodyResult += `<li><b>Result</b>: ${result}</li>`;
            }
            break;
        case LOG_DETAILS_FORMAT_TYPE.MARKDOWN:
            // Markdown format: **Result**: value
            resultRegex = /\*\*Result\*\*: [^\n]*\n*/;
            if (resultRegex.test(bodyResult)) {
                bodyResult = bodyResult.replace(resultRegex, `**Result**: ${result}\n`);
            } else {
                bodyResult += `**Result**: ${result}\n`;
            }
            break;
        case LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT:
            // More flexible regex that handles both with and without newlines
            resultRegex = /- Result: ([^\n-]+)(?=\n-|\n|$)/;
            if (resultRegex.test(bodyResult)) {
                bodyResult = bodyResult.replace(resultRegex, `- Result: ${result}`);
            } else {
                bodyResult += `- Result: ${result}\n`;
            }
            break;
    }
    return bodyResult;
}

function upsertCallRecording({ body, recordingLink, logFormat }) {
    if (!recordingLink) return body;

    let result = body;
    let recordingLinkRegex = null;

    switch (logFormat) {
        case LOG_DETAILS_FORMAT_TYPE.HTML:
            // More flexible regex that handles both <li> wrapped and unwrapped content, and existing <a> anchors
            recordingLinkRegex = /(?:<li>)?<b>Call recording link<\/b>:\s*(?:<a[^>]*>[^<]*<\/a>|[^<]+)(?:<\/li>|(?=<|$))/i;
            if (recordingLinkRegex.test(result)) {
                if (recordingLink.startsWith('http')) {
                    result = result.replace(recordingLinkRegex, `<li><b>Call recording link</b>: <a target="_blank" href="${recordingLink}">open</a></li>`);
                } else {
                    result = result.replace(recordingLinkRegex, `<li><b>Call recording link</b>: (pending...)</li>`);
                }
            } else {
                let text = '';
                if (recordingLink.startsWith('http')) {
                    text = `<li><b>Call recording link</b>: <a target="_blank" href="${recordingLink}">open</a></li>`;
                } else {
                    text = '<li><b>Call recording link</b>: (pending...)</li>';
                }
                if (result.indexOf('</ul>') === -1) {
                    result += text;
                } else {
                    result = result.replace('</ul>', `${text}</ul>`);
                }
            }
            break;
        case LOG_DETAILS_FORMAT_TYPE.MARKDOWN:
            // Markdown format: **Call recording link**: value
            recordingLinkRegex = /\*\*Call recording link\*\*: [^\n]*\n*/;
            if (recordingLinkRegex.test(result)) {
                result = result.replace(recordingLinkRegex, `**Call recording link**: ${recordingLink}\n`);
            } else {
                result += `**Call recording link**: ${recordingLink}\n`;
            }
            break;
        case LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT:
            // Match recording link field and any trailing content, replace with single newline
            recordingLinkRegex = /- Call recording link: [^\n]*\n*/;
            if (recordingLinkRegex.test(result)) {
                result = result.replace(recordingLinkRegex, `- Call recording link: ${recordingLink}\n`);
            } else {
                if (result && !result.endsWith('\n')) {
                    result += '\n';
                }
                result += `- Call recording link: ${recordingLink}\n`;
            }
            break;
    }
    return result;
}

function upsertAiNote({ body, aiNote, logFormat }) {
    if (!aiNote) return body;

    const clearedAiNote = aiNote.replace(/\n+$/, '');
    let result = body;
    let aiNoteRegex = null;

    switch (logFormat) {
        case LOG_DETAILS_FORMAT_TYPE.HTML:
            const formattedAiNote = clearedAiNote.replace(/(?:\r\n|\r|\n)/g, '<br>');
            aiNoteRegex = /<div><b>AI Note<\/b><br>(.+?)<\/div>/;
            if (aiNoteRegex.test(result)) {
                result = result.replace(aiNoteRegex, `<div><b>AI Note</b><br>${formattedAiNote}</div>`);
            } else {
                result += `<div><b>AI Note</b><br>${formattedAiNote}</div><br>`;
            }
            break;
        case LOG_DETAILS_FORMAT_TYPE.MARKDOWN:
            // Markdown format: ### AI Note
            aiNoteRegex = /### AI Note\n([\s\S]*?)(?=\n### |\n$|$)/;
            if (aiNoteRegex.test(result)) {
                result = result.replace(aiNoteRegex, `### AI Note\n${clearedAiNote}\n`);
            } else {
                result += `### AI Note\n${clearedAiNote}\n`;
            }
            break;
        case LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT:
            aiNoteRegex = /- AI Note:([\s\S]*?)--- END/;
            if (aiNoteRegex.test(result)) {
                result = result.replace(aiNoteRegex, `- AI Note:\n${clearedAiNote}\n--- END`);
            } else {
                result += `\n- AI Note:\n${clearedAiNote}\n--- END\n`;
            }
            break;
    }
    return result;
}

function upsertTranscript({ body, transcript, logFormat }) {
    if (!transcript) return body;

    let result = body;
    let transcriptRegex = null;

    switch (logFormat) {
        case LOG_DETAILS_FORMAT_TYPE.HTML:
            const formattedTranscript = transcript.replace(/(?:\r\n|\r|\n)/g, '<br>');
            transcriptRegex = /<div><b>Transcript<\/b><br>(.+?)<\/div>/;
            if (transcriptRegex.test(result)) {
                result = result.replace(transcriptRegex, `<div><b>Transcript</b><br>${formattedTranscript}</div>`);
            } else {
                result += `<div><b>Transcript</b><br>${formattedTranscript}</div><br>`;
            }
            break;
        case LOG_DETAILS_FORMAT_TYPE.MARKDOWN:
            // Markdown format: ### Transcript
            transcriptRegex = /### Transcript\n([\s\S]*?)(?=\n### |\n$|$)/;
            if (transcriptRegex.test(result)) {
                result = result.replace(transcriptRegex, `### Transcript\n${transcript}\n`);
            } else {
                result += `### Transcript\n${transcript}\n`;
            }
            break;
        case LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT:
            transcriptRegex = /- Transcript:([\s\S]*?)--- END/;
            if (transcriptRegex.test(result)) {
                result = result.replace(transcriptRegex, `- Transcript:\n${transcript}\n--- END`);
            } else {
                result += `\n- Transcript:\n${transcript}\n--- END\n`;
            }
            break;
    }
    return result;
}

function getLegPartyInfo(info) {
    let phoneNumber = info.phoneNumber;
    let extensionNumber = info.extensionNumber;
    let numberInfo = phoneNumber;
    if (!phoneNumber && !extensionNumber) {
        return '';
    }
    if (extensionNumber && phoneNumber) {
        numberInfo = `${phoneNumber}, ext ${extensionNumber}`;
    }
    if (phoneNumber && !extensionNumber) {
        numberInfo = phoneNumber;
    }
    if (!phoneNumber && extensionNumber) {
        numberInfo = `ext ${extensionNumber}`;
    }
    if (info.name) {
        return `${info.name}, ${numberInfo}`;
    }
    return numberInfo;
}

function getLegsJourney(legs) {
    return legs.map((leg, index) => {
        if (index === 0) {
            if (leg.direction === 'Outbound') {
                return `Made call from ${getLegPartyInfo(leg.from)}`;
            } else {
                return `Received call at ${getLegPartyInfo(leg.to)}`;
            }
        }
        if (leg.direction === 'Outbound') {
            let party = leg.from;
            if (leg.legType === 'PstnToSip') {
                party = leg.to;
            }
            return `Transferred to ${getLegPartyInfo(party)}, duration: ${leg.duration} second${leg.duration > 1 ? 's' : ''}`;
        } else {
            return `Transferred to ${getLegPartyInfo(leg.to)}, duration: ${leg.duration} second${leg.duration > 1 ? 's' : ''}`;
        }
    }).join('\n');
}

function upsertLegs({ body, legs, logFormat }) {
    if (!legs || legs.length === 0) return body;

    let result = body;
    let legsJourney = getLegsJourney(legs);
    let legsRegex = null;

    switch (logFormat) {
        case LOG_DETAILS_FORMAT_TYPE.HTML:
            legsJourney = legsJourney.replace(/(?:\r\n|\r|\n)/g, '<br>');
            legsRegex = /<div><b>Call journey<\/b><br>(.+?)<\/div>/;
            if (legsRegex.test(result)) {
                result = result.replace(legsRegex, `<div><b>Call journey</b><br>${legsJourney}</div>`);
            } else {
                result += `<div><b>Call journey</b><br>${legsJourney}</div>`;
            }
            break;
        case LOG_DETAILS_FORMAT_TYPE.MARKDOWN:
            legsRegex = /### Call journey\n([\s\S]*?)(?=\n### |\n$|$)/;
            if (legsRegex.test(result)) {
                result = result.replace(legsRegex, `### Call journey\n${legsJourney}\n`);
            } else {
                result += `### Call journey\n${legsJourney}\n`;
            }
            break;
        case LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT:
            legsRegex = /- Call journey:([\s\S]*?)--- JOURNEY END/;
            if (legsRegex.test(result)) {
                result = result.replace(legsRegex, `- Call journey:\n${legsJourney}\n--- JOURNEY END`);
            } else {
                result += `- Call journey:\n${legsJourney}\n--- JOURNEY END\n`;
            }
            break;
    }

    return result;
}

function upsertRingSenseTranscript({ body, transcript, logFormat }) {
    if (!transcript) return body;

    let result = body;
    const clearedTranscript = transcript.replace(/\n+$/, '');
    let transcriptRegex = null;

    switch (logFormat) {
        case LOG_DETAILS_FORMAT_TYPE.HTML:
            const formattedTranscript = clearedTranscript.replace(/(?:\r\n|\r|\n)/g, '<br>');
            transcriptRegex = /<div><b>RingSense transcript<\/b><br>(.+?)<\/div>/;
            if (transcriptRegex.test(result)) {
                result = result.replace(transcriptRegex, `<div><b>RingSense transcript</b><br>${formattedTranscript}</div>`);
            } else {
                result += `<div><b>RingSense transcript</b><br>${formattedTranscript}</div>`;
            }
            break;
        case LOG_DETAILS_FORMAT_TYPE.MARKDOWN:
            transcriptRegex = /### RingSense transcript\n([\s\S]*?)(?=\n### |\n$|$)/;
            if (transcriptRegex.test(result)) {
                result = result.replace(transcriptRegex, `### RingSense transcript\n${clearedTranscript}\n`);
            } else {
                result += `### RingSense transcript\n${clearedTranscript}\n`;
            }
            break;
        case LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT:
            transcriptRegex = /- RingSense transcript:([\s\S]*?)--- END/;
            if (transcriptRegex.test(result)) {
                result = result.replace(transcriptRegex, `- RingSense transcript:\n${clearedTranscript}\n--- END`);
            } else {
                result += `\n- RingSense transcript:\n${clearedTranscript}\n--- END\n`;
            }
            break;
    }
    return result;
}

function upsertRingSenseSummary({ body, summary, logFormat }) {
    if (!summary) return body;

    let result = body;
    // remove new line in last line of summary
    const clearedSummary = summary.replace(/\n+$/, '');
    let summaryRegex = null;

    switch (logFormat) {
        case LOG_DETAILS_FORMAT_TYPE.HTML:
            summaryRegex = /<div><b>RingSense summary<\/b><br>(.+?)<\/div>/;
            const formattedSummary = clearedSummary.replace(/(?:\r\n|\r|\n)/g, '<br>');
            if (summaryRegex.test(result)) {
                result = result.replace(summaryRegex, `<div><b>RingSense summary</b><br>${formattedSummary}</div>`);
            } else {
                result += `<div><b>RingSense summary</b><br>${formattedSummary}</div>`;
            }
            break;
        case LOG_DETAILS_FORMAT_TYPE.MARKDOWN:
            summaryRegex = /### RingSense summary\n([\s\S]*?)(?=\n### |\n$|$)/;
            if (summaryRegex.test(result)) {
                result = result.replace(summaryRegex, `### RingSense summary\n${summary}\n`);
            } else {
                result += `### RingSense summary\n${summary}\n`;
            }
            break;
        case LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT:
            summaryRegex = /- RingSense summary:([\s\S]*?)--- END/;
            if (summaryRegex.test(result)) {
                result = result.replace(summaryRegex, `- RingSense summary:\n${summary}\n--- END`);
            } else {
                result += `\n- RingSense summary:\n${summary}\n--- END\n`;
            }
            break;
    }
    return result;
}

function upsertRingSenseAIScore({ body, score, logFormat }) {
    if (!score) return body;

    let result = body;
    let scoreRegex = null;

    switch (logFormat) {
        case LOG_DETAILS_FORMAT_TYPE.HTML:
            scoreRegex = /(?:<li>)?<b>Call score<\/b>:\s*([^<\n]+)(?:<\/li>|(?=<|$))/i;
            if (scoreRegex.test(result)) {
                result = result.replace(scoreRegex, `<li><b>Call score</b>: ${score}</li>`);
            } else {
                result += `<li><b>Call score</b>: ${score}</li>`;
            }
            break;
        case LOG_DETAILS_FORMAT_TYPE.MARKDOWN:
            scoreRegex = /\*\*Call score\*\*: [^\n]*\n*/;
            if (scoreRegex.test(result)) {
                result = result.replace(scoreRegex, `**Call score**: ${score}\n`);
            } else {
                result += `**Call score**: ${score}\n`;
            }
            break;
        case LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT:
            scoreRegex = /- Call score:\s*([^<\n]+)(?=\n|$)/i;
            if (scoreRegex.test(result)) {
                result = result.replace(scoreRegex, `- Call score: ${score}`);
            } else {
                result += `- Call score: ${score}\n`;
            }
            break;
    }
    return result;
}

function upsertRingSenseBulletedSummary({ body, summary, logFormat }) {
    if (!summary) return body;

    let result = body;
    const clearedSummary = summary.replace(/\n+$/, '');
    let summaryRegex = null;

    switch (logFormat) {
        case LOG_DETAILS_FORMAT_TYPE.HTML:
            summaryRegex = /<div><b>RingSense bulleted summary<\/b><br>(.+?)<\/div>/;
            const formattedSummary = clearedSummary.replace(/(?:\r\n|\r|\n)/g, '<br>');
            if (summaryRegex.test(result)) {
                result = result.replace(summaryRegex, `<div><b>RingSense bulleted summary</b><br>${formattedSummary}</div>`);
            } else {
                result += `<div><b>RingSense bulleted summary</b><br>${formattedSummary}</div>`;
            }
            break;
        case LOG_DETAILS_FORMAT_TYPE.MARKDOWN:
            summaryRegex = /### RingSense bulleted summary\n([\s\S]*?)(?=\n### |\n$|$)/;
            if (summaryRegex.test(result)) {
                result = result.replace(summaryRegex, `### RingSense bulleted summary\n${summary}\n`);
            } else {
                result += `### RingSense bulleted summary\n${summary}\n`;
            }
            break;
        case LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT:
            summaryRegex = /- RingSense bulleted summary:\s*([^<\n]+)(?=\n|$)/i;
            if (summaryRegex.test(result)) {
                result = result.replace(summaryRegex, `- RingSense bulleted summary:\n${summary}\n--- END`);
            } else {
                result += `\n- RingSense bulleted summary:\n${summary}\n--- END\n`;
            }
            break;
    }
    return result;
}

function upsertRingSenseLink({ body, link, logFormat }) {
    if (!link) return body;

    let result = body;
    let linkRegex = null;

    switch (logFormat) {
        case LOG_DETAILS_FORMAT_TYPE.HTML:
            linkRegex = /(?:<li>)?<b>RingSense recording link<\/b>:\s*(?:<a[^>]*>[^<]*<\/a>|[^<]+)(?:<\/li>|(?=<|$))/i;
            if (linkRegex.test(result)) {
                result = result.replace(linkRegex, `<li><b>RingSense recording link</b>: <a target="_blank" href="${link}">open</a></li>`);
            } else {
                result += `<li><b>RingSense recording link</b>: <a target="_blank" href="${link}">open</a></li>`;
            }
            break;
        case LOG_DETAILS_FORMAT_TYPE.MARKDOWN:
            linkRegex = /\*\*RingSense recording link\*\*:\s*([^<\n]+)(?=\n|$)/i;
            if (linkRegex.test(result)) {
                result = result.replace(linkRegex, `**RingSense recording link**: ${link}\n`);
            } else {
                result += `**RingSense recording link**: ${link}\n`;
            }
            break;
        case LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT:
            linkRegex = /- RingSense recording link:\s*([^<\n]+)(?=\n|$)/i;
            if (linkRegex.test(result)) {
                result = result.replace(linkRegex, `- RingSense recording link: ${link}`);
            } else {
                result += `- RingSense recording link: ${link}\n`;
            }
            break;
    }
    return result;
}

module.exports = {
    composeCallLog,
    // Export individual upsert functions for backward compatibility
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
};
