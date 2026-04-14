const { sign, verify } = require('jsonwebtoken');

const JWT_REFRESH_THRESHOLD_SECONDS = 7 * 24 * 60 * 60; // 1 week
const JWT_EXPIRES_IN = '2w';

function getJwtSecret() {
  return process.env.PLUGIN_SERVER_SECRET_KEY || process.env.APP_SERVER_SECRET_KEY;
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

exports.generatePluginJwtToken = generatePluginJwtToken;
exports.validateAndRefreshPluginToken = validateAndRefreshPluginToken;
