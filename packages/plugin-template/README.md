# Plugin Template

Go to https://appconnect.labs.ringcentral.com/console to create a new plugin profile and follow the instructions there.

## Quick start

```bash
npx @app-connect/cli env   # paste the plugin secret key from the Developer Console
npm run dev                # listens on port 6067 by default
```

Expose port 6067 with a tunnel (for example `ngrok http 6067`) and update the plugin URLs in the Developer Console. See the [plugin docs](https://ringcentral.github.io/rc-unified-crm-extension/developers/plugins/getting-started/).

## Async Plugin Callback

Async plugins receive `asyncTaskId` and `callbackUrl` in the `/plugin/async` request body:

```json
{
  "asyncTaskId": "task-id",
  "callbackUrl": "https://app-connect.example.com/plugin/async-callback/task-id",
  "data": {},
  "config": {}
}
```

Return quickly after accepting the task:

```json
{
  "accepted": true,
  "asyncTaskId": "task-id"
}
```

When background processing finishes, post the result to `callbackUrl`:

```json
{
  "successful": true,
  "message": "Async plugin completed",
  "note": "Async plugin completed"
}
```

For failed work, send `successful: false` and put the failure reason in `message`.

App Connect supplies this callback contract for calls, SMS and fax. The `note` field is appended to CRM Agent notes only for call tasks. Terminal tasks retain a minimal tombstone until the one-week expiry, so repeated callbacks do not append the note again. Completion telemetry is emitted by App Connect Server, not this plugin server. See [Plugin analytics](../../docs/developers/plugin-analytics.md).
