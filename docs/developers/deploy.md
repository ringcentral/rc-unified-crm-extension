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

## Heroku Deployment

The generated template doesn't include Heroku scaffolding out of the box (unlike the
`azure-deploy` and `serverless-deploy` folders), since the app already binds to
`process.env.PORT`, deploying to Heroku only needs a `Procfile` and a couple of config
vars — no code changes.

1. Add a `Procfile` to the project root:

   ```
   web: npm run prod
   ```

2. Create the app and set required config vars, including `APP_HOST=0.0.0.0` — Heroku's
   router expects the dyno to bind to all interfaces, not `localhost`, and this is the
   most common cause of a connector failing its health check on first deploy:

   ```bash
   heroku create <app-name>
   heroku config:set APP_HOST=0.0.0.0
   heroku config:set APP_SERVER=https://<app-name>.herokuapp.com
   # ...plus APP_SERVER_SECRET_KEY, DATABASE_URL, and any CRM OAuth variables
   ```

3. Deploy with `git push heroku main`, or connect the repo under the Heroku Dashboard's
   Deploy tab for automatic deploys from GitHub.

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
| `DATABASE_URL` | Sequelize database URL. Use `sqlite:...` for SQLite or `postgres://...` / `postgresql://...` for Postgres. |
| `DATABASE_SSL` | Optional Postgres SSL override. When unset, localhost database hosts use SSL off and other Postgres hosts use SSL on. |
| `DISABLE_SYNC_DB_TABLE` | Set when table sync should be skipped. |
| `DYNAMODB_LOCALHOST` | Local DynamoDB endpoint for local Dynamo-backed models. |
| `DEVELOPER_DYNAMODB_TABLE_PREFIX` | Prefix for Developer Console connector/proxy DynamoDB tables. |
| `DEVELOPER_APP_SERVER_SECRET_KEY` | Secret used to decrypt stored connector secrets. |
| CRM OAuth variables | Connector-specific client IDs, client secrets, token URLs, and redirect URIs used by `getOauthInfo()`. |
| `RINGCENTRAL_SERVER`, `RINGCENTRAL_CLIENT_ID`, `RINGCENTRAL_CLIENT_SECRET` | Required for RingCentral admin OAuth and some reporting flows. |
| `RINGCENTRAL_MCP_CLIENT_ID` | Public RingCentral OAuth client ID used by MCP clients with PKCE. Do not use a client secret for MCP OAuth. |

Keep CRM client secrets and app secrets in environment variables, not in the manifest.

For local Postgres, use a localhost URL so SSL is disabled automatically:

```bash
DATABASE_URL=postgres://app_connect:password@localhost:5432/app_connect
```

For a remote Postgres host, SSL is enabled automatically. Set `DATABASE_SSL=false` only when a non-local database explicitly does not support SSL.

## Automating This Step

Connectors scaffolded with the `appconnect-connector-skills` Claude Code plugin get an
`appconnect-deploy` skill as the last step of a build. It asks where the connector will
be hosted (AWS, Azure, or Heroku), then removes the deploy scaffolding for the paths you
didn't pick — the template ships with both `azure-deploy/` and `serverless-deploy/` by
default — and for Heroku, which isn't in the template, writes the `Procfile`, `app.json`,
and setup instructions described above.

## Deployment Checklist

- Public HTTPS server URL is configured in the Developer Console.
- Server and manifest agree on the platform name.
- Database and DynamoDB dependencies are reachable.
- Required CRM OAuth/API-key environment variables are set.
- `/isAlive` returns `OK`.
- `/implementedInterfaces?platform=<name>` reports expected methods.
- OAuth redirect URIs in the CRM developer app match the values returned by [`getOauthInfo`](interfaces/getOauthInfo.md).

