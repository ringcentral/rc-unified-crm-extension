const express = require('express');
const cors = require('cors');
const syncAllCapsPlugin = require('./plugins/syncAllCapsPlugin');
const asyncAllCapsPlugin = require('./plugins/asyncAllCapsPlugin');
const { generatePluginJwtToken, validateAndRefreshPluginToken } = require('./lib/pluginToken');

const {
  SYNC_PLUGIN_ID = 'sync-all-caps',
  ASYNC_PLUGIN_ID = 'async-all-caps'
} = process.env;

const RC_EXTENSION_ENDPOINT = 'https://platform.ringcentral.com/restapi/v1.0/account/~/extension/~';

async function validateRcIdentity({ rcAccessToken }) {
  if (!rcAccessToken) {
    throw new Error('rcAccessToken is required');
  }
  const rcResponse = await fetch(RC_EXTENSION_ENDPOINT, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${rcAccessToken}`
    }
  });
  if (!rcResponse.ok) {
    throw new Error('Failed to validate rcAccessToken');
  }
  const extensionData = await rcResponse.json();
  return {
    rcAccountId: extensionData?.account?.id?.toString() ?? '',
    rcExtensionId: extensionData?.id?.toString() ?? ''
  };
}

// This package is a teaching template for plugin development.
// The route wiring here is intentionally explicit so developers can see
// where sync, async, OAuth, and license hooks fit into their own server.
const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.send('App Connect Plugin Template Server - OK');
});

app.post('/auth/register', async function pluginRegisterHandler(req, res) {
  try {
    const { rcAccessToken, rcAccountId } = req.body || {};
    const validatedIdentity = await validateRcIdentity({ rcAccessToken });
    if (validatedIdentity.rcAccountId !== rcAccountId?.toString()) {
      res.status(403).send('rcAccountId mismatch');
      return;
    }

    const jwtToken = generatePluginJwtToken({
      rcAccountId: validatedIdentity.rcAccountId,
      pluginId: req.params.pluginId
    });
    res.status(200).send({ jwtToken });
  } catch (error) {
    console.error(error);
    res.status(400).send('Plugin registration failed');
  }
});

app.post('/plugin/all_cap', validateAndRefreshPluginToken, async function pluginHandler(req, res) {
  try {
    const pluginIdentity = req.pluginAuth;
    const result = syncAllCapsPlugin.run({ identity: pluginIdentity, data: req.body.data, config: req.body.config });
    res.status(200).send(result);
  } catch (error) {
    console.error(error);
    res.status(500).send('Plugin request failed');
  }
});

// OAuth hooks are optional.
// Uncomment and adapt the examples below if your plugin needs user login.
//
// app.get('/plugin/authUrl/:pluginId', async function getPluginAuthUrl(req, res) {
//   const authUrl = await somePlugin.getOAuthUrl({ pluginId: req.params.pluginId });
//   res.status(200).send({ authUrl });
// });
//
// app.get('/plugin/checkAuth/:pluginId', async function checkPluginAuth(req, res) {
//   const result = await somePlugin.checkAuth({ pluginId: req.params.pluginId });
//   res.status(200).send(result);
// });
//
// app.post('/plugin/logout/:pluginId', async function logoutPlugin(req, res) {
//   const result = await somePlugin.logout({ pluginId: req.params.pluginId });
//   res.status(200).send(result);
// });

// License hooks are optional.
// Uncomment and adapt this example if your plugin needs entitlement checks.
//
// app.get('/plugin/licenseStatus/:pluginId', async function getLicenseStatus(req, res) {
//   const result = await somePlugin.getLicenseStatus({ pluginId: req.params.pluginId });
//   res.status(200).send(result);
// });

exports.app = app;
