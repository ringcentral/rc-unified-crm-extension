---
type: contract
title: Plugin User OAuth
description: Optional user-level OAuth for plugins that connect a third-party service.
owner: RingCentral
status: proposed
tags: [app-connect, plugins]
---

# Plugin User OAuth

Use plugin OAuth when the plugin needs a user to connect a third-party service in addition to the CRM connection that App Connect already manages.

Enable **Support OAuth** in the Developer Console plugin form, then configure:

- `authorizationUrl`: a plugin endpoint that builds and returns the third-party authorization URL.
- `authStateUrl`: a plugin endpoint that tells the client whether the user is already connected.
- `logoutUrl`: a plugin endpoint that disconnects the user's third-party account.

## Callback routing

The OAuth provider must redirect back to the App Connect extension redirect URI first, not directly to the plugin server. The client watches the OAuth popup and only detects completion when the popup lands on the extension redirect URI.

The plugin callback endpoint is still where the OAuth code should be exchanged for tokens, but it is reached by the client after the extension receives the browser redirect. Put that plugin callback URL in the OAuth `state` value as `redirectTo`.

```text
OAuth provider
  -> App Connect extension redirect URI
  -> client calls plugin callback from state.redirectTo
  -> plugin exchanges code for tokens and stores them
```

An authorization URL returned by `authorizationUrl` should use the extension redirect URI as `redirect_uri` and include plugin routing data in `state`:

```text
https://provider.example.com/oauth/authorize
  ?client_id=...
  &redirect_uri=https://ringcentral.github.io/ringcentral-embeddable/redirect.html
  &state={"from":"plugin","redirectTo":"https://plugin.example.com/oauth/callback"}
```

The `state` value is shown decoded for readability. URL-encode it when building the real authorization URL.

After the provider redirects to the extension redirect URI, App Connect calls the plugin callback endpoint:

```text
GET https://plugin.example.com/oauth/callback
  ?hashedExtensionId=<hashed-extension-id>
  &callbackUri=<full-extension-callback-url>
```

The plugin callback endpoint should:

1. Parse `callbackUri` to read the provider's authorization `code` and `state`.
2. Validate the `state` value before exchanging the code.
3. Exchange the authorization code with the third-party OAuth provider.
4. Store access and refresh tokens on the plugin server, keyed to the user identity such as `hashedExtensionId`.
5. Return a successful response so the client can show the plugin as connected.

Do not register the plugin server callback URL as the OAuth app redirect URI unless that endpoint immediately redirects the browser back to the App Connect extension redirect URI. If the OAuth popup stays on the plugin server callback URL, the extension cannot detect that OAuth completed.
