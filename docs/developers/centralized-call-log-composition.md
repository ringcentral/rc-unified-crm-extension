# Centralized Call Log Composition

## Overview

This document describes the implementation of centralized call log composition that extracts log detail composition logic from individual CRM adapters to `log.js`. This solution addresses code duplication, maintenance complexity, and timezone handling across different CRM platforms.

## Problem Statement

### Before (Current State)
- **Duplication**: Every adapter implements identical `upsert*` functions
- **Inconsistency**: Slight variations in implementation across adapters  
- **Maintenance**: Changes require updates in multiple files
- **Complexity**: Each adapter handles timezone and formatting logic
- **Testing**: Difficult to test composition logic in isolation

### Current Flow
```
log.js → adapter → compose log details → CRM API
```

## Solution Architecture

### After (New Approach)
```
log.js → compose log details → adapter → CRM API
```

### Key Components

1. **`src/lib/callLogComposer.js`** - Centralized composition module
2. **Enhanced `src/core/log.js`** - Orchestrates composition before calling adapters
3. **Simplified Adapters** - Focus only on CRM-specific API calls

## Implementation Details

### 1. Centralized Composition Module (`src/lib/callLogComposer.js`)

#### Features
- **Dual Format Support**: Plain text and HTML formatting
- **Timezone Handling**: Supports both standard and platform-specific timezone fetching
- **User Settings Respect**: Honors all user preferences for log components
- **Extensible**: Easy to add new log components

#### Core Function
```javascript
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

    // Compose log details based on user settings
    // Handle timezone resolution
    // Apply format-specific upsert functions
    return composedBody;
}
```

#### Format Types
- **Plain Text**: Used by NetSuite, Insightly, Clio, TestCRM
  ```
  - Note: User's note here
  - Duration: 1 minute 30 seconds
  - Result: Answered
  ```

- **HTML**: Used by Pipedrive, Bullhorn, Redtail
  ```html
  <li><b>Note</b>: User's note here</li>
  <li><b>Duration</b>: 1 minute 30 seconds</li>
  <li><b>Result</b>: Answered</li>
  ```

### 2. Enhanced Log.js

#### Create Call Log Flow
```javascript
// 1. Determine format type for platform
const format = getFormatType(platform);

// 2. Setup platform-specific timezone fetching
let getTimezone = null;
if (platform === 'netsuite') {
    getTimezone = async () => {
        // NetSuite-specific timezone API call
    };
}

// 3. Compose log details centrally
const composedLogDetails = await composeCallLog({
    format,
    callLog,
    contactInfo,
    user,
    note,
    aiNote,
    transcript,
    recordingLink: callLog.recording?.link,
    subject: callLog.customSubject,
    startTime: callLog.startTime,
    duration: callLog.duration,
    result: callLog.result,
    getTimezone
});

// 4. Pass composed details to adapter
const { logId, returnMessage } = await platformModule.createCallLog({
    user, 
    contactInfo, 
    authHeader, 
    callLog, 
    note, 
    additionalSubmission, 
    aiNote, 
    transcript,
    composedLogDetails  // ← New parameter
});
```

#### Update Call Log Flow
```javascript
// 1. Get existing log content
let existingBody = '';
try {
    const getLogResult = await platformModule.getCallLog({ 
        user, 
        callLogId: existingCallLog.thirdPartyLogId, 
        authHeader 
    });
    if (getLogResult.callLogInfo?.note) {
        existingBody = getLogResult.callLogInfo.note;
    }
} catch (error) {
    console.log('Error getting existing log details', error);
}

// 2. Compose updated details
const composedLogDetails = await composeCallLog({
    format,
    existingBody,  // ← Pass existing content for updates
    // ... other parameters
});

// 3. Pass to adapter
await platformModule.updateCallLog({
    // ... existing parameters
    composedLogDetails  // ← New parameter
});
```

### 3. Timezone Handling

#### Standard Approach
Most platforms use `user.timezoneOffset`:
```javascript
moment(startTime).utcOffset(Number(timezoneOffset || 0))
```

#### Platform-Specific Approach (NetSuite)
NetSuite fetches timezone from their API:
```javascript
if (platform === 'netsuite') {
    getTimezone = async () => {
        const timeZoneResponse = await axios.get(
            `https://${hostname}.restlets.api.netsuite.com/.../gettimezone`
        );
        return timeZoneResponse?.data?.userTimezone;
    };
}
```

### 4. Adapter Simplification

#### Before (NetSuite Example)
```javascript
async function createCallLog({ user, contactInfo, authHeader, callLog, note, aiNote, transcript }) {
    // 50+ lines of composition logic
    let comments = '';
    if (user.userSettings?.addCallLogNote?.value) {
        comments = upsertCallAgentNote({ body: comments, note });
    }
    // ... 10+ more upsert function calls
    
    // Complex timezone handling
    try {
        const timeZoneResponse = await axios.get(getTimeZoneUrl);
        callStartTime = moment(callLog.startTime).tz(timezone);
    } catch (error) {
        // fallback logic
    }
    
    // NetSuite API call
    const postBody = {
        message: comments,  // Composed locally
        // ... other fields
    };
}
```

#### After (NetSuite Example)
```javascript
async function createCallLog({ user, contactInfo, authHeader, callLog, composedLogDetails }) {
    // Focus on NetSuite-specific logic
    const postBody = {
        message: composedLogDetails,  // Pre-composed from log.js
        // ... NetSuite-specific fields
    };
    
    // Handle NetSuite-specific business logic
    if (contactInfo.type === 'CONTACT') {
        // Company association logic
    }
    
    // Handle large message body (NetSuite-specific)
    if (composedLogDetails.length > 3900) {
        await attachFileWithPhoneCall(...);
    }
}
```

## Migration Guide

### Step 1: Update Existing Adapters

For each adapter file:

1. **Add new parameter** to function signatures:
   ```javascript
   async function createCallLog({ 
       user, contactInfo, authHeader, callLog, note, 
       additionalSubmission, aiNote, transcript,
       composedLogDetails  // ← Add this
   }) {
   ```

2. **Replace composition logic** with pre-composed details:
   ```javascript
   // Remove all these lines:
   // let body = '';
   // if (user.userSettings?.addCallLogNote?.value) {
   //     body = upsertCallAgentNote({ body, note });
   // }
   // ... more upsert calls
   
   // Replace with:
   const postBody = {
       message: composedLogDetails,  // Use pre-composed
       // ... other CRM-specific fields
   };
   ```

3. **Remove upsert functions** from adapter files
4. **Focus on CRM-specific logic** only

### Step 2: Platform-Specific Considerations

#### NetSuite
- Remove timezone fetching logic from adapter
- Keep business logic (company association, file attachment)
- Handle OneWorld/subsidiary logic

#### Pipedrive/Bullhorn
- Remove `<ul>` wrapper logic (handled centrally)
- Keep deal/lead association logic
- Focus on Pipedrive-specific API requirements

#### Others (Clio, Insightly, etc.)
- Remove all upsert functions
- Keep platform-specific field mappings
- Maintain error handling patterns

### Step 3: Testing

1. **Unit Tests** for composition module:
   ```javascript
   describe('composeCallLog', () => {
       it('should compose plain text format correctly', () => {
           // Test plain text output
       });
       
       it('should compose HTML format correctly', () => {
           // Test HTML output
       });
       
       it('should handle timezone correctly', () => {
           // Test timezone resolution
       });
   });
   ```

2. **Integration Tests** for adapters:
   - Test that adapters receive `composedLogDetails`
   - Verify CRM-specific logic still works
   - Ensure backward compatibility

### Step 4: Gradual Rollout

1. **Phase 1**: Add `composedLogDetails` parameter to all adapters
2. **Phase 2**: Update one adapter at a time
3. **Phase 3**: Remove old upsert functions once all adapters migrated
4. **Phase 4**: Clean up and optimize

## Benefits

### 1. Reduced Code Duplication
- **Before**: 10+ adapters × 10+ upsert functions = 100+ duplicated functions
- **After**: 1 centralized module with all functions

### 2. Improved Maintainability
- **Single Source of Truth**: All formatting logic in one place
- **Easier Updates**: New fields added once, available everywhere
- **Consistent Behavior**: Same formatting across all platforms

### 3. Better Timezone Handling
- **Centralized Logic**: Timezone resolution in log.js
- **Platform Support**: Special handling for platforms like NetSuite
- **Consistent Formatting**: Same date/time format across platforms

### 4. Enhanced Testability
- **Isolated Testing**: Composition logic tested independently
- **Focused Tests**: Adapter tests focus on CRM-specific logic
- **Easier Mocking**: Clear separation of concerns

### 5. Developer Experience
- **Cleaner Code**: Adapters focus on business logic
- **Faster Development**: No need to implement composition in new adapters
- **Less Bugs**: Centralized logic reduces implementation errors

## Performance Considerations

### Minimal Impact
- **No Additional API Calls**: Composition happens in-memory
- **Cached Timezone**: NetSuite timezone fetched once per call
- **Efficient Processing**: String operations are fast

### Optimization Opportunities
- **Async Composition**: Already implemented
- **Conditional Processing**: Only compose needed components
- **Memory Efficiency**: No storing of intermediate results

## Backward Compatibility

### Transition Period
- Adapters receive both old and new parameters
- Gradual migration possible
- No breaking changes during rollout

### Legacy Support
```javascript
// Adapters can handle both approaches
async function createCallLog(params) {
    const { composedLogDetails, note, aiNote, transcript } = params;
    
    if (composedLogDetails) {
        // Use new centralized approach
        return useComposedDetails(composedLogDetails);
    } else {
        // Fall back to old approach
        return composeLocally(note, aiNote, transcript);
    }
}
```

## Future Enhancements

### 1. Advanced Formatting
- Rich text support
- Platform-specific formatting rules
- Custom templates per CRM

### 2. Internationalization
- Multi-language support for log labels
- Locale-specific date/time formatting
- Right-to-left language support

### 3. Analytics Integration
- Track composition performance
- Monitor format preferences
- A/B testing for log formats

### 4. Configuration Management
- Dynamic format selection
- Per-user composition preferences
- Admin-controlled formatting rules

## Conclusion

The centralized call log composition solution significantly improves code maintainability, reduces duplication, and provides a better developer experience while maintaining full backward compatibility. The clean separation of concerns between composition logic and CRM-specific business logic makes the system more testable and easier to extend.

### Implementation Priority
1. **High**: Implement core composition module
2. **High**: Update log.js orchestration
3. **Medium**: Migrate high-usage adapters (NetSuite, Pipedrive)
4. **Medium**: Migrate remaining adapters
5. **Low**: Clean up deprecated code

### Success Metrics
- **Reduced LOC**: 30-40% reduction in adapter code
- **Faster Development**: New adapters implemented 50% faster
- **Fewer Bugs**: Composition-related bugs reduced by 80%
- **Better Tests**: Test coverage increased to 90%+ 