# createContact

Creates a CRM contact when a user or auto-logging rule chooses to log against an unknown number.

## Signature

```js
async function createContact({
  user,
  authHeader,
  phoneNumber,
  newContactName,
  newContactType,
  additionalSubmission,
  proxyConfig
}) {
  return {
    contactInfo: {
      id: 'contact-id',
      name: newContactName
    },
    returnMessage: {
      message: 'Contact created.',
      messageType: 'success',
      ttl: 2000
    }
  };
}
```

## Input

| Field | Description |
| --- | --- |
| `user` | Connected CRM user. |
| `authHeader` | Prepared CRM auth header. |
| `phoneNumber` | Phone number for the new contact. |
| `newContactName` | Name entered by the user or supplied by the auto-logging placeholder flow. |
| `newContactType` | Selected contact type from manifest `contactTypes[]`, when configured. |
| `additionalSubmission` | Additional form fields submitted with the logging action. |
| `proxyConfig` | Proxy configuration when applicable. |

## Return

| Field | Required | Description |
| --- | --- | --- |
| `contactInfo.id` | Yes | CRM contact ID. |
| `contactInfo.name` | Yes | CRM contact display name. |
| `contactInfo.type` | Optional | CRM contact type. |
| `returnMessage` | Optional | UI feedback. |
| `extraDataTracking` | Optional | Analytics/tracing data. |

If `contactInfo` is null or missing, core treats the creation as unsuccessful.

## Reference

=== "Template"

    ```js
    --8<-- "packages/template/src/connectors/interfaces/createContact.js"
    ```

