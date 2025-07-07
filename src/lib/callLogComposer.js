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
 * @param {string} params.format - Format type: 'plainText' or 'html'
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
 * @param {Function} params.getTimezone - Optional timezone getter function
 * @returns {Promise<string>} Composed log body
 */
async function composeCallLog(params) {
    const {
        format = FORMAT_TYPES.PLAIN_TEXT,
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
        getTimezone
    } = params;

    let body = existingBody;
    const userSettings = user.userSettings || {};

    // Determine timezone handling
    let resolvedStartTime = startTime || callLog?.startTime;
    let timezoneOffset = user.timezoneOffset;

    if (getTimezone && resolvedStartTime) {
        try {
            const timezone = await getTimezone();
            resolvedStartTime = moment(resolvedStartTime).tz(timezone);
        } catch (error) {
            console.log('Error getting timezone, using default', error);
            resolvedStartTime = moment(resolvedStartTime);
        }
    } else if (resolvedStartTime) {
        resolvedStartTime = moment(resolvedStartTime);
    }

    // Apply upsert functions based on user settings
    if (note && (userSettings?.addCallLogNote?.value ?? true)) {
        body = upsertCallAgentNote({ body, note, format });
    }

    if (callLog?.sessionId && (userSettings?.addCallSessionId?.value ?? false)) {
        body = upsertCallSessionId({ body, id: callLog.sessionId, format });
    }

    if (subject && (userSettings?.addCallLogSubject?.value ?? true)) {
        body = upsertCallSubject({ body, subject, format });
    }

    if (contactInfo?.phoneNumber && (userSettings?.addCallLogContactNumber?.value ?? false)) {
        body = upsertContactPhoneNumber({
            body,
            phoneNumber: contactInfo.phoneNumber,
            direction: callLog?.direction,
            format
        });
    }

    if (resolvedStartTime && (userSettings?.addCallLogDateTime?.value ?? true)) {
        body = upsertCallDateTime({
            body,
            startTime: resolvedStartTime,
            timezoneOffset,
            format
        });
    }

    if (duration && (userSettings?.addCallLogDuration?.value ?? true)) {
        body = upsertCallDuration({ body, duration, format });
    }

    if (result && (userSettings?.addCallLogResult?.value ?? true)) {
        body = upsertCallResult({ body, result, format });
    }

    if (recordingLink && (userSettings?.addCallLogRecording?.value ?? true)) {
        body = upsertCallRecording({ body, recordingLink, format });
    }

    if (aiNote && (userSettings?.addCallLogAINote?.value ?? true)) {
        body = upsertAiNote({ body, aiNote, format });
    }

    if (transcript && (userSettings?.addCallLogTranscript?.value ?? true)) {
        body = upsertTranscript({ body, transcript, format });
    }

    return body;
}

/**
 * Upsert functions for different log components
 */

function upsertCallAgentNote({ body, note, format }) {
    if (!note) return body;

    if (format === FORMAT_TYPES.HTML) {
        // HTML format doesn't have a specific agent note pattern in the examples
        // It's usually just prepended to the body
        return `${note}\n${body}`;
    } else {
        // Plain text format
        const noteRegex = /- (?:Note|Agent note): ([\s\S]+?)\n/;
        if (noteRegex.test(body)) {
            return body.replace(noteRegex, `- Note: ${note}\n`);
        } else {
            return body + `- Note: ${note}\n`;
        }
    }
}

function upsertCallSessionId({ body, id, format }) {
    if (!id) return body;

    if (format === FORMAT_TYPES.HTML) {
        const idRegex = /<li><b>Session Id<\/b>: (.+?)(?:<li>|<\/ul>)/;
        if (idRegex.test(body)) {
            return body.replace(idRegex, (match, p1) =>
                `<li><b>Session Id</b>: ${id}${p1.endsWith('</ul>') ? '</ul>' : '<li>'}`
            );
        } else {
            return body + `<li><b>Session Id</b>: ${id}<li>`;
        }
    } else {
        const sessionIdRegex = /- Session Id: (.+?)\n/;
        if (sessionIdRegex.test(body)) {
            return body.replace(sessionIdRegex, `- Session Id: ${id}\n`);
        } else {
            return body + `- Session Id: ${id}\n`;
        }
    }
}

function upsertCallSubject({ body, subject, format }) {
    if (!subject) return body;

    if (format === FORMAT_TYPES.HTML) {
        const subjectRegex = /<li><b>Summary<\/b>: (.+?)(?:<li>|<\/ul>)/;
        if (subjectRegex.test(body)) {
            return body.replace(subjectRegex, (match, p1) =>
                `<li><b>Summary</b>: ${subject}${p1.endsWith('</ul>') ? '</ul>' : '<li>'}`
            );
        } else {
            return body + `<li><b>Summary</b>: ${subject}<li>`;
        }
    } else {
        const subjectRegex = /- Summary: (.+?)\n/;
        if (subjectRegex.test(body)) {
            return body.replace(subjectRegex, `- Summary: ${subject}\n`);
        } else {
            return body + `- Summary: ${subject}\n`;
        }
    }
}

function upsertContactPhoneNumber({ body, phoneNumber, direction, format }) {
    if (!phoneNumber) return body;

    const label = direction === 'Outbound' ? 'Recipient' : 'Caller';
    let result = body;

    if (format === FORMAT_TYPES.HTML) {
        const phoneNumberRegex = new RegExp(`<li><b>${label} phone number</b>: (.+?)(?:<li>|</ul>)`);
        if (phoneNumberRegex.test(result)) {
            result = result.replace(phoneNumberRegex, (match, p1) =>
                `<li><b>${label} phone number</b>: ${phoneNumber}${p1.endsWith('</ul>') ? '</ul>' : '<li>'}`
            );
        } else {
            result += `<li><b>${label} phone number</b>: ${phoneNumber}<li>`;
        }
    } else {
        const phoneNumberRegex = /- Contact Number: (.+?)\n/;
        if (phoneNumberRegex.test(result)) {
            result = result.replace(phoneNumberRegex, `- Contact Number: ${phoneNumber}\n`);
        } else {
            result += `- Contact Number: ${phoneNumber}\n`;
        }
    }
    return result;
}

function upsertCallDateTime({ body, startTime, timezoneOffset, format }) {
    if (!startTime) return body;

    let formattedDateTime;
    if (typeof startTime === 'string') {
        formattedDateTime = moment(startTime).format('YYYY-MM-DD hh:mm:ss A');
    } else if (startTime._isAMomentObject) {
        formattedDateTime = startTime.format('YYYY-MM-DD hh:mm:ss A');
    } else {
        formattedDateTime = moment(startTime).utcOffset(Number(timezoneOffset || 0)).format('YYYY-MM-DD hh:mm:ss A');
    }

    let result = body;

    if (format === FORMAT_TYPES.HTML) {
        const dateTimeRegex = /<li><b>Date\/time<\/b>: (.+?)(?:<li>|<\/ul>)/;
        if (dateTimeRegex.test(result)) {
            result = result.replace(dateTimeRegex, (match, p1) =>
                `<li><b>Date/time</b>: ${formattedDateTime}${p1.endsWith('</ul>') ? '</ul>' : '<li>'}`
            );
        } else {
            result += `<li><b>Date/time</b>: ${formattedDateTime}<li>`;
        }
    } else {
        const dateTimeRegex = /- Date\/Time: (.+?)\n/;
        if (dateTimeRegex.test(result)) {
            result = result.replace(dateTimeRegex, `- Date/Time: ${formattedDateTime}\n`);
        } else {
            result += `- Date/Time: ${formattedDateTime}\n`;
        }
    }
    return result;
}

function upsertCallDuration({ body, duration, format }) {
    if (!duration) return body;

    const formattedDuration = secondsToHoursMinutesSeconds(duration);
    let result = body;

    if (format === FORMAT_TYPES.HTML) {
        const durationRegex = /<li><b>Duration<\/b>: (.+?)(?:<li>|<\/ul>)/;
        if (durationRegex.test(result)) {
            result = result.replace(durationRegex, (match, p1) =>
                `<li><b>Duration</b>: ${formattedDuration}${p1.endsWith('</ul>') ? '</ul>' : '<li>'}`
            );
        } else {
            result += `<li><b>Duration</b>: ${formattedDuration}<li>`;
        }
    } else {
        const durationRegex = /- Duration: (.+?)\n/;
        if (durationRegex.test(result)) {
            result = result.replace(durationRegex, `- Duration: ${formattedDuration}\n`);
        } else {
            result += `- Duration: ${formattedDuration}\n`;
        }
    }
    return result;
}

function upsertCallResult({ body, result, format }) {
    if (!result) return body;

    let bodyResult = body;

    if (format === FORMAT_TYPES.HTML) {
        const resultRegex = /<li><b>Result<\/b>: (.+?)(?:<li>|<\/ul>)/;
        if (resultRegex.test(bodyResult)) {
            bodyResult = bodyResult.replace(resultRegex, (match, p1) =>
                `<li><b>Result</b>: ${result}${p1.endsWith('</ul>') ? '</ul>' : '<li>'}`
            );
        } else {
            bodyResult += `<li><b>Result</b>: ${result}<li>`;
        }
    } else {
        const resultRegex = /- Result: (.+?)\n/;
        if (resultRegex.test(bodyResult)) {
            bodyResult = bodyResult.replace(resultRegex, `- Result: ${result}\n`);
        } else {
            bodyResult += `- Result: ${result}\n`;
        }
    }
    return bodyResult;
}

function upsertCallRecording({ body, recordingLink, format }) {
    if (!recordingLink) return body;

    let result = body;

    if (format === FORMAT_TYPES.HTML) {
        const recordingLinkRegex = /<li><b>Call recording link<\/b>: (.+?)(?:<li>|<\/ul>)/;
        if (recordingLink) {
            if (recordingLinkRegex.test(result)) {
                result = result.replace(recordingLinkRegex, (match, p1) =>
                    `<li><b>Call recording link</b>: <a target="_blank" href="${recordingLink}">open</a>${p1.endsWith('</ul>') ? '</ul>' : '<li>'}`
                );
            } else {
                let text = '';
                if (recordingLink.startsWith('http')) {
                    text = `<li><b>Call recording link</b>: <a target="_blank" href="${recordingLink}">open</a><li>`;
                } else {
                    text = '<li><b>Call recording link</b>: (pending...)<li>';
                }
                if (result.indexOf('</ul>') === -1) {
                    result += text;
                } else {
                    result = result.replace('</ul>', `${text}</ul>`);
                }
            }
        }
    } else {
        const recordingLinkRegex = /- Call recording link: (.+?)\n/;
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

function upsertAiNote({ body, aiNote, format }) {
    if (!aiNote) return body;

    const clearedAiNote = aiNote.replace(/\n+$/, '');
    let result = body;

    if (format === FORMAT_TYPES.HTML) {
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

function upsertTranscript({ body, transcript, format }) {
    if (!transcript) return body;

    let result = body;

    if (format === FORMAT_TYPES.HTML) {
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
function getFormatType(platform) {
    const manifest = require('../adapters/manifest.json');
    const platformConfig = manifest.platforms?.[platform];
    return platformConfig?.format || FORMAT_TYPES.PLAIN_TEXT;

    // const htmlPlatforms = ['pipedrive', 'bullhorn', 'redtail'];
    // return htmlPlatforms.includes(platform) ? FORMAT_TYPES.HTML : FORMAT_TYPES.PLAIN_TEXT;
}

/**
 * Create a specialized composition function for specific CRM requirements
 * @param {string} platform - CRM platform name
 * @returns {Function} Customized composition function
 */
function createComposer(platform) {
    const format = getFormatType(platform);

    return async function (params) {
        // Add platform-specific formatting
        if (format === FORMAT_TYPES.HTML && platform === 'pipedrive') {
            // Pipedrive wraps call details in <ul> tags
            const composed = await composeCallLog({ ...params, format });
            if (composed && !composed.includes('<ul>')) {
                return `<b>Call details</b><ul>${composed}</ul>`;
            }
            return composed;
        }

        if (format === FORMAT_TYPES.HTML && platform === 'bullhorn') {
            // Bullhorn also wraps call details in <ul> tags
            const composed = await composeCallLog({ ...params, format });
            if (composed && !composed.includes('<ul>')) {
                return `<b>Call details</b><ul>${composed}</ul>`;
            }
            return composed;
        }

        return composeCallLog({ ...params, format });
    };
}

module.exports = {
    composeCallLog,
    createComposer,
    getFormatType,
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