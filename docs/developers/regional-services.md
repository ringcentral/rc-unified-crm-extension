# Regional Services And Manifest Overrides

Some CRMs have separate regional hosts, OAuth endpoints, or API domains. App Connect supports this through setup-time `environment` selection and runtime manifest `override` rules.

## Prefer Environment Selection For Regions

Use `environment.type: selectable` when the user should choose a region:

```json
{
  "environment": {
    "type": "selectable",
    "selections": [
      { "const": "https://app.example.com", "name": "US" },
      { "const": "https://eu.app.example.com", "name": "EU" },
      { "const": "https://au.app.example.com", "name": "AU" }
    ]
  }
}
```

The selected hostname is later available to connector code as `hostname` during auth and `user.hostname` after login.

## Override Rules

Use `override[]` when parts of the manifest must change under specific conditions:

```json
{
  "override": [
    {
      "triggerType": "hostname",
      "triggerValue": "au.app.example.com",
      "overrideObjects": [
        {
          "path": "auth.oauth.authUrl",
          "value": "https://au.app.example.com/oauth/authorize"
        }
      ]
    }
  ]
}
```

Each override object has:

| Field | Description |
| --- | --- |
| `triggerType` | Condition type. Existing manifests use `hostname` and `meta`. |
| `triggerValue` | Value to match for trigger types that require one. |
| `overrideObjects[]` | List of path/value replacements. |
| `overrideObjects[].path` | Dot path under the platform object or top-level manifest depending on trigger behavior. |
| `overrideObjects[].value` | Replacement value. |

Existing bundled connectors also use `triggerType: "meta"` to override deployment metadata such as `serverUrl` and `author`.

## Connector Implementation

The manifest only changes the client-side configuration. Your connector still needs to choose the correct CRM API and token URLs.

Common implementation pattern:

```js
async function getOauthInfo({ hostname, isFromMCP }) {
  if (hostname.startsWith('eu.')) {
    return {
      clientId: process.env.CRM_EU_CLIENT_ID,
      clientSecret: process.env.CRM_EU_CLIENT_SECRET,
      accessTokenUri: process.env.CRM_EU_TOKEN_URI,
      redirectUri: isFromMCP ? process.env.CRM_REDIRECT_URI_MCP : process.env.CRM_REDIRECT_URI
    };
  }

  return {
    clientId: process.env.CRM_CLIENT_ID,
    clientSecret: process.env.CRM_CLIENT_SECRET,
    accessTokenUri: process.env.CRM_TOKEN_URI,
    redirectUri: process.env.CRM_REDIRECT_URI
  };
}
```

## Checklist

- Define selectable or dynamic environment config in the manifest.
- Use overrides only for values that truly differ by host or deployment.
- Keep region-specific client secrets in environment variables or managed OAuth, not in the manifest.
- Save any region data you need in `platformAdditionalInfo` from [`getUserInfo`](interfaces/getUserInfo.md).
- Test auth, contact lookup, and logging in every supported region.
