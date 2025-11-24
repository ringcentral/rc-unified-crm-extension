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
async function composeCallLog(params) {
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

    if (logFormat === LOG_DETAILS_FORMAT_TYPE.HTML) {
        // HTML logFormat with proper Agent notes section handling
        const noteRegex = RegExp('<b>Agent notes</b>([\\s\\S]+?)Call details</b>');
        if (noteRegex.test(body)) {
            return body.replace(noteRegex, `<b>Agent notes</b><br>${note}<br><br><b>Call details</b>`);
        }
        return `<b>Agent notes</b><br>${note}<br><br><b>Call details</b><br>` + body;
    } else if (logFormat === LOG_DETAILS_FORMAT_TYPE.MARKDOWN) {
        // Markdown logFormat with proper Agent notes section handling
        const noteRegex = /## Agent notes\n([\s\S]*?)\n## Call details/;
        if (noteRegex.test(body)) {
            return body.replace(noteRegex, `## Agent notes\n${note}\n\n## Call details`);
        }
        if (body.startsWith('## Call details')) {
            return `## Agent notes\n${note}\n\n` + body;
        }
        return `## Agent notes\n${note}\n\n## Call details\n` + body;
    } else {
        // Plain text logFormat - FIXED REGEX for multi-line notes with blank lines
        const noteRegex = /- (?:Note|Agent notes): ([\s\S]*?)(?=\n- [A-Z][a-zA-Z\s/]*:|\n$|$)/;
        if (noteRegex.test(body)) {
            return body.replace(noteRegex, `- Note: ${note}`);
        }
        return `- Note: ${note}\n` + body;
    }
}

function upsertCallSessionId({ body, id, logFormat }) {
    if (!id) return body;

    if (logFormat === LOG_DETAILS_FORMAT_TYPE.HTML) {
        // More flexible regex that handles both <li> wrapped and unwrapped content
        const idRegex = /(?:<li>)?<b>Session Id<\/b>:\s*([^<\n]+)(?:<\/li>|(?=<|$))/i;
        if (idRegex.test(body)) {
            return body.replace(idRegex, `<li><b>Session Id</b>: ${id}</li>`);
        }
        return body + `<li><b>Session Id</b>: ${id}</li>`;
    } else if (logFormat === LOG_DETAILS_FORMAT_TYPE.MARKDOWN) {
        // Markdown format: **Session Id**: value
        const sessionIdRegex = /\*\*Session Id\*\*: [^\n]*\n*/;
        if (sessionIdRegex.test(body)) {
            return body.replace(sessionIdRegex, `**Session Id**: ${id}\n`);
        }
        return body + `**Session Id**: ${id}\n`;
    } else {
        // Match Session Id field and any trailing newlines, replace with single newline
        const sessionIdRegex = /- Session Id: [^\n]*\n*/;
        if (sessionIdRegex.test(body)) {
            return body.replace(sessionIdRegex, `- Session Id: ${id}\n`);
        }
        return body + `- Session Id: ${id}\n`;
    }
}

function upsertRingCentralUserName({ body, userName, logFormat }) {
    if (!userName) return body;

    if (logFormat === LOG_DETAILS_FORMAT_TYPE.HTML) {
        const userNameRegex = /(?:<li>)?<b>RingCentral user name<\/b>:\s*([^<\n]+)(?:<\/li>|(?=<|$))/i;
        const match = body.match(userNameRegex);
        if (match) {
            // Only replace if existing value is (pending...)
            if (match[1].trim() === '(pending...)') {
                return body.replace(userNameRegex, `<li><b>RingCentral user name</b>: ${userName}</li>`);
            }
            return body;
        } else {
            return body + `<li><b>RingCentral user name</b>: ${userName}</li>`;
        }
    } else if (logFormat === LOG_DETAILS_FORMAT_TYPE.MARKDOWN) {
        const userNameRegex = /\*\*RingCentral user name\*\*: ([^\n]*)\n*/i;
        const match = body.match(userNameRegex);
        if (match) {
            // Only replace if existing value is (pending...)
            if (match[1].trim() === '(pending...)') {
                return body.replace(userNameRegex, `**RingCentral user name**: ${userName}\n`);
            }
            return body;
        } else {
            return body + `**RingCentral user name**: ${userName}\n`;
        }
    } else {
        const userNameRegex = /- RingCentral user name: ([^\n]*)\n*/;
        const match = body.match(userNameRegex);
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

    if (logFormat === LOG_DETAILS_FORMAT_TYPE.HTML) {
        const numberAndExtensionRegex = /(?:<li>)?<b>RingCentral number and extension<\/b>:\s*([^<\n]+)(?:<\/li>|(?=<|$))/i;
        if (numberAndExtensionRegex.test(body)) {
            return body.replace(numberAndExtensionRegex, `<li><b>RingCentral number and extension</b>: ${number} ${extension}</li>`);
        }
        return body + `<li><b>RingCentral number and extension</b>: ${number} ${extension}</li>`;
    } else if (logFormat === LOG_DETAILS_FORMAT_TYPE.MARKDOWN) {
        const numberAndExtensionRegex = /\*\*RingCentral number and extension\*\*: [^\n]*\n*/i;
        if (numberAndExtensionRegex.test(body)) {
            return body.replace(numberAndExtensionRegex, `**RingCentral number and extension**: ${number} ${extension}\n`);
        }
        return body + `**RingCentral number and extension**: ${number} ${extension}\n`;
    } else {
        const numberAndExtensionRegex = /- RingCentral number and extension: [^\n]*\n*/;
        if (numberAndExtensionRegex.test(body)) {
            return body.replace(numberAndExtensionRegex, `- RingCentral number and extension: ${number} ${extension}\n`);
        }
        return body + `- RingCentral number and extension: ${number} ${extension}\n`;
    }
}

function upsertCallSubject({ body, subject, logFormat }) {
    if (!subject) return body;

    if (logFormat === LOG_DETAILS_FORMAT_TYPE.HTML) {
        // More flexible regex that handles both <li> wrapped and unwrapped content
        const subjectRegex = /(?:<li>)?<b>Summary<\/b>:\s*([^<\n]+)(?:<\/li>|(?=<|$))/i;
        if (subjectRegex.test(body)) {
            return body.replace(subjectRegex, `<li><b>Summary</b>: ${subject}</li>`);
        }
        return body + `<li><b>Summary</b>: ${subject}</li>`;
    } else if (logFormat === LOG_DETAILS_FORMAT_TYPE.MARKDOWN) {
        // Markdown format: **Summary**: value
        const subjectRegex = /\*\*Summary\*\*: [^\n]*\n*/;
        if (subjectRegex.test(body)) {
            return body.replace(subjectRegex, `**Summary**: ${subject}\n`);
        }
        return body + `**Summary**: ${subject}\n`;
    } else {
        // Match Summary field and any trailing newlines, replace with single newline
        const subjectRegex = /- Summary: [^\n]*\n*/;
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

    if (logFormat === LOG_DETAILS_FORMAT_TYPE.HTML) {
        // More flexible regex that handles both <li> wrapped and unwrapped content
        const phoneNumberRegex = new RegExp(`(?:<li>)?<b>${label} phone number</b>:\\s*([^<\\n]+)(?:</li>|(?=<|$))`, 'i');
        if (phoneNumberRegex.test(result)) {
            result = result.replace(phoneNumberRegex, `<li><b>${label} phone number</b>: ${phoneNumber}</li>`);
        } else {
            result += `<li><b>${label} phone number</b>: ${phoneNumber}</li>`;
        }
    } else if (logFormat === LOG_DETAILS_FORMAT_TYPE.MARKDOWN) {
        // Markdown format: **Contact Number**: value
        const phoneNumberRegex = /\*\*Contact Number\*\*: [^\n]*\n*/;
        if (phoneNumberRegex.test(result)) {
            result = result.replace(phoneNumberRegex, `**Contact Number**: ${phoneNumber}\n`);
        } else {
            result += `**Contact Number**: ${phoneNumber}\n`;
        }
    } else {
        // More flexible regex that handles both with and without newlines
        const phoneNumberRegex = /- Contact Number: ([^\n-]+)(?=\n-|\n|$)/;
        if (phoneNumberRegex.test(result)) {
            result = result.replace(phoneNumberRegex, `- Contact Number: ${phoneNumber}\n`);
        } else {
            result += `- Contact Number: ${phoneNumber}\n`;
        }
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

    if (logFormat === LOG_DETAILS_FORMAT_TYPE.HTML) {
        // More flexible regex that handles both <li> wrapped and unwrapped content
        const dateTimeRegex = /(?:<li>)?<b>Date\/time<\/b>:\s*([^<\n]+)(?:<\/li>|(?=<|$))/i;
        if (dateTimeRegex.test(result)) {
            result = result.replace(dateTimeRegex, `<li><b>Date/time</b>: ${formattedDateTime}</li>`);
        } else {
            result += `<li><b>Date/time</b>: ${formattedDateTime}</li>`;
        }
    } else if (logFormat === LOG_DETAILS_FORMAT_TYPE.MARKDOWN) {
        // Markdown format: **Date/Time**: value
        const dateTimeRegex = /\*\*Date\/Time\*\*: [^\n]*\n*/;
        if (dateTimeRegex.test(result)) {
            result = result.replace(dateTimeRegex, `**Date/Time**: ${formattedDateTime}\n`);
        } else {
            result += `**Date/Time**: ${formattedDateTime}\n`;
        }
    } else {
        // Handle duplicated Date/Time entries and match complete date/time values
        const dateTimeRegex = /^(- Date\/Time:).*$/m;
        if (dateTimeRegex.test(result)) {
            result = result.replace(dateTimeRegex, `- Date/Time: ${formattedDateTime}`);
        } else {
            result += `- Date/Time: ${formattedDateTime}\n`;
        }
    }
    return result;
}

function upsertCallDuration({ body, duration, logFormat }) {
    if (typeof duration === 'undefined') return body;

    const formattedDuration = secondsToHoursMinutesSeconds(duration);
    let result = body;

    if (logFormat === LOG_DETAILS_FORMAT_TYPE.HTML) {
        // More flexible regex that handles both <li> wrapped and unwrapped content
        const durationRegex = /(?:<li>)?<b>Duration<\/b>:\s*([^<\n]+)(?:<\/li>|(?=<|$))/i;
        if (durationRegex.test(result)) {
            result = result.replace(durationRegex, `<li><b>Duration</b>: ${formattedDuration}</li>`);
        } else {
            result += `<li><b>Duration</b>: ${formattedDuration}</li>`;
        }
    } else if (logFormat === LOG_DETAILS_FORMAT_TYPE.MARKDOWN) {
        // Markdown format: **Duration**: value
        const durationRegex = /\*\*Duration\*\*: [^\n]*\n*/;
        if (durationRegex.test(result)) {
            result = result.replace(durationRegex, `**Duration**: ${formattedDuration}\n`);
        } else {
            result += `**Duration**: ${formattedDuration}\n`;
        }
    } else {
        // More flexible regex that handles both with and without newlines
        const durationRegex = /- Duration: ([^\n-]+)(?=\n-|\n|$)/;
        if (durationRegex.test(result)) {
            result = result.replace(durationRegex, `- Duration: ${formattedDuration}`);
        } else {
            result += `- Duration: ${formattedDuration}\n`;
        }
    }
    return result;
}

function upsertCallResult({ body, result, logFormat }) {
    if (!result) return body;

    let bodyResult = body;

    if (logFormat === LOG_DETAILS_FORMAT_TYPE.HTML) {
        // More flexible regex that handles both <li> wrapped and unwrapped content
        const resultRegex = /(?:<li>)?<b>Result<\/b>:\s*([^<\n]+)(?:<\/li>|(?=<|$))/i;
        if (resultRegex.test(bodyResult)) {
            bodyResult = bodyResult.replace(resultRegex, `<li><b>Result</b>: ${result}</li>`);
        } else {
            bodyResult += `<li><b>Result</b>: ${result}</li>`;
        }
    } else if (logFormat === LOG_DETAILS_FORMAT_TYPE.MARKDOWN) {
        // Markdown format: **Result**: value
        const resultRegex = /\*\*Result\*\*: [^\n]*\n*/;
        if (resultRegex.test(bodyResult)) {
            bodyResult = bodyResult.replace(resultRegex, `**Result**: ${result}\n`);
        } else {
            bodyResult += `**Result**: ${result}\n`;
        }
    } else {
        // More flexible regex that handles both with and without newlines
        const resultRegex = /- Result: ([^\n-]+)(?=\n-|\n|$)/;
        if (resultRegex.test(bodyResult)) {
            bodyResult = bodyResult.replace(resultRegex, `- Result: ${result}`);
        } else {
            bodyResult += `- Result: ${result}\n`;
        }
    }
    return bodyResult;
}

function upsertCallRecording({ body, recordingLink, logFormat }) {
    if (!recordingLink) return body;

    let result = body;

    if (logFormat === LOG_DETAILS_FORMAT_TYPE.HTML) {
		// More flexible regex that handles both <li> wrapped and unwrapped content, and existing <a> anchors
		const recordingLinkRegex = /(?:<li>)?<b>Call recording link<\/b>:\s*(?:<a[^>]*>[^<]*<\/a>|[^<]+)(?:<\/li>|(?=<|$))/i;
        if (recordingLink) {
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
        }
    } else if (logFormat === LOG_DETAILS_FORMAT_TYPE.MARKDOWN) {
        // Markdown format: **Call recording link**: value
        const recordingLinkRegex = /\*\*Call recording link\*\*: [^\n]*\n*/;
        if (recordingLinkRegex.test(result)) {
            result = result.replace(recordingLinkRegex, `**Call recording link**: ${recordingLink}\n`);
        } else {
            result += `**Call recording link**: ${recordingLink}\n`;
        }
    } else {
        // Match recording link field and any trailing content, replace with single newline
        const recordingLinkRegex = /- Call recording link: [^\n]*\n*/;
        if (recordingLinkRegex.test(result)) {
            result = result.replace(recordingLinkRegex, `- Call recording link: ${recordingLink}\n`);
        } else {
            if (result && !result.endsWith('\n')) {
                result += '\n';
            }
            result += `- Call recording link: ${recordingLink}\n`;
        }
    }
    return result;
}

function upsertAiNote({ body, aiNote, logFormat }) {
    if (!aiNote) return body;

    const clearedAiNote = aiNote.replace(/\n+$/, '');
    let result = body;

    if (logFormat === LOG_DETAILS_FORMAT_TYPE.HTML) {
        const formattedAiNote = clearedAiNote.replace(/(?:\r\n|\r|\n)/g, '<br>');
        const aiNoteRegex = /<div><b>AI Note<\/b><br>(.+?)<\/div>/;
        if (aiNoteRegex.test(result)) {
            result = result.replace(aiNoteRegex, `<div><b>AI Note</b><br>${formattedAiNote}</div>`);
        } else {
            result += `<div><b>AI Note</b><br>${formattedAiNote}</div><br>`;
        }
    } else if (logFormat === LOG_DETAILS_FORMAT_TYPE.MARKDOWN) {
        // Markdown format: ### AI Note
        const aiNoteRegex = /### AI Note\n([\s\S]*?)(?=\n### |\n$|$)/;
        if (aiNoteRegex.test(result)) {
            result = result.replace(aiNoteRegex, `### AI Note\n${clearedAiNote}\n`);
        } else {
            result += `### AI Note\n${clearedAiNote}\n`;
        }
    } else {
        const aiNoteRegex = /- AI Note:([\s\S]*?)--- END/;
        if (aiNoteRegex.test(result)) {
            result = result.replace(aiNoteRegex, `- AI Note:\n${clearedAiNote}\n--- END`);
        } else {
            result += `\n- AI Note:\n${clearedAiNote}\n--- END\n`;
        }
    }
    return result;
}

function upsertTranscript({ body, transcript, logFormat }) {
    if (!transcript) return body;

    let result = body;

    if (logFormat === LOG_DETAILS_FORMAT_TYPE.HTML) {
        const formattedTranscript = transcript.replace(/(?:\r\n|\r|\n)/g, '<br>');
        const transcriptRegex = /<div><b>Transcript<\/b><br>(.+?)<\/div>/;
        if (transcriptRegex.test(result)) {
            result = result.replace(transcriptRegex, `<div><b>Transcript</b><br>${formattedTranscript}</div>`);
        } else {
            result += `<div><b>Transcript</b><br>${formattedTranscript}</div><br>`;
        }
    } else if (logFormat === LOG_DETAILS_FORMAT_TYPE.MARKDOWN) {
        // Markdown format: ### Transcript
        const transcriptRegex = /### Transcript\n([\s\S]*?)(?=\n### |\n$|$)/;
        if (transcriptRegex.test(result)) {
            result = result.replace(transcriptRegex, `### Transcript\n${transcript}\n`);
        } else {
            result += `### Transcript\n${transcript}\n`;
        }
    } else {
        const transcriptRegex = /- Transcript:([\s\S]*?)--- END/;
        if (transcriptRegex.test(result)) {
            result = result.replace(transcriptRegex, `- Transcript:\n${transcript}\n--- END`);
        } else {
            result += `\n- Transcript:\n${transcript}\n--- END\n`;
        }
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
    if (logFormat === LOG_DETAILS_FORMAT_TYPE.HTML) {
        legsJourney = legsJourney.replace(/(?:\r\n|\r|\n)/g, '<br>');
        const legsRegex = /<div><b>Call journey<\/b><br>(.+?)<\/div>/;
        if (legsRegex.test(result)) {
            result = result.replace(legsRegex, `<div><b>Call journey</b><br>${legsJourney}</div>`);
        } else {
            result += `<div><b>Call journey</b><br>${legsJourney}</div>`;
        }
    } else if (logFormat === LOG_DETAILS_FORMAT_TYPE.MARKDOWN) {
        const legsRegex = /### Call journey\n([\s\S]*?)(?=\n### |\n$|$)/;
        if (legsRegex.test(result)) {
            result = result.replace(legsRegex, `### Call journey\n${legsJourney}\n`);
        } else {
            result += `### Call journey\n${legsJourney}\n`;
        }
    } else {
        const legsRegex = /- Call journey:([\s\S]*?)--- JOURNEY END/;
        if (legsRegex.test(result)) {
            result = result.replace(legsRegex, `- Call journey:\n${legsJourney}\n--- JOURNEY END`);
        } else {
            result += `- Call journey:\n${legsJourney}\n--- JOURNEY END\n`;
        }
    }

    return result;
}

function upsertRingSenseTranscript({ body, transcript, logFormat }) {
    if (!transcript) return body;

    let result = body;
    const clearedTranscript = transcript.replace(/\n+$/, '');
    if (logFormat === LOG_DETAILS_FORMAT_TYPE.HTML) {
        const formattedTranscript = clearedTranscript.replace(/(?:\r\n|\r|\n)/g, '<br>');
        const transcriptRegex = /<div><b>RingSense transcript<\/b><br>(.+?)<\/div>/;
        if (transcriptRegex.test(result)) {
            result = result.replace(transcriptRegex, `<div><b>RingSense transcript</b><br>${formattedTranscript}</div>`);
        } else {
            result += `<div><b>RingSense transcript</b><br>${formattedTranscript}</div>`;
        }
    } else if (logFormat === LOG_DETAILS_FORMAT_TYPE.MARKDOWN) {
        const transcriptRegex = /### RingSense transcript\n([\s\S]*?)(?=\n### |\n$|$)/;
        if (transcriptRegex.test(result)) {
            result = result.replace(transcriptRegex, `### RingSense transcript\n${clearedTranscript}\n`);
        } else {
            result += `### RingSense transcript\n${clearedTranscript}\n`;
        }
    } else {
        const transcriptRegex = /- RingSense transcript:([\s\S]*?)--- END/;
        if (transcriptRegex.test(result)) {
            result = result.replace(transcriptRegex, `- RingSense transcript:\n${clearedTranscript}\n--- END`);
        } else {
            result += `\n- RingSense transcript:\n${clearedTranscript}\n--- END\n`;
        }
    }
    return result;
}

function upsertRingSenseSummary({ body, summary, logFormat }) {
    if (!summary) return body;

    let result = body;
    // remove new line in last line of summary
    const clearedSummary = summary.replace(/\n+$/, '');
    if (logFormat === LOG_DETAILS_FORMAT_TYPE.HTML) {
        const summaryRegex = /<div><b>RingSense summary<\/b><br>(.+?)<\/div>/;
        const formattedSummary = clearedSummary.replace(/(?:\r\n|\r|\n)/g, '<br>');
        if (summaryRegex.test(result)) {
            result = result.replace(summaryRegex, `<div><b>RingSense summary</b><br>${formattedSummary}</div>`);
        } else {
            result += `<div><b>RingSense summary</b><br>${formattedSummary}</div>`;
        }
    } else if (logFormat === LOG_DETAILS_FORMAT_TYPE.MARKDOWN) {
        const summaryRegex = /### RingSense summary\n([\s\S]*?)(?=\n### |\n$|$)/;
        if (summaryRegex.test(result)) {
            result = result.replace(summaryRegex, `### RingSense summary\n${summary}\n`);
        } else {
            result += `### RingSense summary\n${summary}\n`;
        }
    } else {
        const summaryRegex = /- RingSense summary:([\s\S]*?)--- END/;
        if (summaryRegex.test(result)) {
            result = result.replace(summaryRegex, `- RingSense summary:\n${summary}\n--- END`);
        } else {
            result += `\n- RingSense summary:\n${summary}\n--- END\n`;
        }
    }
    return result;
}

function upsertRingSenseAIScore({ body, score, logFormat }) {
    if (!score) return body;

    let result = body;
    if (logFormat === LOG_DETAILS_FORMAT_TYPE.HTML) {
        const scoreRegex = /(?:<li>)?<b>Call score<\/b>:\s*([^<\n]+)(?:<\/li>|(?=<|$))/i;
        if (scoreRegex.test(result)) {
            result = result.replace(scoreRegex, `<li><b>Call score</b>: ${score}</li>`);
        } else {
            result += `<li><b>Call score</b>: ${score}</li>`;
        }
    } else if (logFormat === LOG_DETAILS_FORMAT_TYPE.MARKDOWN) {
        const scoreRegex = /\*\*Call score\*\*: [^\n]*\n*/;
        if (scoreRegex.test(result)) {
            result = result.replace(scoreRegex, `**Call score**: ${score}\n`);
        } else {
            result += `**Call score**: ${score}\n`;
        }
    } else {
        const scoreRegex = /- Call score:\s*([^<\n]+)(?=\n|$)/i;
        if (scoreRegex.test(result)) {
            result = result.replace(scoreRegex, `- Call score: ${score}`);
        } else {
            result += `- Call score: ${score}\n`;
        }
    }
    return result;
}

function upsertRingSenseBulletedSummary({ body, summary, logFormat }) {
    if (!summary) return body;

    let result = body;
    const clearedSummary = summary.replace(/\n+$/, '');
    if (logFormat === LOG_DETAILS_FORMAT_TYPE.HTML) {
        const summaryRegex = /<div><b>RingSense bulleted summary<\/b><br>(.+?)<\/div>/;
        const formattedSummary = clearedSummary.replace(/(?:\r\n|\r|\n)/g, '<br>');
        if (summaryRegex.test(result)) {
            result = result.replace(summaryRegex, `<div><b>RingSense bulleted summary</b><br>${formattedSummary}</div>`);
        } else {
            result += `<div><b>RingSense bulleted summary</b><br>${formattedSummary}</div>`;
        }
    } else if (logFormat === LOG_DETAILS_FORMAT_TYPE.MARKDOWN) {
        const summaryRegex = /### RingSense bulleted summary\n([\s\S]*?)(?=\n### |\n$|$)/;
        if (summaryRegex.test(result)) {
            result = result.replace(summaryRegex, `### RingSense bulleted summary\n${summary}\n`);
        } else {
            result += `### RingSense bulleted summary\n${summary}\n`;
        }
    } else {
        const summaryRegex = /- RingSense bulleted summary:\s*([^<\n]+)(?=\n|$)/i;
        if (summaryRegex.test(result)) {
            result = result.replace(summaryRegex, `- RingSense bulleted summary:\n${summary}\n--- END`);
        } else {
            result += `\n- RingSense bulleted summary:\n${summary}\n--- END\n`;
        }
    }
    return result;
}

function upsertRingSenseLink({ body, link, logFormat }) {
    if (!link) return body;

    let result = body;
    if (logFormat === LOG_DETAILS_FORMAT_TYPE.HTML) {
		const linkRegex = /(?:<li>)?<b>RingSense recording link<\/b>:\s*(?:<a[^>]*>[^<]*<\/a>|[^<]+)(?:<\/li>|(?=<|$))/i;
        if (linkRegex.test(result)) {
            result = result.replace(linkRegex, `<li><b>RingSense recording link</b>: <a target="_blank" href="${link}">open</a></li>`);
        } else {
            result += `<li><b>RingSense recording link</b>: <a target="_blank" href="${link}">open</a></li>`;
        }
    } else if (logFormat === LOG_DETAILS_FORMAT_TYPE.MARKDOWN) {
        const linkRegex = /\*\*RingSense recording link\*\*:\s*([^<\n]+)(?=\n|$)/i;
        if (linkRegex.test(result)) {
            result = result.replace(linkRegex, `**RingSense recording link**: ${link}\n`);
        } else {
            result += `**RingSense recording link**: ${link}\n`;
        }
    } else {
        const linkRegex = /- RingSense recording link:\s*([^<\n]+)(?=\n|$)/i;
        if (linkRegex.test(result)) {
            result = result.replace(linkRegex, `- RingSense recording link: ${link}`);
        } else {
            result += `- RingSense recording link: ${link}\n`;
        }
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
