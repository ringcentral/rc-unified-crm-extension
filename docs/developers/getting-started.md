# Connector Quick Start

This guide creates a local connector server from the App Connect template, registers it in the Developer Console, and verifies that the extension can call the mock connector.

## Prerequisites

- Node.js 16 or newer
- npm or another JavaScript package manager
- RingCentral account for the Developer Console and App Connect extension
- A public tunnel for local testing, such as ngrok or `lite-http-tunnel`

## 1. Create A Connector Profile

Open the [Developer Console](https://appconnect.labs.ringcentral.com/console/) and create a connector.

For a first test, provide:

| Field | Value |
| --- | --- |
| Connector name | Your CRM/platform name. |
| Connector server URL | A temporary HTTPS URL. You can replace it after starting your local tunnel. |
| CRM URL/environment | Any valid setup value for the connector profile. |
| Auth type | API key is simplest for the template. |

The connector is private by default and visible to your organization.

## 2. Scaffold A Connector Server

Use the CLI:

```bash
npx @app-connect/cli init my-crm-connector
cd my-crm-connector
```

The generated server includes:

- `src/app.js`, which registers the connector and creates the core Express app
- `src/connectors/myCRM.js`, which exports the connector interface functions
- `src/connectors/interfaces/*.js`, starter implementations backed by mock JSON files
- `.env.test`, a local environment example

If dependencies were not installed automatically:

```bash
npm install
```

Copy and edit the environment file:

```bash
cp .env.test .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.test .env
```

## 3. Start The Server

Run:

```bash
npm run dev
```

The template server registers `myCRM` with `connectorRegistry.registerConnector('myCRM', myCRMConnector)` and serves the core App Connect routes.

## 4. Expose The Server

Expose the local server with an HTTPS tunnel and update the Developer Console connector server URL to that tunnel URL.

The main repository includes scripts such as:

```bash
npm run tunnel
```

or:

```bash
npm run ngrok
```

Use whatever tunnel is available in your environment.

## 5. Test In App Connect

1. Install or open the App Connect extension.
2. Sign in with the same RingCentral account.
3. Select your private connector profile.
4. Enter any API key for the template connector.
5. Make or receive a test call.
6. Refresh contact matching, create a contact if needed, and log the call.

The template uses mock JSON files, so the first lookup may not find a contact. After creating a contact and logging a call, the mock data should show the created records.

## 6. Replace The Mock Logic

Update the connector interfaces under `src/connectors/interfaces/` or replace `src/connectors/myCRM.js` with your own implementation.

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

- Manifest advertises the fields or feature.
- Connector exports the matching interface.
- `/implementedInterfaces?platform=<name>` reports the method as implemented.

