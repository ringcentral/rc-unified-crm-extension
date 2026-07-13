import type {
    ComposeSharedSMSBodyParams,
    ComposeSharedSMSFormattedBodyParams,
    ComposeSharedSMSLogParams,
    FormatSharedSMSEntryParams,
    ProcessSharedSMSEntitiesParams,
    ProcessSharedSMSEntityParams,
    SharedSMSConversation,
    SharedSMSEntity,
    SharedSMSEntityCounts,
    SharedSMSLogContent,
    SharedSMSLogFormat,
    SharedSMSMessage,
    SharedSMSOwnerInfo,
    SharedSMSProcessedEntry
} from '../types';

const moment = require('moment-timezone');
const { LOG_DETAILS_FORMAT_TYPE } = require('./constants');

function composeSharedSMSLog({
    logFormat = LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT,
    conversation,
    contactName,
    timezoneOffset
}: ComposeSharedSMSLogParams): SharedSMSLogContent {
    const conversationCreatedDate = moment(conversation?.creationTime);
    const conversationUpdatedDate = moment(findLatestModifiedTime(conversation.messages));
    if (timezoneOffset) {
        conversationCreatedDate.utcOffset(timezoneOffset);
        conversationUpdatedDate.utcOffset(timezoneOffset);
    }

    const subject = composeSubject({
        logFormat,
        contactName
    });

    const body = composeBody({
        logFormat,
        conversation,
        contactName,
        conversationCreatedDate,
        conversationUpdatedDate,
        timezoneOffset
    });

    return { subject, body };
}

function findLatestModifiedTime(messages: SharedSMSMessage[]): any {
    let result: any = 0;
    for (const message of messages) {
        if (message.lastModifiedTime > result) {
            result = message.lastModifiedTime;
        }
    }

    return result;
}

function composeSubject({
    logFormat,
    contactName
}: {
    logFormat: SharedSMSLogFormat;
    contactName: string;
}): string {
    const title = `SMS conversation with ${contactName}`;

    switch (logFormat) {
        case LOG_DETAILS_FORMAT_TYPE.HTML:
            return title;
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
    conversationCreatedDate,
    conversationUpdatedDate,
    timezoneOffset
}: ComposeSharedSMSBodyParams): string {
    const agents = gatherAgents(conversation.entities || []);
    const ownerInfo = getOwnerInfo(conversation);
    const { messageCount, noteCount } = countEntities(conversation.entities || []);
    const formattedEntries = processEntities({
        entities: conversation.entities || [],
        timezoneOffset,
        logFormat,
        contactName
    });

    switch (logFormat) {
        case LOG_DETAILS_FORMAT_TYPE.HTML:
            return composeHTMLBody({
                conversationCreatedDate,
                conversationUpdatedDate,
                contactName,
                agents,
                ownerInfo,
                messageCount,
                noteCount,
                formattedEntries
            });
        case LOG_DETAILS_FORMAT_TYPE.MARKDOWN:
            return composeMarkdownBody({
                conversationCreatedDate,
                conversationUpdatedDate,
                contactName,
                agents,
                ownerInfo,
                messageCount,
                noteCount,
                formattedEntries
            });
        case LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT:
        default:
            return composePlainTextBody({
                conversationCreatedDate,
                conversationUpdatedDate,
                contactName,
                agents,
                ownerInfo,
                messageCount,
                noteCount,
                formattedEntries
            });
    }
}

function gatherAgents(entities: SharedSMSEntity[]): string[] {
    const participantSet = new Set<string>();

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

function getOwnerInfo(conversation: SharedSMSConversation): SharedSMSOwnerInfo | null {
    if (!conversation.owner) return null;

    const ownerName = conversation.owner.name || '';
    const extensionType = conversation.owner.extensionType;

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

function countEntities(entities: SharedSMSEntity[]): SharedSMSEntityCounts {
    let messageCount = 0;
    let noteCount = 0;

    for (const entity of entities) {
        if (entity.recordType === 'AliveMessage') {
            messageCount++;
        } else if (entity.recordType === 'AliveNote') {
            noteCount++;
        }
    }

    return { messageCount, noteCount };
}

function processEntities({
    entities,
    timezoneOffset,
    logFormat,
    contactName
}: ProcessSharedSMSEntitiesParams): SharedSMSProcessedEntry[] {
    const processedEntries: SharedSMSProcessedEntry[] = [];

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

    processedEntries.sort((a, b) => b.creationTime - a.creationTime);

    return processedEntries;
}

function processEntity({
    entity,
    timezoneOffset,
    logFormat,
    contactName
}: ProcessSharedSMSEntityParams): SharedSMSProcessedEntry | null {
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
        case 'AliveNote':
            return formatNote({ entity, formattedTime, creationTime, logFormat });
        case 'ThreadCreatedHint':
            return null;
        default:
            return null;
    }
}

function formatMessage({
    entity,
    contactName,
    formattedTime,
    creationTime,
    logFormat
}: FormatSharedSMSEntryParams): SharedSMSProcessedEntry {
    const authorName = entity.author?.name || entity.from?.name;
    const isInbound = entity.direction === 'Inbound';
    const senderName = isInbound ? contactName : authorName;
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

function formatAssignment({
    entity,
    formattedTime,
    creationTime,
    logFormat
}: FormatSharedSMSEntryParams): SharedSMSProcessedEntry {
    const assigneeName = entity.assignee?.name || 'Unknown';

    switch (logFormat) {
        case LOG_DETAILS_FORMAT_TYPE.HTML:
            return {
                type: 'assignment',
                creationTime,
                content: `<p><i>Conversation assigned to <b>${escapeHtml(assigneeName)}</b></i></p>`
            };
        case LOG_DETAILS_FORMAT_TYPE.MARKDOWN:
            return {
                type: 'assignment',
                creationTime,
                content: `*Conversation assigned to **${assigneeName}***\n`
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

function formatNote({
    entity,
    formattedTime,
    creationTime,
    logFormat
}: FormatSharedSMSEntryParams): SharedSMSProcessedEntry {
    const authorName = entity.author?.name || entity.initiator?.name || 'Unknown';
    const noteText = entity.text || entity.body || '';

    switch (logFormat) {
        case LOG_DETAILS_FORMAT_TYPE.HTML:
            return {
                type: 'note',
                creationTime,
                content: `<p><b>${escapeHtml(authorName)}</b> left a note on ${formattedTime}:<br>${escapeHtml(noteText)}</p>`
            };
        case LOG_DETAILS_FORMAT_TYPE.MARKDOWN:
            return {
                type: 'note',
                creationTime,
                content: `**${authorName}** left a note on ${formattedTime}:\n${noteText}\n`
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

function composePlainTextBody({
    conversationCreatedDate,
    conversationUpdatedDate,
    contactName,
    agents,
    ownerInfo,
    messageCount,
    noteCount,
    formattedEntries
}: ComposeSharedSMSFormattedBodyParams): string {
    let body = '';

    body += 'Conversation summary\n';
    body += `Started: ${conversationCreatedDate.format('dddd, MMMM DD, YYYY')} at ${conversationCreatedDate.format('hh:mm A')}\n`;
    body += `Ended: ${conversationUpdatedDate ? conversationUpdatedDate.format('dddd, MMMM DD, YYYY') : 'On-going'} at ${conversationUpdatedDate ? conversationUpdatedDate.format('hh:mm A') : 'On-going'}\n`;
    body += `Duration: ${conversationUpdatedDate ? `${conversationUpdatedDate.diff(conversationCreatedDate, 'days')} d ${conversationUpdatedDate.diff(conversationCreatedDate, 'hours')} h` : 'On-going'} \n`;
    body += '\n';
    body += 'Participants\n';
    body += `* ${contactName} (customer)\n`;
    for (const agent of agents) {
        body += `* ${agent}\n`;
    }
    body += '\n';

    if (ownerInfo) {
        if (ownerInfo.type === 'callQueue') {
            body += `Receiving call queue: ${ownerInfo.name}\n\n`;
        } else {
            body += `Owner: ${ownerInfo.name}\n\n`;
        }
    }

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

    for (const entry of formattedEntries) {
        body += entry.content + '\n';
    }

    body += '------------\n';
    body += 'END';

    return body;
}

function composeHTMLBody({
    conversationCreatedDate,
    conversationUpdatedDate,
    contactName,
    agents,
    ownerInfo,
    messageCount,
    noteCount,
    formattedEntries
}: ComposeSharedSMSFormattedBodyParams): string {
    let body = '';

    body += '<div><b>Conversation summary</b><br>';
    body += `Started: ${conversationCreatedDate.format('dddd, MMMM DD, YYYY')} at ${conversationCreatedDate.format('hh:mm A')}<br>`;
    body += `Ended: ${conversationUpdatedDate ? conversationUpdatedDate.format('dddd, MMMM DD, YYYY') : 'On-going'} at ${conversationUpdatedDate ? conversationUpdatedDate.format('hh:mm A') : 'On-going'}<br>`;
    body += `Duration: ${conversationUpdatedDate ? `${conversationUpdatedDate.diff(conversationCreatedDate, 'days')} d ${conversationUpdatedDate.diff(conversationCreatedDate, 'hours')} h` : 'On-going'}<br>`;
    body += '</div><br>';
    body += '<div><b>Participants</b><ul>';
    body += `<li>${escapeHtml(contactName)} (customer)</li>`;
    for (const agent of agents) {
        body += `<li>${escapeHtml(agent)}</li>`;
    }
    body += '</ul></div>';

    if (ownerInfo) {
        if (ownerInfo.type === 'callQueue') {
            body += `<div>Receiving call queue: <b>${escapeHtml(ownerInfo.name)}</b></div><br>`;
        } else {
            body += `<div>Owner: <b>${escapeHtml(ownerInfo.name)}</b></div><br>`;
        }
    }

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

    for (const entry of formattedEntries) {
        body += entry.content;
    }

    body += '<hr>';
    body += '<div>END</div>';

    return body;
}

function composeMarkdownBody({
    conversationCreatedDate,
    conversationUpdatedDate,
    contactName,
    agents,
    ownerInfo,
    messageCount,
    noteCount,
    formattedEntries
}: ComposeSharedSMSFormattedBodyParams): string {
    let body = '';

    body += '## Conversation summary\n';
    body += `Started: ${conversationCreatedDate.format('dddd, MMMM DD, YYYY')} at ${conversationCreatedDate.format('hh:mm A')}\n`;
    body += `Ended: ${conversationUpdatedDate ? conversationUpdatedDate.format('dddd, MMMM DD, YYYY') : 'On-going'} at ${conversationUpdatedDate ? conversationUpdatedDate.format('hh:mm A') : 'On-going'}\n`;
    body += `Duration: ${conversationUpdatedDate ? `${conversationUpdatedDate.diff(conversationCreatedDate, 'days')} d ${conversationUpdatedDate.diff(conversationCreatedDate, 'hours')} h` : 'On-going'} \n`;
    body += '\n';
    body += '### Participants\n';
    body += `* ${contactName} (customer)\n`;
    for (const agent of agents) {
        body += `* ${agent}\n`;
    }
    body += '\n';

    if (ownerInfo) {
        if (ownerInfo.type === 'callQueue') {
            body += `Receiving call queue: **${ownerInfo.name}**\n\n`;
        } else {
            body += `Owner: **${ownerInfo.name}**\n\n`;
        }
    }

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

    for (const entry of formattedEntries) {
        body += entry.content + '\n';
    }

    body += '---\n';
    body += 'END';

    return body;
}

function escapeHtml(text: string | null | undefined): string {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export {
    composeSharedSMSLog,
    gatherAgents as gatherParticipants,
    countEntities,
    processEntities,
    escapeHtml
};
