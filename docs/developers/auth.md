# Authorization

App Connect supports OAuth, admin-managed OAuth, API-key auth, and admin-managed API-key fields. The manifest controls the client experience; connector interfaces supply secrets, validate credentials, and persist user identity.

## Auth Modes

Set the platform auth type in the manifest:

```json
{
  "auth": {
    "type": "oauth"
  }
}
```

or:

```json
{
  "auth": {
    "type": "apiKey"
  }
}
```

Then implement [`getAuthType`](interfaces/getAuthType.md) to return the same mode at runtime.

## OAuth

OAuth connectors need two sets of data:

| Source | Data |
| --- | --- |
| Manifest `auth.oauth` | Client-visible authorize URL, client ID, redirect URI, scopes, and state. |
| [`getOauthInfo`](interfaces/getOauthInfo.md) | Server-side token exchange values, especially `clientSecret` and `accessTokenUri`. |

Example manifest:

```json
{
  "auth": {
    "type": "oauth",
    "oauth": {
      "authUrl": "https://app.example.com/oauth/authorize",
      "clientId": "public-client-id",
      "redirectUri": "https://ringcentral.github.io/ringcentral-embeddable/redirect.html",
      "scope": "scope=contacts.read contacts.write",
      "customState": "platform=myCRM"
    }
  }
}
```

Required interfaces:

- [`getAuthType`](interfaces/getAuthType.md)
- [`getOauthInfo`](interfaces/getOauthInfo.md)
- [`getUserInfo`](interfaces/getUserInfo.md)

Optional OAuth interfaces and hooks:

- `getOverridingOAuthOption({ code })`
- `checkAndRefreshAccessToken(oauthApp, user, tokenLockTimeout)`
- `authValidation({ user })`
- [`refreshUserInfo`](interfaces/refreshUserInfo.md)
- [`unAuthorize`](interfaces/unAuthorize.md)

## Admin-Managed OAuth

Use admin-managed OAuth when each customer must bring their own CRM OAuth app credentials.

The flow is:

1. Developer enables admin-managed OAuth in the Developer Console and writes admin setup instructions.
2. The first admin user submits client ID, client secret, token URL, authorization URL, redirect URI, and hostname as required by the connector.
3. Core stores those encrypted account-level values.
4. Later users in the same RingCentral account connect through the normal OAuth flow without seeing the credentials.
5. On successful callback, pending credentials are promoted to account-managed credentials.

Connector code usually does not need to know whether credentials came from `getOauthInfo()` or managed OAuth. Core resolves managed values before calling `getOauthInfo()`.

## API Key

API-key connectors define a login form in `auth.apiKey.page.content[]`:

```json
{
  "auth": {
    "type": "apiKey",
    "apiKey": {
      "page": {
        "title": "My CRM",
        "warning": "Paste your CRM API key.",
        "content": [
          {
            "const": "apiKey",
            "title": "API key",
            "type": "string",
            "required": true
          },
          {
            "const": "tenantId",
            "title": "Tenant ID",
            "type": "string",
            "required": true
          }
        ]
      }
    }
  }
}
```

Required interfaces:

- [`getAuthType`](interfaces/getAuthType.md)
- [`getBasicAuth`](interfaces/getBasicAuth.md)
- [`getUserInfo`](interfaces/getUserInfo.md)

Core passes the final resolved credential fields to `getUserInfo()` as `additionalInfo`. It also passes `apiKey` as the selected API-key value.

Optional API-key interfaces:

- [`refreshUserInfo`](interfaces/refreshUserInfo.md)

## Admin-Managed API-Key Fields

API-key form fields can be marked as managed:

```json
{
  "const": "tenantId",
  "title": "Tenant ID",
  "type": "string",
  "required": true,
  "managed": true,
  "managedScope": "account",
  "hidden": true
}
```

| Field | Description |
| --- | --- |
| `managed` | Marks the field as admin-managed. |
| `managedScope` | `account` stores one encrypted value per RingCentral account. `user` stores one encrypted value per RingCentral extension. |
| `hidden` | Hides the field from normal users. |

Core resolves managed values before `getUserInfo()` runs. If required managed values are missing, the login route returns a warning with `missingRequiredFieldConsts`. If a managed login fails, the next attempt can fall back to the full manual form.

## Logout

Implement [`unAuthorize`](interfaces/unAuthorize.md) when the CRM has token revocation or when you need custom cleanup. At minimum, clear `user.accessToken` and `user.refreshToken` or destroy the user record.

## Testing

Use the extension against a local or tunneled server and verify:

1. The manifest auth page renders the expected fields.
2. OAuth redirects back and saves a user record.
3. API-key login calls `getBasicAuth()` and `getUserInfo()` with resolved `additionalInfo`.
4. Managed auth fields are filled from admin storage when configured.
5. Logout clears or revokes credentials.

