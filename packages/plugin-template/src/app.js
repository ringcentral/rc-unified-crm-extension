const { createCoreApp } = require('@app-connect/core');
const { sign, verify } = require('jsonwebtoken');
const syncAllCapsPlugin = require('./plugins/syncAllCapsPlugin');
const asyncAllCapsPlugin = require('./plugins/asyncAllCapsPlugin');

const {
  SYNC_PLUGIN_ID = 'sync-all-caps',
  ASYNC_PLUGIN_ID = 'async-all-caps',
  PLUGIN_SERVER_SECRET_KEY,
  APP_SERVER_SECRET_KEY
} = process.env;

const RC_EXTENSION_ENDPOINT = 'https://platform.ringcentral.com/restapi/v1.0/account/~/extension/~';
const JWT_REFRESH_THRESHOLD_SECONDS = 7 * 24 * 60 * 60; // 1 week
const JWT_EXPIRES_IN = '2w';

function getJwtSecret() {
  return PLUGIN_SERVER_SECRET_KEY || APP_SERVER_SECRET_KEY;
}

function generatePluginJwtToken({ rcAccountId, pluginId }) {
  const secret = getJwtSecret();
  if (!secret) {
    throw new Error('PLUGIN_SERVER_SECRET_KEY (or APP_SERVER_SECRET_KEY) is required');
  }
  return sign({
    rcAccountId: rcAccountId?.toString(),
    pluginId
  }, secret, { expiresIn: JWT_EXPIRES_IN });
}

function decodePluginJwtToken(token) {
  const secret = getJwtSecret();
  if (!secret) {
    return null;
  }
  try {
    return verify(token, secret);
  } catch (_e) {
    return null;
  }
}

function extractBearerToken(req) {
  const authHeader = req.headers?.authorization || req.headers?.Authorization;
  if (!authHeader || typeof authHeader !== 'string') {
    return null;
  }
  const [scheme, token] = authHeader.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) {
    return null;
  }
  return token;
}

function validateAndRefreshPluginToken(req, res, next) {
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).send('Bearer token is required');
    return;
  }

  const decodedToken = decodePluginJwtToken(token);
  if (!decodedToken) {
    res.status(401).send('Invalid bearer token');
    return;
  }

  if (decodedToken.pluginId !== req.params.pluginId) {
    res.status(403).send('Token pluginId does not match route pluginId');
    return;
  }

  req.pluginAuth = decodedToken;

  if (typeof decodedToken.exp === 'number') {
    const now = Math.floor(Date.now() / 1000);
    const timeLeft = decodedToken.exp - now;
    if (timeLeft <= JWT_REFRESH_THRESHOLD_SECONDS) {
      const refreshedToken = generatePluginJwtToken({
        rcAccountId: decodedToken.rcAccountId,
        pluginId: decodedToken.pluginId
      });
      res.setHeader('x-refreshed-jwt-token', refreshedToken);
      req.pluginAuth = decodePluginJwtToken(refreshedToken) || decodedToken;
    }
  }

  next();
}

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
const app = createCoreApp();

app.get('/', (req, res) => {
  res.send('App Connect Plugin Template Server - OK');
});

app.post('/plugin/:pluginId/auth/register', async function pluginRegisterHandler(req, res) {
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

app.post('/plugin/:pluginId', validateAndRefreshPluginToken, async function pluginHandler(req, res) {
  try {
    const pluginIdentity = req.pluginAuth;
    switch (req.params.pluginId) {
      case SYNC_PLUGIN_ID: {
        const result = syncAllCapsPlugin.run({ identity: pluginIdentity, data: req.body.data });
        res.status(200).send(result);
        return;
      }
      case ASYNC_PLUGIN_ID: {
        const result = await asyncAllCapsPlugin.run({
          identity: pluginIdentity,
          data: req.body.data,
          asyncTaskId: req.body.asyncTaskId
        });
        res.status(200).send(result);
        return;
      }
      default:
        res.status(400).send('Unknown plugin');
    }
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
