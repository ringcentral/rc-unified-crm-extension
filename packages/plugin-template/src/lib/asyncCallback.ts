const DEFAULT_APP_CONNECT_CALLBACK_BASE_URL = 'https://unified-crm-extension.labs.ringcentral.com';
const ASYNC_CALLBACK_PATH = '/plugin/async-callback/';

function getTrustedCallbackBase(): URL {
  const configuredBase = process.env.APP_CONNECT_CALLBACK_BASE_URL;
  let base: URL;
  try {
    base = new URL(configuredBase || DEFAULT_APP_CONNECT_CALLBACK_BASE_URL);
  } catch {
    throw new Error('Invalid APP_CONNECT_CALLBACK_BASE_URL');
  }

  const allowLocalHttp = configuredBase && process.env.NODE_ENV !== 'production'
    && base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
  if ((base.protocol !== 'https:' && !allowLocalHttp) || base.username || base.password || base.search || base.hash) {
    throw new Error('Invalid APP_CONNECT_CALLBACK_BASE_URL');
  }
  return base;
}

export function resolveAsyncCallbackUrl(taskId: unknown, requestedUrl: unknown): string | null {
  if (typeof taskId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(taskId) || typeof requestedUrl !== 'string') {
    return null;
  }

  const base = getTrustedCallbackBase();
  const prefix = base.pathname.replace(/\/+$/, '');
  const callbackUrl = `${base.origin}${prefix}${ASYNC_CALLBACK_PATH}${taskId}`;
  try {
    return new URL(requestedUrl).href === callbackUrl ? callbackUrl : null;
  } catch {
    return null;
  }
}
