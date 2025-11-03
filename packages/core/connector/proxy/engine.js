const axios = require('axios');

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

function joinUrl(baseUrl, path) {
  if (!baseUrl) return path;
  if (!path) return baseUrl;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

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

async function performRequest({ config, opName, inputs, user, authHeader }) {
  const op = config.operations?.[opName];
  if (!op) return null;
  const context = Object.assign({}, inputs, {
    user: user ? {
      accessToken: user.accessToken,
      id: user.id?.split('-')[0],
      hostname: user.hostname,
      timezoneName: user.timezoneName,
      timezoneOffset: user.timezoneOffset,
      platform: user.platform,
      platformAdditionalInfo: user.platformAdditionalInfo,
      refreshToken: user.refreshToken,
      tokenExpiry: user.tokenExpiry,
    } : {
      accessToken: '',
    },
    authHeader,
    apiKey: user?.accessToken,
    secretKey: config.secretKey,
  });
  const url = joinUrl(config.requestDefaults?.baseUrl, renderTemplateString(op.url, context));
  const method = (op.method || 'GET').toUpperCase();
  const headers = buildHeaders({ config, operation: op, authHeader, context });
  const params = renderDeep(op.query || {}, context);
  const data = renderDeep(op.body || {}, context);
  const timeout = (config.requestDefaults?.timeoutSeconds || 30) * 1000;
  const axiosParams = { url, method, headers, params, data, timeout };
  const response = await axios(axiosParams);
  return response;
}

function mapFindContactResponse({ config, response }) {
  const map = config.operations?.findContact?.responseMapping;
  if (!map) return [];
  const __ctx = { body: response.data };
  const list = getByPath(__ctx, map.listPath || 'body') || [];
  const itemMap = map.item || {};
  return list.map(it => {
    return {
      id: getByPath(it, itemMap.idPath || 'id'),
      name: getByPath(it, itemMap.namePath || 'name') || '',
      phone: getByPath(it, itemMap.phonePath || 'phone') || undefined,
      type: getByPath(it, itemMap.typePath || 'type') || 'Contact',
      title: getByPath(it, itemMap.titlePath || 'title') || "",
      company: getByPath(it, itemMap.companyPath || 'company') || "",
      mostRecentActivityDate: getByPath(it, itemMap.mostRecentActivityDatePath || 'mostRecentActivityDate') || undefined,
      additionalInfo: getByPath(it, itemMap.additionalInfoPath || 'additionalInfo') || null
    };
  });
}

function mapCreateCallLogResponse({ config, response }) {
  const map = config.operations?.createCallLog?.responseMapping;
  if (!map) return { logId: undefined };
  const __ctx = { body: response.data };
  const logId = getByPath(__ctx, map.idPath || 'body.id');

  return { logId: logId ? String(logId) : undefined };
}

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


