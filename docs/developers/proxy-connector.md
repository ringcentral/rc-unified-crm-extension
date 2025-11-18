# Proxy mode (new)

<!-- md:version 2.0 -->

App Connect offers two powerful modes for building connectors: **App Connect Framework Mode** and **Proxy Mode**. This guide details both approaches, with a deep dive into the configuration-based Proxy Mode, to help you select the best method for your project.

### Choosing Your Connector Mode

The right mode depends on your need for control versus speed.

| Feature | App Connect Framework Mode | Proxy Mode |
| :--- | :--- | :--- |
| **Primary Benefit** | **Full Control & Deep Customization:** You control the server, the code, and where the data is stored. | **Speed & Simplicity:** Leverage your existing APIs for a faster, low-code setup without managing a new server. |
| **Ideal Use Case** | Building a new connector from scratch, especially for complex integrations requiring custom logic and data handling. | Integrating with a system that already has a robust and well-defined API. |
| **Development Effort** | **Higher:** Requires building, deploying, and maintaining a Node.js server application. | **Lower:** Primarily involves configuration within the developer portal. Minimal to no coding is required for simple APIs. |
| **Hosting** | Self-hosted on your own infrastructure. | No self-hosting required; requests are proxied through App Connect's official server. |
| **Data Storage** | You manage your own database, giving you full ownership and control of user credentials and data. | User credentials and data are stored and managed by the App Connect official server. |
| **Required Skills** | Proficiency in Node.js and server management. | Familiarity with API concepts and the ability to configure API requests and responses. |

-----

### Proxy Mode for Existing APIs

This is the recommended mode for developers who have existing APIs and want the fastest, simplest way to create a connector. It allows you to integrate a CRM using a declarative JSON configuration without writing a bespoke server. The connection is proxied through App Connect's official server.

#### When to Use Proxy Mode

Choose this mode if:

  * You have an existing, well-documented API for your service.
  * You want to map a REST API to App Connect quickly.
  * You prefer a low-code or no-code solution and want to avoid server maintenance.
  * You want to maintain connector behavior by editing JSON rather than server code.

#### How It Works

1.  You set up a **manifest** in the [developer portal](https://appconnect.labs.ringcentral.com/console), select "Proxy to existing APIs" in connector server mode
2.  You define a **proxy configuration** (a JSON object) that tells the App Connect server how to interact with your API. This includes auth methods, request structures, and response parsing.
3.  When a user performs an action (like `findContact`), the runtime loads your configuration, builds the HTTP request, sends it to your API, and maps the response back to App Connect.

#### Proxy Scenarios

Depending on your API's structure, you can use one of three proxy patterns:

  * **Scenario A: Direct Proxy to CRM APIs**
    This is a no-code solution for CRMs with simple, standard APIs.

      * **Data Flow:** `User -> App Connect Chrome Extension -> App Connect Official Server -> CRM`.
      * **Auth:** The user's API key or auth code is sent to and stored on the App Connect official server.

  * **Scenario B: Hybrid Proxy with a Custom Endpoint**
    Use this if your CRM requires complex logic (e.g., multiple API calls to log one call). You create a special endpoint to handle this logic.

      * **Data Flow:** Simple requests go directly to the CRM, while complex ones are routed through your endpoint.
          * `User -> App Connect Chrome Extension -> App Connect Official Server -> CRM` (for simple ops)
          * `User -> App Connect Chrome Extension -> App Connect Official Server -> Special Third-Party Endpoint -> CRM` (for complex ops)
      * **Auth:** The App Connect server stores the user's CRM token and passes it to your special endpoint when needed.

  * **Scenario C: Proxy to a Third-Party Platform**
    This is for when you already have a complete platform that manages CRM connections and user auth.

      * **Data Flow:** All requests are proxied through your platform.
      * **Auth:** The user authorizes by logging into *your* platform. Your platform's API key is stored on the App Connect server. App Connect calls your platform with that key, and your platform is responsible for using its own stored credentials to call the final CRM.

#### Deployment and Usage

1.  Go to the [Developer Console](https://appconnect.labs.ringcentral.com/console) to create a connector. In server mode, select "Proxy to existing APIs".
2.  Install the beta Chrome extension package.
3.  Log in with the same account and select your connector to test.

-----

### 🛠️ Proxy Configuration Reference

The proxy configuration is a JSON object that defines how the connector talks to your API. You can edit this in the developer portal in either **JSON mode** or **Form mode**.

#### Top-Level Schema

The JSON object has four main properties:

  * `meta`: Connector metadata used by the client (e.g., `name`, `displayName`).
  * `auth`: Defines how to authenticate outbound requests to your API.
  * `requestDefaults`: Default options (like `baseUrl`) applied to all operations.
  * `operations`: A map of operation definitions (e.g., `findContact`, `createCallLog`) that define specific API calls.

#### `auth` (Authentication)

This section defines the authentication strategy.

  * `type`: Can be `apiKey` or `oauth`.
  * `scheme`: The auth scheme (e.g., `Basic`, `Bearer`). If omitted, the raw token is used.
  * `headerName`: The HTTP header to place the credential in (defaults to `Authorization`).
  * `credentialTemplate`: A template string to build the credential. Common variables are `{{apiKey}}` (for `apiKey` auth) or `{{user.accessToken}}` (for `oauth`).
  * `encode`: Can be `base64` (default) or `none`.

#### `requestDefaults`

These options are applied to all operations.

  * `baseUrl`: The base URL for all your API endpoints (e.g., `https://api.example-crm.com/v1`).
  * `timeoutSeconds`: Request timeout (default is 30).
  * `defaultHeaders`: An object of headers applied to every request (e.g., `{"Accept": "application/json"}`).

#### `operations` (General Definition)

This is an object where each key is an operation name (like `getUserInfo`) and the value defines its HTTP request. Each operation can define:

  * `method`: HTTP method (e.g., `GET`, `POST`). Defaults to `GET`.
  * `url`: The URL path for the operation (e.g., `/contacts`), which is appended to the `baseUrl`.
  * `headers`: An object of headers specific to this operation.
  * `query`: An object of query parameters.
  * `body`: An object used as the JSON payload for `POST` or `PUT` requests.
  * `responseMapping`: Defines how to parse the API's JSON response into the format App Connect expects.

-----

### 🔀 Templating and Variables

You can use `{{variable}}` syntax in the `url`, `headers`, `query`, and `body` fields to inject runtime values.

  * If the entire string is a single variable (e.g., `"{{subject}}"`), the value is injected as-is (e.g., a boolean or number).
  * Otherwise, the value is converted to a string.

**Common Variables:**

  * `apiKey`: The API key supplied by the user.
  * `user.hostname`: The CRM hostname from the auth page.
  * `user.platformAdditionalInfo.*`: Values returned from the `getUserInfo` operation.
  * `secretKey`: A connector-level secret from the developer console, used to authenticate requests from App Connect *to* your API.

**Operation-Specific Variables:**

  * **`findContact`**: `phoneNumber`, `parsedPhoneNumber.*`.
  * **`createCallLog`**: `subject`, `startTime`, `endTime`, `contactInfo.id`, `contactInfo.name`, `note`, `additionalSubmission.*`, `callLog.direction`, `callLog.duration`, `composedLogDetails`, `isFromSSCL`.
  * **`createContact`**: `phoneNumber`, `newContactName`, `newContactType`.
  * **`getCallLog`**: `thirdPartyLogId`.
  * **`updateCallLog`**: `thirdPartyLogId`, `recordingLink`, `transcript`, `aiNote`.
  * **`findContactWithName`**: `name`.

-----

### 🗺️ Response Mapping

The `responseMapping` object tells App Connect how to find data in the JSON response from your API. You use "dot-paths" to specify the location of data (e.g., `body.user.id`).

  * **Object Responses (`type: 'object'`)**
    Used for operations that return a single item (like `getUserInfo` or `createContact`).

      * `idPath`: Path to the record's unique ID (e.g., `body.contact.id`).
      * `namePath`: Path to the record's display name.
      * `messagePath`: Path to a success message.

  * **List Responses (`type: 'list'`)**
    Used for operations that return an array of items (like `findContact`).

      * `listPath`: Path to the array in the response (e.g., `body.contacts`).
      * `item`: An object defining the paths for each item *within* the array.
          * `idPath`: Path to the item's ID (e.g., `id`).
          * `namePath`: Path to the item's name (e.g., `name`).
          * `phonePath`, `typePath`, `companyPath`, etc..

-----

### 📖 Operations Reference

This section details the operations you can define.

#### `getUserInfo`

  * **Purpose:** Fetches user/account info after authentication. This is **required**.
  * **Request Variables:**
      * For OAuth: `user.id`, `user.accessToken`.
      * For API Key auth: `apiKey`, `hostname`, `secretKey`, `additionalInfo.*` (if defined in manifest `auth.apiKey.page`).
  * **Response Mapping (Object):**
      * `idPath` (Required): Path to a stable user ID.
      * `namePath` (Required): Path to the user's display name.
      * `messagePath` (Optional): Path to a success or info message.
      * `overridingApiKeyPath` (Optional): Path to an alternative API key/token to use for subsequent requests.
      * `platformAdditionalInfoPaths` (Optional): A map of keys to paths (e.g., `{"userId": "body.user.internal_id"}`). These values are stored and can be used in subsequent requests as `{{user.platformAdditionalInfo.userId}}`.

#### `findContact`

  * **Purpose:** Searches for contacts by phone number.
  * **Request Variables:** `phoneNumber`, `parsedPhoneNumber.*`.
  * **Response Mapping (List):**
      * `listPath` (Required): Path to the array of contacts.
      * `item`: `idPath` (Required), `namePath` (Required), `typePath`, `phonePath`, `titlePath`, `companyPath`, `mostRecentActivityDatePath`, `additionalInfoPath`.

#### `createContact`

  * **Purpose:** Creates a new contact.
  * **Request Variables:** `phoneNumber`, `newContactName`, `newContactType`.
  * **Response Mapping (Object):** `idPath` (Required), `namePath` (Required), `typePath`.

#### `createCallLog`

  * **Purpose:** Creates a call activity log.
  * **Request Variables:**
      * Core: `subject`, `startTime`, `endTime`, `note`, `contactInfo.id`, `contactInfo.name`
      * Call details: `callLog.direction`, `callLog.duration`, `callLog.to.phoneNumber`, `callLog.from.phoneNumber`, `callLog.result`, `callLog.sessionId`
      * AI: `aiNote`, `transcript`
      * RingSense: `ringSenseTranscript`, `ringSenseSummary`, `ringSenseAIScore`, `ringSenseBulletedSummary`, `ringSenseLink`
      * Composition: `composedLogDetails` (when logFormat is not `custom`)
      * Misc: `additionalSubmission.*`, `isFromSSCL`, `user.id`
  * **Response Mapping (Object):** `idPath` (Path to the new activity's ID).

#### `getCallLog`

  * **Purpose:** Retrieves an existing call log.
  * **Request Variables:** `thirdPartyLogId`.
  * **Response Mapping (Object):** `subjectPath` (Required), `notePath` (Required), `fullBodyPath` (Required).

#### `updateCallLog`

  * **Purpose:** Updates an existing call log, often to add a recording link or transcript.
  * **Request Variables:**
      * Identity: `thirdPartyLogId`
      * Recording: `recordingLink`, `recordingDownloadLink`
      * Fields: `subject`, `note`, `startTime`, `duration`, `result`, `legs`
      * AI: `aiNote`, `transcript`
      * RingSense: `ringSenseTranscript`, `ringSenseSummary`, `ringSenseAIScore`, `ringSenseBulletedSummary`, `ringSenseLink`
      * Composition: `composedLogDetails` (when logFormat is not `custom`), `existingCallLogDetails`
      * Misc: `additionalSubmission.*`, `isFromSSCL`
  * **Response Mapping:** No mapping is typically needed.

#### `findContactWithName` (Optional)

  * **Purpose:** Searches for contacts by name. Enabled if `manifest.page.useContactSearch` is true.
  * **Request Variables:** `name`.
  * **Response Mapping (List):** Same as `findContact`.

#### `getUserList` (Optional)

  * **Purpose:** Fetches users for server-side logging user mapping.
  * **Request Variables:** `user.id` (current user).
  * **Response Mapping (List):** `listPath` (Required). Item fields: `idPath` (Required), `namePath` (Required), `emailPath` (Required).

#### `createMessageLog`

  * **Purpose:** Creates a message activity (SMS/MMS/Voicemail/Fax).
  * **Request Variables:**
      * `contactInfo.id`, `contactInfo.name`, `creationTime`
      * `message.*` (e.g., `direction`, `subject`, `from.phoneNumber`)
      * Optional media: `recordingLink` (voicemail), `faxDocLink` / `faxDownloadLink` (fax), `imageLink` / `videoLink` (MMS)
      * `additionalSubmission.*`, `user.id`
  * **Response Mapping (Object):** `idPath` (Path to the new activity's ID).

#### `updateMessageLog`

  * **Purpose:** Updates an existing message activity.
  * **Request Variables:** `thirdPartyLogId`, `message.*` (e.g., `subject`, `direction`, `from.phoneNumber`, `creationTime`), optional `imageLink`, `videoLink`, `additionalSubmission.*`.
  * **Response Mapping (Object):** `idPath` (if the API responds with an ID).

#### `upsertCallDisposition` (Optional)

  * **Purpose:** Upserts call dispositions for an existing call activity.
  * **Request Variables:** `thirdPartyLogId`, `dispositions` (shape is CRM-specific; commonly includes `category`).
  * **Default Example:** `PUT /activities/{{thirdPartyLogId}}` with body `{ "category_id": "{{dispositions.category}}" }`.

#### `getLicenseStatus` (Optional)

  * **Purpose:** Validates license availability/status for a user and platform.
  * **Request Variables:** `user.id`, `platform`.
  * **Response Mapping (Object):**
      * `isLicenseValidPath` (Required)
      * `licenseStatusPath` (Required)
      * `licenseStatusDescriptionPath` (Required)

#### `unAuthorize` (Optional)

  * **Purpose:** Unauthorizes the user from your CRM/platform (server-side revoke/cleanup).
  * **Request Variables:** `user.id`, `user.accessToken`.

-----

### 📝 Full Configuration Example

Here is an illustrative proxy configuration showing several operations.

```json
{
  "meta": {
    "name": "my-proxy-crm",
    "displayName": "My Proxy CRM",
    "logFormat": "text/plain"
  },
  "auth": {
    "type": "apiKey",
    "scheme": "Basic",
    "credentialTemplate": "{{apiKey}}",
    "encode": "base64",
    "headerName": "Authorization"
  },
  "requestDefaults": {
    "baseUrl": "https://api.example-crm.com/v1",
    "timeoutSeconds": 30,
    "defaultHeaders": {
      "Accept": "application/json",
      "X-Secret-Key": "{{secretKey}}"
    }
  },
  "operations": {
    "getUserInfo": {
      "method": "GET",
      "url": "/authentication",
      "responseMapping": {
        "type": "object",
        "idPath": "body.user.username",
        "namePath": "body.user.username",
        "messagePath": "body.message",
        "platformAdditionalInfoPaths": {
          "userResponse": "body.user"
        }
      }
    },
    "findContact": {
      "method": "GET",
      "url": "/contacts",
      "query": { "phone": "{{phoneNumber}}" },
      "responseMapping": {
        "type": "list",
        "listPath": "body.contacts",
        "item": {
          "idPath": "id",
          "namePath": "name",
          "typePath": "",
          "phonePath": "",
          "additionalInfoPath": ""
        }
      }
    },
    "createContact": {
      "method": "POST",
      "url": "/contacts",
      "headers": { "Content-Type": "application/json" },
      "body": {
        "name": "{{newContactName}}",
        "type": "{{newContactType}}",
        "phone": "{{phoneNumber}}"
      },
      "responseMapping": {
        "type": "object",
        "idPath": "body.id",
        "namePath": "body.name",
        "typePath": "body.type"
      }
    },
    "createCallLog": {
      "method": "POST",
      "url": "/activities",
      "headers": { "Content-Type": "application/json" },
      "body": {
        "subject": "{{subject}}",
        "description": "{{composedLogDetails}}",
        "start_date": "{{startTime}}",
        "end_date": "{{endTime}}",
        "activity_code_id": 3,
        "repeats": "never",
        "linked_contacts": [
          { "contact_id": "{{contactInfo.id}}" }
        ]
      },
      "responseMapping": {
        "type": "object",
        "idPath": "body.activity.id"
      }
    },
    "updateCallLog": {
      "method": "PUT",
      "url": "/activities/{{thirdPartyLogId}}",
      "headers": { "Content-Type": "application/json" },
      "body": {
        "subject": "{{subject}}",
        "description": "{{composedLogDetails}}",
        "start_date": "{{startTime}}",
        "end_date": "{{endTime}}"
      }
    },
    "getCallLog": {
      "method": "GET",
      "url": "/activities/{{thirdPartyLogId}}",
      "headers": {
        "include": "linked_contacts"
      },
      "responseMapping": {
        "type": "object",
        "subjectPath": "body.activity.subject",
        "notePath": "body.activity.note",
        "fullBodyPath": "body.activity.description"
      }
    },
    "createMessageLog": {
      "method": "POST",
      "url": "/activities",
      "headers": { "Content-Type": "application/json" },
      "body": {
        "subject": "Message with {{contactInfo.name}}",
        "description": "Subject: {{message.subject}}\nDirection: {{message.direction}}\n phoneNumber: {{message.from.phoneNumber}}\nRecording link: {{recordingLink}}\n",
        "start_date": "{{creationTime}}",
        "end_date": "{{creationTime}}",
        "activity_code_id": 3,
        "repeats": "never",
        "linked_contacts": [
          { "contact_id": "{{contactInfo.id}}" }
        ]
      },
      "responseMapping": {
        "type": "object",
        "idPath": "body.activity.id"
      }
    },
    "updateMessageLog": {
      "method": "PUT",
      "url": "/activities/{{thirdPartyLogId}}",
      "headers": { "Content-Type": "application/json" },
      "body": {
        "subject": "Message with {{contactInfo.name}}",
        "description": "Subject: {{message.subject}}\nDirection: {{message.direction}}\nRecording link: {{recordingLink}}\n",
        "start_date": "{{creationTime}}",
        "end_date": "{{creationTime}}",
        "activity_code_id": 3,
        "repeats": "never",
        "linked_contacts": [
          { "contact_id": "{{contactInfo.id}}" }
        ]
      }
    },
    "findContactWithName": {
      "method": "GET",
      "url": "/contacts",
      "headers": { "Content-Type": "application/json" },
      "query": { "name": "{{name}}" },
      "responseMapping": {
        "type": "list",
        "listPath": "body.contacts",
        "item": {
          "idPath": "id",
          "namePath": "name",
          "emailPath": "email"
        }
      }
    },
    "getUserList": {
      "method": "GET",
      "url": "/users",
      "headers": { "Content-Type": "application/json" },
      "responseMapping": {
        "type": "list",
        "listPath": "body.users",
        "item": {
          "idPath": "id",
          "namePath": "name",
          "emailPath": "email"
        }
      }
    },
    "getLicenseStatus": {
      "method": "GET",
      "url": "",
      "headers": { "Content-Type": "application/json" },
      "body": {
        "user_id": "{{user.id}}",
        "platform": "{{platform}}"
      },
      "responseMapping": {
        "type": "object",
        "isLicenseValidPath": "body.is_license_valid",
        "licenseStatusPath": "body.license_status",
        "licenseStatusDescriptionPath": "body.license_status_description"
      }
    },
    "upsertCallDisposition": {
      "method": "PUT",
      "url": "/activities/{{thirdPartyLogId}}",
      "headers": { "Content-Type": "application/json" },
      "body": {
        "category_id": "{{dispositions.category}}"
      }
    },
    "unAuthorize": {
      "method": "POST",
      "url": "/unauthorize",
      "headers": { "Content-Type": "application/json" }
    }
  }
}
```
