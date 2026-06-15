# Plugin Template

Go to https://appconnect.labs.ringcentral.com/console to create a new plugin profile and follow the instructions there.

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
