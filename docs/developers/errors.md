# Returning Messages To The Client

Connector interfaces can return `returnMessage` to show user-facing feedback in App Connect.

```js
return {
  logId: 'crm-log-id',
  returnMessage: {
    message: 'Call log added.',
    messageType: 'success',
    ttl: 3000
  }
};
```

## Fields

| Field | Description |
| --- | --- |
| `message` | Text shown to the user. |
| `messageType` | Prefer `success`, `warning`, or `error`. Older code may use `danger`, but new connector code should use `error`. |
| `ttl` | Display duration in milliseconds. |
| `details` | Optional structured detail sections. |

## Details

Use `details` when the user needs specific troubleshooting information:

```js
return {
  returnMessage: {
    message: 'Could not load user information.',
    messageType: 'warning',
    details: [
      {
        title: 'Details',
        items: [
          {
            id: '1',
            type: 'text',
            text: 'Check that the CRM account has API access.'
          }
        ]
      }
    ],
    ttl: 5000
  }
};
```

## When To Return Messages

Return messages for:

- successful auth, logging, or logout confirmations
- recoverable warnings such as no contact found
- permission, licensing, or CRM API failures that a user can act on
- missing managed-auth fields

Throw or let errors bubble when the failure is truly unexpected. Core wraps many API errors with standard messages through its error handler.
