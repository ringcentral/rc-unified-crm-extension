const jwt = require('@app-connect/core/lib/jwt');
const { UserModel } = require('@app-connect/core/models/userModel');
const syncAllCapsPlugin = require('./plugins/syncAllCapsPlugin');
const asyncAllCapsPlugin = require('./plugins/asyncAllCapsPlugin');

const {
  SYNC_PLUGIN_ID = 'sync-all-caps',
  ASYNC_PLUGIN_ID = 'async-all-caps'
} = process.env;

function registerPluginRoutes(app) {
  if (!app || typeof app.post !== 'function') {
    throw new Error('registerPluginRoutes(app) requires a valid Express app instance');
  }

  // This file is intentionally a route extension for an existing connector app.
  // Example usage from your connector src/app.js:
  //
  // const { createCoreApp } = require('@app-connect/core');
  // const { registerPluginRoutes } = require('../packages/my-plugin/src/pluginApp');
  // const app = createCoreApp();
  // registerPluginRoutes(app);
  //
  // The examples below (sync/async all caps) are teaching implementations,
  // not framework-level runtime structure.
  app.post('/plugin/:pluginId', async function pluginHandler(req, res) {
    try {
      const jwtToken = req.query.jwtToken;
      if (!jwtToken) {
        res.status(400).send('JWT token is required');
        return;
      }

      const { id: userId } = jwt.decodeJwt(jwtToken);
      const user = await UserModel.findByPk(userId);
      if (!user) {
        res.status(400).send('User not found');
        return;
      }

      switch (req.params.pluginId) {
        case SYNC_PLUGIN_ID: {
          const result = syncAllCapsPlugin.run({ user, data: req.body.data });
          res.status(200).send(result);
          return;
        }
        case ASYNC_PLUGIN_ID: {
          const result = await asyncAllCapsPlugin.run({
            user,
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
  //   const jwtToken = req.query.jwtToken;
  //   const authUrl = await somePlugin.getOAuthUrl({ jwtToken, pluginId: req.params.pluginId });
  //   res.status(200).send({ authUrl });
  // });
  //
  // app.get('/plugin/checkAuth/:pluginId', async function checkPluginAuth(req, res) {
  //   const jwtToken = req.query.jwtToken;
  //   const { id: userId } = jwt.decodeJwt(jwtToken);
  //   const result = await somePlugin.checkAuth({ userId });
  //   res.status(200).send(result);
  // });
  //
  // app.post('/plugin/logout/:pluginId', async function logoutPlugin(req, res) {
  //   const jwtToken = req.body.jwtToken;
  //   const { id: userId } = jwt.decodeJwt(jwtToken);
  //   const result = await somePlugin.logout({ userId });
  //   res.status(200).send(result);
  // });

  // License hooks are optional.
  // Uncomment and adapt this example if your plugin needs entitlement checks.
  //
  // app.get('/plugin/licenseStatus/:pluginId', async function getLicenseStatus(req, res) {
  //   const jwtToken = req.query.jwtToken;
  //   const { id: userId } = jwt.decodeJwt(jwtToken);
  //   const result = await somePlugin.getLicenseStatus({ userId });
  //   res.status(200).send(result);
  // });
}

exports.registerPluginRoutes = registerPluginRoutes;
