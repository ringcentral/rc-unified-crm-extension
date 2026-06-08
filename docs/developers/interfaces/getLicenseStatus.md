# getLicenseStatus

Returns connector-specific license or entitlement state for the connected CRM user.

!!! info "Optional interface"
    Implement this when your connector gates functionality by a CRM-side or vendor-side license.

## Signature

```js
async function getLicenseStatus({
  userId,
  platform,
  user
}) {
  return {
    isLicenseValid: true,
    licenseStatus: 'Basic',
    licenseStatusDescription: ''
  };
}
```

## Input

| Field | Description |
| --- | --- |
| `userId` | App Connect user ID. |
| `platform` | Connector platform name. |
| `user` | Connected CRM user record. |

## Return

| Field | Type | Description |
| --- | --- | --- |
| `isLicenseValid` | boolean | Whether the connector should consider the user licensed. |
| `licenseStatus` | string | Short status label, such as `Basic`, `Premium`, or `Invalid`. |
| `licenseStatusDescription` | string | Longer status text. Markdown-style links are supported by the client. |

If the user cannot be found, core returns:

```js
{
  isLicenseValid: false,
  licenseStatus: 'Invalid (User not found)',
  licenseStatusDescription: ''
}
```

## Returning License Errors From Other Interfaces

When a connector operation cannot proceed because of licensing, return a normal `returnMessage` from that interface:

```js
return {
  returnMessage: {
    message: 'License validation failed.',
    messageType: 'error',
    details: [
      {
        title: 'License issue',
        items: [
          {
            id: '1',
            type: 'text',
            text: 'Refresh your license status from user settings.'
          }
        ]
      }
    ],
    ttl: 5000
  }
};
```
