const express = require('express');
const cors = require('cors');
const syncPlugin = require('./plugins/syncPlugin');
const asyncPlugin = require('./plugins/asyncPlugin');
const { generatePluginJwtToken, validateAndRefreshPluginToken } = require('./lib/pluginToken');
const { validateRcIdentity } = require('./lib/ringcentral');
const licenseHandler = require('./handlers/license');
const oauthHandler = require('./handlers/oauth');
// This package is a teaching template for plugin development.
// The route wiring here is intentionally explicit so developers can see
// where sync, async, OAuth, and license hooks fit into their own server.
const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/isAlive', (req, res) => {
  res.send('OK');
});

app.post('/token/sync', validateAndRefreshPluginToken, async (req, res) => {
  try {
    res.status(200).send('OK');
  }
  catch (error) {
    console.error(error);
    res.status(500).send('Token sync failed');
  }
});

app.post('/admin/register', async (req, res) => {
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

app.post('/plugin/sync', validateAndRefreshPluginToken, async (req, res) => {
  try {
    const pluginIdentity = req.pluginAuth;
    const result = syncPlugin.run({ identity: pluginIdentity, data: req.body.data, config: req.body.config });
    res.status(200).send(result);
  } catch (error) {
    console.error(error);
    res.status(500).send('Plugin request failed');
  }
});

app.post('/plugin/async', validateAndRefreshPluginToken, async (req, res) => {
  try {
    const pluginIdentity = req.pluginAuth;
    const result = asyncPlugin.run({ identity: pluginIdentity, data: req.body.data, config: req.body.config });
    res.status(200).send(result);
  } catch (error) {
    console.error(error);
    res.status(500).send('Plugin request failed');
  }
});

// OAuth hooks are optional.
// Uncomment and adapt the examples below if your plugin needs user login.
app.get('/authUrl', async (req, res) => {
  const authUrl = await oauthHandler.getOAuthUrl();
  res.status(200).send({ authUrl });
});

app.get('/checkAuth', async (req, res) => {
  const result = await oauthHandler.checkAuth();
  res.status(200).send(result);
});

app.post('/logout', async (req, res) => {
  const result = await oauthHandler.logout();
  res.status(200).send(result);
});

// License hooks are optional.
app.get('/license', validateAndRefreshPluginToken, async (req, res) => {
  const result = await licenseHandler.getLicenseStatus({ pluginAuth: req.pluginAuth });
  res.status(200).send(result);
});

exports.app = app;
