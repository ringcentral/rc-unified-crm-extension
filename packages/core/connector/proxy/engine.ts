// @ts-check
/** @typedef {import('../../types').MapFindContactResponseParams} MapFindContactResponseParams */
/** @typedef {import('../../types').MapProxyResponseParams} MapProxyResponseParams */
/** @typedef {import('../../types').PerformProxyRequestParams} PerformProxyRequestParams */
/** @typedef {import('../../types').ProxyAuthConfig} ProxyAuthConfig */
/** @typedef {import('../../types').ProxyConfig} ProxyConfig */
/** @typedef {import('../../types').ProxyContactInfo} ProxyContactInfo */
/** @typedef {import('../../types').ProxyOperationConfig} ProxyOperationConfig */
/** @typedef {import('../../types').ProxyResponse} ProxyResponse */
/** @typedef {import('../../types').ProviderError} ProviderError */
/** @typedef {Record<string, any>} TemplateContext */

const axios = /** @type {any} */ (require('axios'));
const logger = require('../../lib/logger');

/**
 * @param {any} obj
 * @param {string | undefined} path
 * @returns {any}
 */
function getByPath(obj, path) {
  if (!path || path === '$') return obj;
  const parts = path.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

/**
 * @param {any} template
 * @param {TemplateContext} context
 * @returns {any}
 */
function renderTemplateString(template, context) {
  if (typeof template !== 'string') return template;
  // if only template value, return value with stringify
  const onlyVarName = template.match(/^\{\{\s*([^}]+?)\s*\}\}$/);
  if (onlyVarName) {
    return getByPath(context, onlyVarName[1]);
  }
  return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, expr) => {
    const value = getByPath(context, expr.trim());
    return value == null ? '' : String(value);
  });
}

/**
 * @param {any} input
 * @param {TemplateContext} context
 * @returns {any}
 */
function renderDeep(input, context) {
  if (input == null) return input;
  if (typeof input === 'string') return renderTemplateString(input, context);
  if (Array.isArray(input)) return input.map(v => renderDeep(v, context));
  if (typeof input === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(input)) {
      out[k] = renderDeep(v, context);
    }
    return out;
  }
  return input;
}

/**
 * @param {string | undefined} baseUrl
 * @param {string | undefined} path
 * @returns {string | undefined}
 */
function joinUrl(baseUrl, path) {
  if (!baseUrl) return path;
  if (!path) return baseUrl;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

/**
 * Return only the destination host so rendered URL paths and query strings are
 * never included in proxy failure logs.
 * @param {string | undefined} url
 * @returns {string | undefined}
 */
function getUrlHost(url) {
  if (!url) return undefined;
  try {
    return new URL(url).host;
  } catch (error) {
    return undefined;
  }
}

/**
 * @param {{ auth?: ProxyAuthConfig, context: TemplateContext, authHeader?: string }} params
 * @returns {Record<string, any>}
 */
function getAuthHeaderFromAuthConfig({ auth, context, authHeader }) {
  const authHeaders = {};
  const headerName = auth?.headerName || 'Authorization';
  if (auth && auth.credentialTemplate) {
    const credentials = renderTemplateString(auth.credentialTemplate, context);
    const encode = auth.encode === 'none' ? false : true;
    const token = encode ? Buffer.from(credentials).toString('base64') : credentials;
    authHeaders[headerName] = auth.scheme ? `${auth.scheme} ${token}` : token;
  } else if (authHeader) {
    authHeaders[headerName] = authHeader;
  } else if (auth && auth.type === 'oauth' && context.user) {
    authHeaders[headerName] = `${auth.scheme || 'Bearer'} ${context.user.accessToken}`;
  }
  return authHeaders;
}

/**
 * @param {{ config: ProxyConfig, operation?: ProxyOperationConfig, authHeader?: string, context: TemplateContext }} params
 * @returns {Record<string, any>}
 */
function buildHeaders({ config, operation, authHeader, context }) {
  const headers = renderDeep(Object.assign({}, config.requestDefaults?.defaultHeaders || {}), context);
  const renderedOpHeaders = renderDeep(operation?.headers || {}, context);
  for (const [k, v] of Object.entries(renderedOpHeaders)) headers[k] = v;

  // Per-operation auth override
  const authHeaders = getAuthHeaderFromAuthConfig({
    auth: operation?.auth || config.auth,
    context,
    authHeader
  });
  for (const [k, v] of Object.entries(authHeaders)) headers[k] = v;
  return headers;
}

/**
 * @param {PerformProxyRequestParams} params
 * @returns {Promise<ProxyResponse | null>}
 */
async function performRequest({ config, opName, inputs, user, authHeader }) {
  const op = config.operations?.[opName];
  if (!op) return null;
  const accessToken = user?.accessToken ?? inputs?.apiKey ?? '';
  const context = Object.assign({}, inputs, {
    user: user ? {
      accessToken,
      id: user.id?.split('-')[0],
      hostname: user.hostname,
      timezoneName: user.timezoneName,
      timezoneOffset: user.timezoneOffset,
      platform: user.platform,
      platformAdditionalInfo: user.platformAdditionalInfo,
      refreshToken: user.refreshToken,
      tokenExpiry: user.tokenExpiry,
    } : {
      accessToken,
    },
    authHeader,
    apiKey: accessToken,
    secretKey: config.secretKey,
  });
  const url = joinUrl(config.requestDefaults?.baseUrl, renderTemplateString(op.url, context));
  const method = (op.method || 'GET').toUpperCase();
  const headers = buildHeaders({ config, operation: op, authHeader, context });
  const params = renderDeep(op.query || {}, context);
  const data = renderDeep(op.body || {}, context);
  const timeout = (config.requestDefaults?.timeoutSeconds || 30) * 1000;
  const axiosParams = { url, method, headers, params, data, timeout };
  const requestStartTime = Date.now();
  try {
    const response = await axios(axiosParams);
    return response;
  } catch (e) {
    const error = /** @type {ProviderError} */ (e);
    const responseHeaders = /** @type {Record<string, any> | undefined} */ (error.response?.headers);
    logger.error('PROXY_CONNECTOR_REQUEST_FAILED', {
      proxyOperation: opName,
      proxyId: user?.platformAdditionalInfo?.proxyId,
      connectorName: config.meta?.name,
      method,
      targetHost: getUrlHost(url),
      statusCode: error.response?.status ?? 'unknown',
      errorCode: error.code,
      errorMessage: error.message,
      durationMs: Date.now() - requestStartTime,
      timeoutMs: timeout,
      upstreamRequestId: responseHeaders?.['x-request-id'] ?? responseHeaders?.['X-Request-Id'],
    });
    throw error;
  }
}

/**
 * @param {MapFindContactResponseParams} params
 * @returns {ProxyContactInfo[]}
 */
function mapFindContactResponse({ config, response, opName = 'findContact' }) {
  const map = config.operations?.[opName]?.responseMapping;
  if (!map) return [];
  const __ctx = { body: response.data };
  const list = /** @type {any[]} */ (getByPath(__ctx, map.listPath || 'body') || []);
  const itemMap = map.item || {};
  return list.map(it => {
    return {
      id: getByPath(it, itemMap.idPath || 'id'),
      name: getByPath(it, itemMap.namePath || 'name') || '',
      phone: getByPath(it, itemMap.phonePath || 'phone') || undefined,
      type: getByPath(it, itemMap.typePath || 'type') || 'Contact',
      title: getByPath(it, itemMap.titlePath || 'title') || "",
      company: getByPath(it, itemMap.companyPath || 'company') || "",
      createdDate: getByPath(it, itemMap.createdDatePath || 'createdDate') || undefined,
      mostRecentActivityDate: getByPath(it, itemMap.mostRecentActivityDatePath || 'mostRecentActivityDate') || undefined,
      additionalInfo: getByPath(it, itemMap.additionalInfoPath || 'additionalInfo') || null
    };
  });
}

/**
 * @param {MapProxyResponseParams} params
 * @returns {{ logId?: string }}
 */
function mapCreateCallLogResponse({ config, response }) {
  const map = config.operations?.createCallLog?.responseMapping;
  if (!map) return { logId: undefined };
  const __ctx = { body: response.data };
  const logId = getByPath(__ctx, map.idPath || 'body.id');

  return { logId: logId ? String(logId) : undefined };
}

/**
 * @param {MapProxyResponseParams} params
 * @returns {{ callLogInfo: { subject: any, note: any, fullBody: any, fullLogResponse: unknown } }}
 */
function mapGetCallLogResponse({ config, response }) {
  const map = config.operations?.getCallLog?.responseMapping || {};
  const __ctx = { body: response.data };
  const subject = getByPath(__ctx, map.subjectPath || 'body.subject');
  const note = getByPath(__ctx, map.notePath || 'body.note');
  const fullBody = getByPath(__ctx, map.fullBodyPath || 'body.note');
  const fullLogResponse = response.data;
  return {
    callLogInfo: { subject, note, fullBody, fullLogResponse }
  };
}

module.exports = {
  getByPath,
  renderTemplateString,
  renderDeep,
  joinUrl,
  performRequest,
  mapFindContactResponse,
  mapCreateCallLogResponse,
  mapGetCallLogResponse
};



export {};
