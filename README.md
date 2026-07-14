# RingCentral App Connect for Google Chrome and Microsoft Edge

[![Build Status](https://github.com/ringcentral/rc-unified-crm-extension/workflows/CI%20Pipeline/badge.svg?branch=main)](https://github.com/ringcentral/rc-unified-crm-extension/actions) [![Coverage](https://codecov.io/gh/ringcentral/rc-unified-crm-extension/branch/main/graph/badge.svg)](https://codecov.io/gh/ringcentral/rc-unified-crm-extension?branch=main) [![Latest release](https://img.shields.io/github/v/release/ringcentral/rc-unified-crm-extension)](https://github.com/ringcentral/rc-unified-crm-extension/releases)

## Looking for user documentation?

Access our end user [documentation](https://ringcentral.github.io/rc-unified-crm-extension/) through the project's Github pages.
## Testing

Run the Framework-level Jest suite from `packages/core`. These tests may replace
the connector contract to isolate Core routing, orchestration, and persistence:

```bash
cd packages/core
npm test
```

For focused contract checks during App Connect client/server work, run targeted files, for example:

```bash
npm test -- test/routes/pluginRoutes.test.js test/handlers/plugin.test.js --runInBand
```

Run the App-level E2E suite from the repository root. These tests start the real
server and connector implementations, replacing only external provider APIs at
the HTTP boundary:

```bash
npm run test:e2e
```
