# View Contact And Log Details

App Connect can open the corresponding CRM contact or activity page for matched contacts and logged calls.

![View contact or log details](../img/view-contact-and-log-details.png)

Configure this in the platform manifest:

| Field | Description |
| --- | --- |
| `canOpenLogPage` | When true, logged activities open `logPageUrl`. When false, they open `contactPageUrl`. |
| `contactPageUrl` | Contact URL template. Supports `{hostname}`, `{contactId}`, and `{contactType}`. |
| `logPageUrl` | Activity/log URL template. Supports `{hostname}`, `{logId}`, `{contactId}`, and `{contactType}` where available. |

Example:

```json
{
  "canOpenLogPage": true,
  "contactPageUrl": "https://{hostname}/contacts/{contactId}",
  "logPageUrl": "https://{hostname}/activities/{logId}"
}
```

Values come from connector responses:

- `contactId` and `contactType` come from contact lookup or log submission data.
- `logId` comes from `createCallLog` or `createMessageLog`.
- `hostname` comes from the connected user record.

