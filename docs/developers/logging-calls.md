# Working with call log records

{! docs/developers/beta_notice.inc !}

One of the most used features across all of RingCentral's CRM integrations is the function of logging a phone call and recording a disposition associated with that phone call in the target CRM. There are three interfaces developers need to implement to support call logging through the entire call logging lifecycle (these interfaces are listed below). But first, let's take a closer look at the call logging sequence inside App Connect's system. 

``` mermaid
graph TD
  A[**Call received** or **call placed**] --> B{Automatically<br>log call?}
  B -->|Yes| OT{One-time log?}
  OT -->|Yes| C1([Call is connected])
  C1 --> C2([Call ends])
  C2 --> C3([Call log data finalized])
  C3 --> C4@{ shape: "lean-r", label: "createCallLog called" }
  C4 --> Z
  OT -->|No| C([Call is connected])
  C --> D@{ shape: "lean-r", label: "createCallLog called" }
  D --> E([Call ends])
  E --> F@{ shape: "lean-r", label: "updateCallLog called" }
  F --> G([Call recording becomes available])
  G --> G2([Call log data finalized])
  G2 --> G3@{ shape: "lean-r", label: "updateCallLog called" }
  G3 --> Z@{ shape: "dbl-circ", label: "Call logged"}
  
  B -->|No| OT1{One-time log?}
  OT1 -->|YES| J1([Call is connected])
  J1 --> J2([Call ends])
  J2 --> J3([Call recording becomes available])
  J3 --> J4([Call log data finalized])
  J4--> J5@{ shape: "lean-r", label: "(optional)manually <br>create call log" }
  J5 --> Z
  OT1 -->|No| J([Call is connected])
  J --> K([Call ends])
  K--> P@{ shape: "lean-r", label: "(optional)manually <br>create call log" }
  P --> L([Call recording becomes available])
  L --> O([Call log data finalized])
  O--> O1@{ shape: "lean-r", label: "(optional)manually <br>create call log" }
  O1 --> Z

  Z --> Z1@{ shape: "lean-r", label: "user disposition call" }

```

## Implement server endpoints

Ultimately, the key to logging calls successfully is in implementing the following interfaces within your connector's `index.js` file. The order in which they are called depends upon the user's settings with regards to [automatic call logging](../users/automatic-logging.md) and [server-side call logging](../users/server-side-logging.md). 

* [`createCallLog`](interfaces/createCallLog.md)
* [`updateCallLog`](interfaces/updateCallLog.md)
* [`getCallLog`](interfaces/getCallLog.md)

### Logging data to structued fields

When implementing these endpoints, it's crucial to map call data to the appropriate structured fields within the CRM. This ensures that information is organized, searchable, and aligns with the CRM's data schema.

**Key Considerations**

* Field Mapping: Identify corresponding fields in the CRM for each piece of call data (e.g., call duration, caller ID, notes).
* Data Validation: Ensure that the data conforms to the CRM's field requirements, such as data types and length constraints.
* Error Handling: Implement robust error handling to manage scenarios where data fails validation or the CRM API returns errors.

### Updating existing call log records

Special attention should be paid by developers to the process of updating an existing call log record, as it is possible that users may have manually edited the call log record within the CRM prior to the `updateCallLog` request being received by the connector. Consider the following scenario:

1. A call is received, is recorded, and later ends. 
2. App Connect sends a `createCallLog` request.
3. The user sees the newly created log file and decides to manually edit the record in the CRM. 
4. RingCentral makes available the recording of the call. 
5. App Connect sends an `updateCallLog` request with the recording. 

In the above scenario, if the developer is not careful, any edits the user may have made in step 3 might be overwritten by the connector. Therefore, it is advisable that the `updateCallLog` operation update the existing call log record using text substitution, rather than re-composing the call log content and replacing the existing call log record. 

!!! tip "Tip: create placeholder text"
    Given that you may receive multiple requests to update a call log record before the call log is finalized, the process of updating a record can be made easier by inserting placeholder text that can later easily by searched for and replaced. For example, when a call log is first created the call's duration may not yet be finalized. So initially you want to insert the following text:
	     
		 * Call duration: 4 min 30 sec (pending)
	 
	 Then in a subsequent call to `updateCallLog` you can do a regex replacement such as:
	 
	     s/\* Call duration: (.* (\(pending\))?)/Call duration: $final_duration/
		 
	 Similarly, for a call recording you can create an initial call log record with the following text:
	 
	     * Call recording: <recording being processed by RingCentral>
		 
	 And then replace the text like so:
	 
	     s/\* Call recording: .*/Call recording: $recording_link/
	 
### Logging call recordings

If a `recordingLink` data element is transmitted to the connector via the `updateCallLog` or `createCallLog` interfaces, then a recording exists for the associated phone call. The value of `recordingLink` is a URL that directs users to the `media.ringcentral.com` service where users can access and/or listen to or watch the associated media. RingCentral will enforce access controls to the associated file so that only those permitted to access the media do so. 

!!! tip "Call recordings take time to process"
    Be aware that it may take some time for RingCentral's servers to process and upload recordings. The delay can range from seconds to minutes, depending on the call's duration and server load. 

#### Downloading the call recording

Some connectors may wish to download the media file to upload it, or archive it elsewhere. To download a media file, use the `callLog.recording.downloadUrl` element to do so. The value of this element contains an access token needed to access the file. Compose an HTTP GET request to the URL to begin downloading the file in `audio/mpeg` or `audio/wav` formats. 

### Logging AI artifacts: call summaries and transcripts

!!! info "A RingSense license is required for a user to automatically log AI data in a remote system"
"
If a user is entitled to log AI artifacts in a CRM, then the AI data will be transmitted to the connector via the `updateCallLog` or `createCallLog` interfaces. Consequently, if these data elements are not present, then it is safe to assume that the user is not permitted to log this data. 

AI artifacts can be found in the following properties:

| Property     | Description                                                                                                                              |
|--------------|------------------------------------------------------------------------------------------------------------------------------------------|
| `aiNote`     | The call recap object. This is a structured data element which may optionally contain action items, a call summary, decisions made, etc. |
| `transcript` | A diarized transcript of the call.                                                                                                       |

Transcripts are time coded to help systems known when words/phrases were uttered. Connector developers may wish to encode transcripts in a more readable form when saving them to a CRM.

## Test your connector

1. Make a call to a known contact
2. Click `+` button near a call record to log the call
3. Check if call log is saved on CRM platform and database (`CHECK.4`)
4. Click `Edit` button near the call record to update the log
5. Check if call log's subject and note are pulled correctly (`CHECK.5`)
6. Edit subject and note, then click `Update`
7. Check if call log is updated on CRM platform (`CHECK.6`)

### Internal call logging

To enable internal call logging for extension numbers under your main number, please add `enableExtensionNumberLoggingSetting` under your manifest platform info. Users would need to turn on `Allow extension number logging` under `Contacts` settings. Then on server end, `isExtension` flag will be passed in as in `src/connectors/testCRM/index.js` - `findContact()`.
