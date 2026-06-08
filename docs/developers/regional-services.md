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

Use `override[]` when parts of the manifest must change under specific conditions. The client evaluates each override's trigger condition, and when a match is found it replaces the specified manifest path with the override value.

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

Each override object has these fields:

| Field | Description |
| --- | --- |
| `triggerType` | Condition type. Supported values are `hostname` and `meta`. |
| `triggerValue` | Value to match for trigger types that require one. Ignored for `meta`. |
| `overrideObjects[]` | List of path/value replacements. |
| `overrideObjects[].path` | Dot-notation path to the manifest property to replace. |
| `overrideObjects[].value` | Replacement value. |

Two trigger types are supported:

### `hostname`

Triggers the override when the user's CRM hostname matches `triggerValue`. This is the most common trigger type, used to activate region-specific configuration (different auth URLs, API endpoints, etc.) based on which regional server the user is logged in to.

```json
{
  "triggerType": "hostname",
  "triggerValue": "au.app.clio.com",
  "overrideObjects": [
    {
      "path": "auth.oauth.authUrl",
      "value": "https://au.app.clio.com/oauth/authorize"
    }
  ]
}
```

### `meta`

Triggers the override unconditionally — it always applies regardless of the user's hostname or any other runtime condition. Use `meta` when you need to set connector-level defaults that should apply globally, such as overriding the connector's `serverUrl` or `author` to point to a specific deployment.

```json
{
  "triggerType": "meta",
  "triggerValue": "",
  "overrideObjects": [
    {
      "path": "serverUrl",
      "value": "https://custom-deployment.example.com"
    },
    {
      "path": "author",
      "value": "Acme Corp"
    }
  ]
}
```

The `triggerValue` field is ignored for `meta` overrides and can be set to an empty string.

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
