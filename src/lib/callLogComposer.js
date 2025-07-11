const moment = require('moment-timezone');
const { secondsToHoursMinutesSeconds } = require('./util');

/**
 * Centralized call log composition module
 * Supports both plain text and HTML formats used across different CRM adapters
 */

// Format types
const FORMAT_TYPES = {
    PLAIN_TEXT: 'plainText',
    HTML: 'html'
};

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
        logFormat = FORMAT_TYPES.PLAIN_TEXT,
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
            logFormat
        });
    }

    if (duration && (userSettings?.addCallLogDuration?.value ?? true)) {
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

    return body;
}

/**
 * Upsert functions for different log components
 */

function upsertCallAgentNote({ body, note, logFormat }) {
    if (!note) return body;
    if (logFormat === FORMAT_TYPES.HTML) {
        // HTML logFormat with proper Agent notes section handling
        const noteRegex = RegExp('<b>Agent notes</b>([\\s\\S]+?)Call details</b>');
        if (noteRegex.test(body)) {
            return body.replace(noteRegex, `<b>Agent notes</b><br>${note}<br><br><b>Call details</b>`);
        }
        else {
            return `<b>Agent notes</b><br>${note}<br><br><b>Call details</b><br>` + body;
        }
    } else {
        // Plain text logFormat - FIXED REGEX for multi-line notes
        const noteRegex = /- (?:Note|Agent notes): ([\s\S]*?)(?=\n- |$)/;
        if (noteRegex.test(body)) {
            return body.replace(noteRegex, `- Note: ${note}`);
        } else {
            return body + `- Note: ${note}\n`;
        }
    }
}

function upsertCallSessionId({ body, id, logFormat }) {
    if (!id) return body;

    if (logFormat === FORMAT_TYPES.HTML) {
        // More flexible regex that handles both <li> wrapped and unwrapped content
        const idRegex = /(?:<li>)?<b>Session Id<\/b>:\s*([^<\n]+)(?:<\/li>|(?=<|$))/i;
        if (idRegex.test(body)) {
            return body.replace(idRegex, `<li><b>Session Id</b>: ${id}</li>`);
        } else {
            return body + `<li><b>Session Id</b>: ${id}</li>`;
        }
    } else {
        // Match Session Id field and any trailing newlines, replace with single newline
        const sessionIdRegex = /- Session Id: [^\n]*\n*/;
        if (sessionIdRegex.test(body)) {
            return body.replace(sessionIdRegex, `- Session Id: ${id}\n`);
        } else {
            return body + `- Session Id: ${id}\n`;
        }
    }
}

function upsertCallSubject({ body, subject, logFormat }) {
    if (!subject) return body;

    if (logFormat === FORMAT_TYPES.HTML) {
        // More flexible regex that handles both <li> wrapped and unwrapped content
        const subjectRegex = /(?:<li>)?<b>Summary<\/b>:\s*([^<\n]+)(?:<\/li>|(?=<|$))/i;
        if (subjectRegex.test(body)) {
            return body.replace(subjectRegex, `<li><b>Summary</b>: ${subject}</li>`);
        } else {
            return body + `<li><b>Summary</b>: ${subject}</li>`;
        }
    } else {
        // Match Summary field and any trailing newlines, replace with single newline
        const subjectRegex = /- Summary: [^\n]*\n*/;
        if (subjectRegex.test(body)) {
            return body.replace(subjectRegex, `- Summary: ${subject}\n`);
        } else {
            return body + `- Summary: ${subject}\n`;
        }
    }
}

function upsertContactPhoneNumber({ body, phoneNumber, direction, logFormat }) {
    if (!phoneNumber) return body;

    const label = direction === 'Outbound' ? 'Recipient' : 'Caller';
    let result = body;

    if (logFormat === FORMAT_TYPES.HTML) {
        // More flexible regex that handles both <li> wrapped and unwrapped content
        const phoneNumberRegex = new RegExp(`(?:<li>)?<b>${label} phone number</b>:\\s*([^<\\n]+)(?:</li>|(?=<|$))`, 'i');
        if (phoneNumberRegex.test(result)) {
            result = result.replace(phoneNumberRegex, `<li><b>${label} phone number</b>: ${phoneNumber}</li>`);
        } else {
            result += `<li><b>${label} phone number</b>: ${phoneNumber}</li>`;
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

function upsertCallDateTime({ body, startTime, timezoneOffset, logFormat }) {
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
    const formattedDateTime = momentTime.format('YYYY-MM-DD hh:mm:ss A');
    let result = body;

    if (logFormat === FORMAT_TYPES.HTML) {
        // More flexible regex that handles both <li> wrapped and unwrapped content
        const dateTimeRegex = /(?:<li>)?<b>Date\/time<\/b>:\s*([^<\n]+)(?:<\/li>|(?=<|$))/i;
        if (dateTimeRegex.test(result)) {
            result = result.replace(dateTimeRegex, `<li><b>Date/time</b>: ${formattedDateTime}</li>`);
        } else {
            result += `<li><b>Date/time</b>: ${formattedDateTime}</li>`;
        }
    } else {
        // Handle duplicated Date/Time entries and match complete date/time values
        const dateTimeRegex = /(?:- Date\/Time: [^-]*(?:-[^-]*)*)+/;
        if (dateTimeRegex.test(result)) {
            result = result.replace(dateTimeRegex, `- Date/Time: ${formattedDateTime}\n`);
        } else {
            result += `- Date/Time: ${formattedDateTime}\n`;
        }
    }
    return result;
}

function upsertCallDuration({ body, duration, logFormat }) {
    if (!duration) return body;

    const formattedDuration = secondsToHoursMinutesSeconds(duration);
    let result = body;

    if (logFormat === FORMAT_TYPES.HTML) {
        // More flexible regex that handles both <li> wrapped and unwrapped content
        const durationRegex = /(?:<li>)?<b>Duration<\/b>:\s*([^<\n]+)(?:<\/li>|(?=<|$))/i;
        if (durationRegex.test(result)) {
            result = result.replace(durationRegex, `<li><b>Duration</b>: ${formattedDuration}</li>`);
        } else {
            result += `<li><b>Duration</b>: ${formattedDuration}</li>`;
        }
    } else {
        // More flexible regex that handles both with and without newlines
        const durationRegex = /- Duration: ([^\n-]+)(?=\n-|\n|$)/;
        if (durationRegex.test(result)) {
            result = result.replace(durationRegex, `- Duration: ${formattedDuration}\n`);
        } else {
            result += `- Duration: ${formattedDuration}\n`;
        }
    }
    return result;
}

function upsertCallResult({ body, result, logFormat }) {
    if (!result) return body;

    let bodyResult = body;

    if (logFormat === FORMAT_TYPES.HTML) {
        // More flexible regex that handles both <li> wrapped and unwrapped content
        const resultRegex = /(?:<li>)?<b>Result<\/b>:\s*([^<\n]+)(?:<\/li>|(?=<|$))/i;
        if (resultRegex.test(bodyResult)) {
            bodyResult = bodyResult.replace(resultRegex, `<li><b>Result</b>: ${result}</li>`);
        } else {
            bodyResult += `<li><b>Result</b>: ${result}</li>`;
        }
    } else {
        // More flexible regex that handles both with and without newlines
        const resultRegex = /- Result: ([^\n-]+)(?=\n-|\n|$)/;
        if (resultRegex.test(bodyResult)) {
            bodyResult = bodyResult.replace(resultRegex, `- Result: ${result}\n`);
        } else {
            bodyResult += `- Result: ${result}\n`;
        }
    }
    return bodyResult;
}

function upsertCallRecording({ body, recordingLink, logFormat }) {
    console.log({ m: "upsertCallRecording", recordingLink, hasBody: !!body, logFormat, bodyLength: body?.length });
    if (!recordingLink) return body;

    let result = body;

    if (logFormat === FORMAT_TYPES.HTML) {
        // More flexible regex that handles both <li> wrapped and unwrapped content
        const recordingLinkRegex = /(?:<li>)?<b>Call recording link<\/b>:\s*([^<\n]+)(?:<\/li>|(?=<|$))/i;
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

    if (logFormat === FORMAT_TYPES.HTML) {
        const formattedAiNote = clearedAiNote.replace(/(?:\r\n|\r|\n)/g, '<br>');
        const aiNoteRegex = /<div><b>AI Note<\/b><br>(.+?)<\/div>/;
        if (aiNoteRegex.test(result)) {
            result = result.replace(aiNoteRegex, `<div><b>AI Note</b><br>${formattedAiNote}</div>`);
        } else {
            result += `<div><b>AI Note</b><br>${formattedAiNote}</div><br>`;
        }
    } else {
        const aiNoteRegex = /- AI Note:([\s\S]*?)--- END/;
        if (aiNoteRegex.test(result)) {
            result = result.replace(aiNoteRegex, `- AI Note:\n${clearedAiNote}\n--- END`);
        } else {
            result += `- AI Note:\n${clearedAiNote}\n--- END\n`;
        }
    }
    return result;
}

function upsertTranscript({ body, transcript, logFormat }) {
    if (!transcript) return body;

    let result = body;

    if (logFormat === FORMAT_TYPES.HTML) {
        const formattedTranscript = transcript.replace(/(?:\r\n|\r|\n)/g, '<br>');
        const transcriptRegex = /<div><b>Transcript<\/b><br>(.+?)<\/div>/;
        if (transcriptRegex.test(result)) {
            result = result.replace(transcriptRegex, `<div><b>Transcript</b><br>${formattedTranscript}</div>`);
        } else {
            result += `<div><b>Transcript</b><br>${formattedTranscript}</div><br>`;
        }
    } else {
        const transcriptRegex = /- Transcript:([\s\S]*?)--- END/;
        if (transcriptRegex.test(result)) {
            result = result.replace(transcriptRegex, `- Transcript:\n${transcript}\n--- END`);
        } else {
            result += `- Transcript:\n${transcript}\n--- END\n`;
        }
    }
    return result;
}

/**
 * Helper function to determine format type for a CRM platform
 * @param {string} platform - CRM platform name
 * @returns {string} Format type
 */
function getLogFormatType(platform) {
    const manifest = require('../adapters/manifest.json');
    const platformConfig = manifest.platforms?.[platform];
    return platformConfig?.logFormat || FORMAT_TYPES.PLAIN_TEXT;

    // const htmlPlatforms = ['pipedrive', 'bullhorn', 'redtail'];
    // return htmlPlatforms.includes(platform) ? FORMAT_TYPES.HTML : FORMAT_TYPES.PLAIN_TEXT;
}

/**
 * Create a specialized composition function for specific CRM requirements
 * @param {string} platform - CRM platform name
 * @returns {Function} Customized composition function
 */
function createComposer(platform) {
    const logFormat = getLogFormatType(platform);

    return async function (params) {
        // Add platform-specific formatting
        if (logFormat === FORMAT_TYPES.HTML && platform === 'pipedrive') {
            // Pipedrive wraps call details in <ul> tags
            const composed = await composeCallLog({ ...params, logFormat });
            if (composed && !composed.includes('<ul>')) {
                return `<b>Call details</b><ul>${composed}</ul>`;
            }
            return composed;
        }

        if (logFormat === FORMAT_TYPES.HTML && platform === 'bullhorn') {
            // Bullhorn also wraps call details in <ul> tags
            const composed = await composeCallLog({ ...params, logFormat });
            if (composed && !composed.includes('<ul>')) {
                return `<b>Call details</b><ul>${composed}</ul>`;
            }
            return composed;
        }

        return composeCallLog({ ...params, logFormat });
    };
}

module.exports = {
    composeCallLog,
    createComposer,
    getLogFormatType,
    FORMAT_TYPES,
    // Export individual upsert functions for backward compatibility
    upsertCallAgentNote,
    upsertCallSessionId,
    upsertCallSubject,
    upsertContactPhoneNumber,
    upsertCallDateTime,
    upsertCallDuration,
    upsertCallResult,
    upsertCallRecording,
    upsertAiNote,
    upsertTranscript
}; 