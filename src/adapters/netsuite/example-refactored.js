/**
 * NetSuite Adapter Refactoring Example
 * 
 * This file demonstrates how the NetSuite adapter can be simplified
 * by using the centralized call log composition from log.js
 */

// Example imports that would be needed
const axios = require('axios');
const moment = require('moment-timezone');

// Example upsert functions (these would be removed after refactoring)
function upsertCallAgentNote() { /* ... */ }
function upsertCallSessionId() { /* ... */ }
function upsertCallSubject() { /* ... */ }
function upsertContactPhoneNumber() { /* ... */ }
function upsertCallResult() { /* ... */ }
function upsertCallDateTime() { /* ... */ }
function upsertCallDuration() { /* ... */ }
function upsertCallRecording() { /* ... */ }
function upsertAiNote() { /* ... */ }
function upsertTranscript() { /* ... */ }
function extractIdFromUrl() { /* ... */ }
function attachFileWithPhoneCall() { /* ... */ }

// =====================================================
// BEFORE: Current approach (from existing NetSuite adapter)
// =====================================================

async function createCallLog_BEFORE({ user, contactInfo, authHeader, callLog, note, additionalSubmission, aiNote, transcript }) {
    try {
        const title = callLog.customSubject ?? `${callLog.direction} Call ${callLog.direction === 'Outbound' ? 'to' : 'from'} ${contactInfo.name}`;
        const oneWorldEnabled = user?.platformAdditionalInfo?.oneWorldEnabled;
        const subsidiaryId = user.platformAdditionalInfo?.subsidiaryId;
        let callStartTime = moment(callLog.startTime).toISOString();
        let startTimeSLot = moment(callLog.startTime).format('HH:mm');

        // Complex timezone handling
        try {
            const getTimeZoneUrl = `https://${user.hostname.split(".")[0]}.restlets.api.netsuite.com/app/site/hosting/restlet.nl?script=customscript_gettimezone&deploy=customdeploy_gettimezone`;
            const timeZoneResponse = await axios.get(getTimeZoneUrl, {
                headers: { 'Authorization': authHeader }
            });
            const timeZone = timeZoneResponse?.data?.userTimezone;
            callStartTime = moment(moment(callLog.startTime).toISOString()).tz(timeZone);
            startTimeSLot = callStartTime.format('HH:mm');
        } catch (error) {
            console.log({ message: "Error in getting timezone" });
        }

        const callEndTime = (callLog.duration === 'pending') ? moment(callStartTime) : moment(callStartTime).add(callLog.duration, 'seconds');
        let endTimeSlot = callEndTime.format('HH:mm');

        // Manual composition of log details
        let comments = '';
        if (user.userSettings?.addCallLogNote?.value ?? true) { comments = upsertCallAgentNote({ body: comments, note }); }
        if (user.userSettings?.addCallSessionId?.value ?? false) { comments = upsertCallSessionId({ body: comments, id: callLog.sessionId }); }
        if (user.userSettings?.addCallLogSubject?.value ?? true) { comments = upsertCallSubject({ body: comments, title }); }
        if (user.userSettings?.addCallLogContactNumber?.value ?? false) { comments = upsertContactPhoneNumber({ body: comments, phoneNumber: contactInfo.phoneNumber, direction: callLog.direction }); }
        if (user.userSettings?.addCallLogResult?.value ?? true) { comments = upsertCallResult({ body: comments, result: callLog.result }); }
        if (user.userSettings?.addCallLogDateTime?.value ?? true) { comments = upsertCallDateTime({ body: comments, startTime: callStartTime, timezoneOffset: user.timezoneOffset }); }
        if (user.userSettings?.addCallLogDuration?.value ?? true) { comments = upsertCallDuration({ body: comments, duration: callLog.duration }); }
        if (!!callLog.recording?.link && (user.userSettings?.addCallLogRecording?.value ?? true)) { comments = upsertCallRecording({ body: comments, recordingLink: callLog.recording.link }); }
        if (!!aiNote && (user.userSettings?.addCallLogAINote?.value ?? true)) { comments = upsertAiNote({ body: comments, aiNote }); }
        if (!!transcript && (user.userSettings?.addCallLogTranscript?.value ?? true)) { comments = upsertTranscript({ body: comments, transcript }); }

        // NetSuite-specific API call
        let postBody = {
            title: title,
            phone: contactInfo?.phoneNumber || '',
            priority: "MEDIUM",
            status: "COMPLETE",
            startDate: callStartTime.format('YYYY-MM-DD'),
            startTime: startTimeSLot,
            endTime: endTimeSlot,
            timedEvent: true,
            message: comments,  // Use composed comments
            completedDate: callEndTime.format('YYYY-MM-DD')
        };

        // ... rest of NetSuite-specific logic
        const addLogRes = await axios.post(
            `https://${user.hostname.split(".")[0]}.suitetalk.api.netsuite.com/services/rest/record/v1/phonecall`,
            postBody,
            { headers: { 'Authorization': authHeader } }
        );

        return { logId: extractIdFromUrl(addLogRes.headers.location) };
    } catch (error) {
        // ... error handling
    }
}

// =====================================================
// AFTER: Refactored approach using centralized composition
// =====================================================

async function createCallLog_AFTER({ user, contactInfo, authHeader, callLog, note, additionalSubmission, aiNote, transcript, composedLogDetails }) {
    try {
        const title = callLog.customSubject ?? `${callLog.direction} Call ${callLog.direction === 'Outbound' ? 'to' : 'from'} ${contactInfo.name}`;
        const oneWorldEnabled = user?.platformAdditionalInfo?.oneWorldEnabled;
        const subsidiaryId = user.platformAdditionalInfo?.subsidiaryId;

        // Simplified timezone handling - timezone is already handled in log.js
        let callStartTime = moment(callLog.startTime);
        let startTimeSLot = callStartTime.format('HH:mm');
        const callEndTime = (callLog.duration === 'pending') ? moment(callStartTime) : moment(callStartTime).add(callLog.duration, 'seconds');
        let endTimeSlot = callEndTime.format('HH:mm');

        if (startTimeSLot === endTimeSlot) {
            endTimeSlot = callEndTime.add(1, 'minutes').format('HH:mm');
        }

        // NetSuite-specific API call - use pre-composed log details
        let postBody = {
            title: title,
            phone: contactInfo?.phoneNumber || '',
            priority: "MEDIUM",
            status: "COMPLETE",
            startDate: callStartTime.format('YYYY-MM-DD'),
            startTime: startTimeSLot,
            endTime: endTimeSlot,
            timedEvent: true,
            message: composedLogDetails,  // Use pre-composed details from log.js
            completedDate: callEndTime.format('YYYY-MM-DD')
        };

        // Focus on NetSuite-specific business logic
        if (contactInfo.type?.toUpperCase() === 'CONTACT') {
            const contactInfoRes = await axios.get(`https://${user.hostname.split(".")[0]}.suitetalk.api.netsuite.com/services/rest/record/v1/contact/${contactInfo.id}`, {
                headers: { 'Authorization': authHeader }
            });
            postBody.contact = { id: contactInfo.id };
            postBody.company = { id: contactInfoRes.data?.company?.id };

            // Handle company creation if needed
            if (!contactInfoRes.data?.company?.id) {
                // ... company creation logic
            }
        } else if (contactInfo.type === 'custjob') {
            postBody.company = { id: contactInfo.id };
        }

        const addLogRes = await axios.post(
            `https://${user.hostname.split(".")[0]}.suitetalk.api.netsuite.com/services/rest/record/v1/phonecall`,
            postBody,
            { headers: { 'Authorization': authHeader } }
        );

        const callLogId = extractIdFromUrl(addLogRes.headers.location);

        // Handle large message body (NetSuite-specific logic)
        if (transcript && (composedLogDetails.length + transcript.length) > 3900) {
            try {
                await attachFileWithPhoneCall({ callLogId, transcript, authHeader, user, fileName: title });
            } catch (error) {
                console.log({ message: "Error in attaching file with phone call" });
            }
        }

        return {
            logId: callLogId,
            returnMessage: {
                message: 'Call logged',
                messageType: 'success',
                ttl: 2000
            }
        };
    } catch (error) {
        // ... error handling remains the same
    }
}

// =====================================================
// SUMMARY OF BENEFITS
// =====================================================

/*
BENEFITS OF THE REFACTORED APPROACH:

1. **Reduced Code Duplication**: 
   - No more upsert functions in each adapter
   - Timezone handling is centralized
   - Consistent formatting across all CRMs

2. **Simplified Adapter Logic**:
   - Adapters focus on CRM-specific API calls
   - No need to handle user settings for log composition
   - Clear separation of concerns

3. **Easier Maintenance**:
   - Changes to log format only need to be made in one place
   - New log fields can be added centrally
   - Consistent behavior across all platforms

4. **Better Timezone Handling**:
   - Centralized timezone logic in log.js
   - Platform-specific timezone fetching when needed
   - Consistent date/time formatting

5. **Improved Testability**:
   - Log composition can be tested independently
   - Adapter tests focus on CRM-specific logic
   - Easier to mock and test individual components

MIGRATION STEPS FOR EACH ADAPTER:

1. Remove all upsert functions from adapter files
2. Update createCallLog to accept composedLogDetails parameter
3. Update updateCallLog to accept composedLogDetails parameter  
4. Remove manual log composition logic
5. Focus adapter on CRM-specific API calls and business logic
6. Test to ensure same functionality with simplified code

BACKWARD COMPATIBILITY:
- Adapters can still receive individual parameters
- Gradual migration is possible
- composedLogDetails is an additional parameter
*/

module.exports = {
    createCallLog_BEFORE,
    createCallLog_AFTER
}; 