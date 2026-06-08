# Build And Deploy A Connector Server

Deploy the connector server anywhere that can run Node.js and expose HTTPS. The generated template and this repository both use Express plus `@app-connect/core`.

## Local Development

Run the template server locally:

```bash
npm run dev
```

For this repository, run:

```bash
npm run start
```

Use a public HTTPS tunnel during Developer Console testing.

## AWS Serverless Deployment

The repository includes serverless deployment folders such as `serverless-deploy`.

Typical flow:

```bash
cd serverless-deploy
cp sample.env.yml env.yml
cp sample.serverless.yml serverless.yml
```

Edit both files, then build and deploy from the project root:

```bash
npm run build
npm run deploy
```

Test/beta deployment variants are available through scripts such as `build-test`, `deploy-test`, `build-test-beta`, and `deploy-test-beta`.

## Deploying Elsewhere

If you deploy to another platform, build a local artifact:

```bash
npm run build-local
```

Deploy the generated build output according to your hosting provider.

## Environment Variables

Common variables:

| Variable | Description |
| --- | --- |
| `APP_SERVER` | Public base URL for this connector server. |
| `APP_HOST` | Local host bind value for development. |
| `PORT` | Local server port. |
| `APP_SERVER_SECRET_KEY` | Shared secret used by the app server. |
| `DATABASE_URL` | Database URL. Local development commonly uses SQLite. |
| `DISABLE_SYNC_DB_TABLE` | Set when table sync should be skipped. |
| `DYNAMODB_LOCALHOST` | Local DynamoDB endpoint for local Dynamo-backed models. |
| `DEVELOPER_DYNAMODB_TABLE_PREFIX` | Prefix for Developer Console connector/proxy DynamoDB tables. |
| `DEVELOPER_APP_SERVER_SECRET_KEY` | Secret used to decrypt stored connector secrets. |
| CRM OAuth variables | Connector-specific client IDs, client secrets, token URLs, and redirect URIs used by `getOauthInfo()`. |
| `RINGCENTRAL_SERVER`, `RINGCENTRAL_CLIENT_ID`, `RINGCENTRAL_CLIENT_SECRET` | Required for RingCentral admin OAuth and some reporting flows. |

Keep CRM client secrets and app secrets in environment variables, not in the manifest.

## Deployment Checklist

- Public HTTPS server URL is configured in the Developer Console.
- Server and manifest agree on the platform name.
- Database and DynamoDB dependencies are reachable.
- Required CRM OAuth/API-key environment variables are set.
- `/isAlive` returns `OK`.
- `/implementedInterfaces?platform=<name>` reports expected methods.
- OAuth redirect URIs in the CRM developer app match the values returned by [`getOauthInfo`](interfaces/getOauthInfo.md).

