const moment = require('moment-timezone');
const { LOG_DETAILS_FORMAT_TYPE } = require('./constants');

function composeSharedSMSLog({ logFormat = LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT, conversation, contactName, timezoneOffset }) {
    const conversationDate = moment(conversation?.creationTime);
    if (timezoneOffset) {
        conversationDate.utcOffset(timezoneOffset);
    }

    const subject = composeSubject({
        logFormat,
        contactName,
        date: conversationDate
    });

    const body = composeBody({
        logFormat,
        conversation,
        contactName,
        conversationDate,
        timezoneOffset,
    });

    return { subject, body };
}

function composeSubject({ logFormat, contactName, date }) {
    const formattedDate = date.format('MM/DD/YY');
    const title = `SMS conversation with ${contactName} - ${formattedDate}`;

    switch (logFormat) {
        case LOG_DETAILS_FORMAT_TYPE.HTML:
            return `<b>${title}</b>`;
        case LOG_DETAILS_FORMAT_TYPE.MARKDOWN:
            return `**${title}**`;
        case LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT:
        default:
            return title;
    }
}

function composeBody({
    logFormat,
    conversation,
    contactName,
    conversationDate,
    timezoneOffset
}) {
    // Gather participants from entities
    const participants = gatherParticipants(conversation.entities || []).concat(contactName);

    // Get owner/call queue info
    const ownerInfo = getOwnerInfo(conversation);

    // Count messages and notes
    const { messageCount, noteCount } = countEntities(conversation.entities || []);

    // Process entities into formatted entries
    const formattedEntries = processEntities({
        entities: conversation.entities || [],
        timezoneOffset,
        logFormat,
        contactName
    });

    // Build the body based on format
    switch (logFormat) {
        case LOG_DETAILS_FORMAT_TYPE.HTML:
            return composeHTMLBody({
                conversationDate,
                participants,
                ownerInfo,
                messageCount,
                noteCount,
                formattedEntries
            });
        case LOG_DETAILS_FORMAT_TYPE.MARKDOWN:
            return composeMarkdownBody({
                conversationDate,
                participants,
                ownerInfo,
                messageCount,
                noteCount,
                formattedEntries
            });
        case LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT:
        default:
            return composePlainTextBody({
                conversationDate,
                participants,
                ownerInfo,
                messageCount,
                noteCount,
                formattedEntries
            });
    }
}

function gatherParticipants(entities) {
    const participantSet = new Set();

    // Add from entities
    if (entities) {
        for (const entity of entities) {
            if (entity.author?.name) {
                participantSet.add(entity.author.name);
            }
            if (entity.from?.name) {
                participantSet.add(entity.from.name);
            }
            if (entity.initiator?.name) {
                participantSet.add(entity.initiator.name);
            }
            if (entity.assignee?.name) {
                participantSet.add(entity.assignee.name);
            }
        }
    }
    return Array.from(participantSet);
}

function getOwnerInfo(conversation) {
    if (!conversation.owner) return null;

    const ownerName = conversation.owner.name || '';
    const extensionType = conversation.owner.extensionType;

    // Check if it's a call queue (Department type)
    if (extensionType === 'Department' || ownerName.toLowerCase().includes('queue')) {
        return {
            type: 'callQueue',
            name: ownerName,
            extensionId: conversation.owner.extensionId
        };
    }

    return {
        type: 'user',
        name: ownerName,
        extensionId: conversation.owner.extensionId
    };
}

function countEntities(entities) {
    let messageCount = 0;
    let noteCount = 0;

    for (const entity of entities) {
        if (entity.recordType === 'AliveMessage') {
            messageCount++;
        } else if (entity.recordType === 'NoteHint' || entity.recordType === 'ThreadNoteAddedHint' || entity.recordType === 'ThreadAssignedHint') {
            noteCount++;
        }
    }

    return { messageCount, noteCount };
}

function processEntities({ entities, timezoneOffset, logFormat, contactName }) {
    const processedEntries = [];

    for (const entity of entities) {
        const entry = processEntity({
            entity,
            timezoneOffset,
            logFormat,
            contactName
        });
        if (entry) {
            processedEntries.push(entry);
        }
    }

    // Sort by creation time (newest first for display)
    processedEntries.sort((a, b) => b.creationTime - a.creationTime);

    return processedEntries;
}

function processEntity({ entity, timezoneOffset, logFormat, contactName }) {
    const creationTime = entity.creationTime;
    let momentTime = moment(creationTime);
    if (timezoneOffset) {
        momentTime = momentTime.utcOffset(timezoneOffset);
    }
    const formattedTime = momentTime.format('YYYY-MM-DD hh:mm A');

    switch (entity.recordType) {
        case 'AliveMessage':
            return formatMessage({ entity, contactName, formattedTime, creationTime, logFormat });

        case 'ThreadAssignedHint':
            return formatAssignment({ entity, formattedTime, creationTime, logFormat });

        case 'ThreadResolvedHint':
            return formatResolved({ entity, formattedTime, creationTime, logFormat });

        case 'ThreadReopenedHint':
            return formatReopened({ entity, formattedTime, creationTime, logFormat });

        case 'NoteHint':
        case 'ThreadNoteAddedHint':
            return formatNote({ entity, formattedTime, creationTime, logFormat });

        case 'ThreadCreatedHint':
            // Skip thread created hints - not typically shown in log body
            return null;

        default:
            return null;
    }
}

function formatMessage({ entity, correspondentName, correspondentEntity, formattedTime, creationTime, logFormat }) {
    const authorName = entity.author?.name || entity.from?.name;
    const isInbound = entity.direction === 'Inbound';
    const senderName = isInbound ? correspondentName : authorName;
    const messageText = entity.text || entity.subject || '';

    switch (logFormat) {
        case LOG_DETAILS_FORMAT_TYPE.HTML:
            return {
                type: 'message',
                creationTime,
                content: `<p><b>${escapeHtml(senderName)}</b> said on ${formattedTime}:<br>${escapeHtml(messageText)}</p>`
            };
        case LOG_DETAILS_FORMAT_TYPE.MARKDOWN:
            return {
                type: 'message',
                creationTime,
                content: `**${senderName}** said on ${formattedTime}:\n${messageText}\n`
            };
        case LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT:
        default:
            return {
                type: 'message',
                creationTime,
                content: `${senderName} said on ${formattedTime}:\n${messageText}\n`
            };
    }
}

function formatAssignment({ entity, formattedTime, creationTime, logFormat }) {
    const assigneeName = entity.assignee?.name || 'Unknown';

    switch (logFormat) {
        case LOG_DETAILS_FORMAT_TYPE.HTML:
            return {
                type: 'assignment',
                creationTime,
                content: `<p><i>Conversation assigned to ${escapeHtml(assigneeName)}</i></p>`
            };
        case LOG_DETAILS_FORMAT_TYPE.MARKDOWN:
            return {
                type: 'assignment',
                creationTime,
                content: `*Conversation assigned to ${assigneeName}*\n`
            };
        case LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT:
        default:
            return {
                type: 'assignment',
                creationTime,
                content: `Conversation assigned to ${assigneeName}\n`
            };
    }
}

function formatResolved({ entity, formattedTime, creationTime, logFormat }) {
    const initiatorName = entity.initiator?.name || 'Unknown';

    switch (logFormat) {
        case LOG_DETAILS_FORMAT_TYPE.HTML:
            return {
                type: 'resolved',
                creationTime,
                content: `<p><i>${escapeHtml(initiatorName)} resolved the conversation on ${formattedTime}</i></p>`
            };
        case LOG_DETAILS_FORMAT_TYPE.MARKDOWN:
            return {
                type: 'resolved',
                creationTime,
                content: `*${initiatorName} resolved the conversation on ${formattedTime}*\n`
            };
        case LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT:
        default:
            return {
                type: 'resolved',
                creationTime,
                content: `${initiatorName} resolved the conversation on ${formattedTime}\n`
            };
    }
}

function formatReopened({ entity, formattedTime, creationTime, logFormat }) {
    const initiatorName = entity.initiator?.name || 'Unknown';

    switch (logFormat) {
        case LOG_DETAILS_FORMAT_TYPE.HTML:
            return {
                type: 'reopened',
                creationTime,
                content: `<p><i>${escapeHtml(initiatorName)} reopened the conversation on ${formattedTime}</i></p>`
            };
        case LOG_DETAILS_FORMAT_TYPE.MARKDOWN:
            return {
                type: 'reopened',
                creationTime,
                content: `*${initiatorName} reopened the conversation on ${formattedTime}*\n`
            };
        case LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT:
        default:
            return {
                type: 'reopened',
                creationTime,
                content: `${initiatorName} reopened the conversation on ${formattedTime}\n`
            };
    }
}

function formatNote({ entity, formattedTime, creationTime, logFormat }) {
    const authorName = entity.author?.name || entity.initiator?.name || 'Unknown';
    const noteText = entity.text || entity.body || '';

    switch (logFormat) {
        case LOG_DETAILS_FORMAT_TYPE.HTML:
            return {
                type: 'note',
                creationTime,
                content: `<p><i>${escapeHtml(authorName)} left a note on ${formattedTime}:</i><br>${escapeHtml(noteText)}</p>`
            };
        case LOG_DETAILS_FORMAT_TYPE.MARKDOWN:
            return {
                type: 'note',
                creationTime,
                content: `*${authorName} left a note on ${formattedTime}:*\n${noteText}\n`
            };
        case LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT:
        default:
            return {
                type: 'note',
                creationTime,
                content: `${authorName} left a note on ${formattedTime}:\n${noteText}\n`
            };
    }
}

function composePlainTextBody({ conversationDate, participants, ownerInfo, messageCount, noteCount, formattedEntries }) {
    let body = '';

    // Conversation summary header
    body += 'Conversation summary\n';
    body += `${conversationDate.format('dddd, MMMM DD, YYYY')}\n\n`;

    // Participants
    body += 'Participants\n';
    for (const participant of participants) {
        body += `* ${participant}\n`;
    }
    body += '\n';

    // Owner/Call queue info
    if (ownerInfo) {
        if (ownerInfo.type === 'callQueue') {
            body += `Receiving call queue: ${ownerInfo.name}\n\n`;
        } else {
            body += `Owner: ${ownerInfo.name}\n\n`;
        }
    }

    // Conversation count
    const countParts = [];
    if (messageCount > 0) {
        countParts.push(`${messageCount} message${messageCount !== 1 ? 's' : ''}`);
    }
    if (noteCount > 0) {
        countParts.push(`${noteCount} note${noteCount !== 1 ? 's' : ''}`);
    }
    body += `Conversation (${countParts.join(', ') || '0 messages'})\n`;
    body += 'BEGIN\n';
    body += '------------\n';

    // Formatted entries
    for (const entry of formattedEntries) {
        body += entry.content + '\n';
    }

    body += '------------\n';
    body += 'END';

    return body;
}

function composeHTMLBody({ conversationDate, participants, ownerInfo, messageCount, noteCount, formattedEntries }) {
    let body = '';

    // Conversation summary header
    body += '<div><b>Conversation summary</b><br>';
    body += `${conversationDate.format('dddd, MMMM DD, YYYY')}</div><br>`;

    // Participants
    body += '<div><b>Participants</b><ul>';
    for (const participant of participants) {
        body += `<li>${escapeHtml(participant)}</li>`;
    }
    body += '</ul></div>';

    // Owner/Call queue info
    if (ownerInfo) {
        if (ownerInfo.type === 'callQueue') {
            body += `<div>Receiving call queue: <b>${escapeHtml(ownerInfo.name)}</b>, ext. &lt;extension&gt;</div><br>`;
        } else {
            body += `<div>Owner: <b>${escapeHtml(ownerInfo.name)}</b></div><br>`;
        }
    }

    // Conversation count
    const countParts = [];
    if (messageCount > 0) {
        countParts.push(`${messageCount} message${messageCount !== 1 ? 's' : ''}`);
    }
    if (noteCount > 0) {
        countParts.push(`${noteCount} note${noteCount !== 1 ? 's' : ''}`);
    }
    body += `<div><b>Conversation (${countParts.join(', ') || '0 messages'})</b></div>`;
    body += '<div>BEGIN</div>';
    body += '<hr>';

    // Formatted entries
    for (const entry of formattedEntries) {
        body += entry.content;
    }

    body += '<hr>';
    body += '<div>END</div>';

    return body;
}

function composeMarkdownBody({ conversationDate, participants, ownerInfo, messageCount, noteCount, formattedEntries }) {
    let body = '';

    // Conversation summary header
    body += '## Conversation summary\n';
    body += `${conversationDate.format('dddd, MMMM DD, YYYY')}\n\n`;

    // Participants
    body += '### Participants\n';
    for (const participant of participants) {
        body += `* ${participant}\n`;
    }
    body += '\n';

    // Owner/Call queue info
    if (ownerInfo) {
        if (ownerInfo.type === 'callQueue') {
            body += `Receiving call queue: **${ownerInfo.name}**, ext. \\<extension\\>\n\n`;
        } else {
            body += `Owner: **${ownerInfo.name}**\n\n`;
        }
    }

    // Conversation count
    const countParts = [];
    if (messageCount > 0) {
        countParts.push(`${messageCount} message${messageCount !== 1 ? 's' : ''}`);
    }
    if (noteCount > 0) {
        countParts.push(`${noteCount} note${noteCount !== 1 ? 's' : ''}`);
    }
    body += `### Conversation (${countParts.join(', ') || '0 messages'})\n`;
    body += 'BEGIN\n';
    body += '---\n';

    // Formatted entries
    for (const entry of formattedEntries) {
        body += entry.content + '\n';
    }

    body += '---\n';
    body += 'END';

    return body;
}

function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

module.exports = {
    composeSharedSMSLog,
    gatherParticipants,
    countEntities,
    processEntities,
    escapeHtml
};

