# Connector Quick Start

This guide creates a local connector server from the App Connect template, registers it in the Developer Console, and verifies that the extension can call the mock connector.

## Prerequisites

- Node.js 20 or newer
- npm or another JavaScript package manager
- RingCentral account for the Developer Console and App Connect extension
- A public tunnel for local testing, such as ngrok or `lite-http-tunnel`

## 1. Create A Connector Profile

Open the [Developer Console](https://appconnect.labs.ringcentral.com/console/) and create a connector.

For a first test, provide:

| Field | Value |
| --- | --- |
| Connector name | Your CRM/platform name. |
| Unique identifier | Enter the short connector identifier. The Console may display a developer namespace before it, such as `ringcentral_labs.`. |
| Connector server URL | A temporary HTTPS URL. You can replace it after starting your local tunnel. |
| CRM URL/environment | Any valid setup value for the connector profile. |
| Auth type | API key is simplest for the template. |

The connector is private by default and visible to your organization.

After creating the connector, open its **Quick setup** section. It shows the **complete Unique Identifier**, including any developer namespace added by the Console. For example, if the field displays the prefix `ringcentral_labs.` and you enter `zendesk`, the identifier used at runtime is `ringcentral_labs.zendesk`, not `zendesk`. The identifier is permanent after creation.

## 2. Scaffold A Connector Server

Run the CLI and follow the prompts:

```bash
npx @app-connect/cli init
```

The CLI asks for:

1. **Connector unique identifier**: paste the complete value from the Developer Console. The CLI writes it into `src/app.ts` as the first argument of `registerConnector()`.
2. **Project directory**: the folder to create. It defaults to the last part of the identifier.

To skip the prompts, pass them as arguments:

```bash
npx @app-connect/cli init my-crm-connector --id ringcentral_labs.zendesk
```

Then enter the project directory:

```bash
cd my-crm-connector
```

The CLI also downloads the template, installs dependencies, and copies `.env.test` to `.env`. Use `--no-install` or `--no-env` to skip those steps.

The generated server includes:

- `src/app.ts`, which registers the connector and creates the core Express app
- `src/connectors/myCRM.ts`, which exports the connector interface functions
- `src/connectors/interfaces/*.ts`, starter implementations backed by mock JSON files
- `.env.test`, a local environment example

Open `src/app.ts` and confirm the registration uses your complete identifier:

```ts
connectorRegistry.registerConnector(
  'ringcentral_labs.zendesk',
  myCRMConnector,
);
```

The first argument to `registerConnector()` MUST exactly match the complete Developer Console identifier, including its namespace. Do not substitute the display name or only the short CRM name. If you ran `init` without an identifier (for example in a non-interactive shell), the CLI leaves the placeholder `myCRM` and you must replace it manually.

If dependencies were not installed automatically:

```bash
npm install
```

## 3. Configure The Environment

Run the following inside the project:

```bash
npx @app-connect/cli env
```

The command creates `.env` from `.env.test` if it does not exist yet, then prompts for:

| Variable | Where to find it |
| --- | --- |
| `APP_SERVER` | The public URL of your server, such as your tunnel URL. The Console Quick setup shows the connector server URL. |
| `APP_SERVER_SECRET_KEY` | The connector secret key in the Console Quick setup. |

To skip the prompts:

```bash
npx @app-connect/cli env --app-server https://xx.ngrok.io --secret-key <your-secret-key>
```

Other values in `.env`, such as your CRM's OAuth client settings, can be edited by hand.

The template uses `AC_DATABASE_URL` for its database connection so it does not collide with a generic `DATABASE_URL` exported by another local project. `DATABASE_URL` remains supported for existing deployments. If both variables are set, App Connect uses `AC_DATABASE_URL` and prints a warning.

## 4. Start The Server And Expose It

Run:

```bash
npm run dev
```

At startup, verify the sanitized database target printed to the console. The default template should report `SQLite: ./db.sqlite`. Credentials and URL query parameters are never included in this diagnostic.

Expose the local server (port `6066` by default) with an HTTPS tunnel and update the Developer Console connector server URL to that tunnel URL. For example:

```bash
ngrok http 6066
```

Use whatever tunnel is available in your environment.

## 5. Test In App Connect

1. Verify the platform lookup against your connector server, using the complete identifier:

   ```bash
   curl "http://localhost:6066/implementedInterfaces?platform=ringcentral_labs.zendesk"
   ```

   The request should return HTTP 200 with the connector's capability map.
2. Install or open the App Connect extension.
3. Sign in with the same RingCentral account.
4. Select your private connector profile.
5. Enter any API key for the template connector.
6. Make or receive a test call.
7. Refresh contact matching, create a contact if needed, and log the call.

The template uses mock JSON files, so the first lookup may not find a contact. After creating a contact and logging a call, the mock data should show the created records.

## 6. Replace The Mock Logic

Update the connector interfaces under `src/connectors/interfaces/` or replace `src/connectors/myCRM.ts` with your own implementation.

Implement at least:

- [`getAuthType`](interfaces/getAuthType.md)
- [`getBasicAuth`](interfaces/getBasicAuth.md) or [`getOauthInfo`](interfaces/getOauthInfo.md)
- [`getUserInfo`](interfaces/getUserInfo.md)
- [`findContact`](interfaces/findContact.md)
- [`createCallLog`](interfaces/createCallLog.md)
- [`updateCallLog`](interfaces/updateCallLog.md)

Then add optional features such as contact creation, message logging, user mapping, dispositions, licensing, or appointments as needed.

## 7. Keep Manifest And Code In Sync

The Developer Console manifest controls what the client shows. The server implementation controls what the backend can actually do.

Before testing a feature, verify both sides:

- The Developer Console's complete Unique Identifier exactly matches the first argument to `connectorRegistry.registerConnector()`.
- Manifest advertises the fields or feature.
- Connector exports the matching interface.
- `/implementedInterfaces?platform=<complete-unique-identifier>` reports the method as implemented.

## Troubleshoot A Platform Lookup Failure

If selecting or connecting the connector appears to do nothing, inspect the browser
network requests. An HTTP 400 response from
`/implementedInterfaces?platform=<complete-unique-identifier>` commonly means that the
client requested the Developer Console identifier but the server registered a different
key.

Compare the two values character for character:

```text
Developer Console Unique Identifier: ringcentral_labs.zendesk
Server registerConnector() key:       ringcentral_labs.zendesk
```

The namespace, punctuation, and letter casing MUST match. Correct the server registration
key, restart the server, and repeat the `curl` verification above. Do not modify the
Developer Console database or create a second connector to repair this mismatch.

