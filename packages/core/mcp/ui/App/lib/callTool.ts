import { dbg } from './debugLog';

/**
 * Server URL for direct HTTP tool calls.
 * Set from structuredContent.serverUrl when the initial tool output arrives.
 */
let _serverUrl: string | null = null;

/**
 * Send a JSON-RPC 2.0 request to the host (ChatGPT) and await the response.
 * Used for MCP Apps bridge calls that require a round-trip (e.g. ui/update-model-context).
 */
function rpcRequest(method: string, params: unknown, timeoutMs = 10_000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = `${method}-${Date.now()}-${Math.random().toString(36).slice(2)}`

    const timer = setTimeout(() => {
      window.removeEventListener('message', onMessage)
      reject(new Error(`rpcRequest "${method}" timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    function onMessage(event: MessageEvent) {
      if (event.source !== window.parent) return
      const msg = event.data
      if (!msg || msg.jsonrpc !== '2.0' || msg.id !== id) return
      clearTimeout(timer)
      window.removeEventListener('message', onMessage)
      if (msg.error) reject(new Error(msg.error.message ?? JSON.stringify(msg.error)))
      else resolve(msg.result)
    }

    window.addEventListener('message', onMessage, { passive: true })
    window.parent.postMessage({ jsonrpc: '2.0', id, method, params }, '*')
  })
}

/**
 * Inject text into the model's context without showing it as a visible chat message.
 * Uses the MCP Apps bridge ui/update-model-context (preferred), with ui/message as fallback.
 */
export async function updateModelContext(text: string): Promise<void> {
  const content = [{ type: 'text', text }]

  // Primary: MCP Apps standard — invisible to user, visible to model
  try {
    await rpcRequest('ui/update-model-context', { content })
    dbg.info('updateModelContext: ui/update-model-context succeeded')
    return
  } catch (err: any) {
    dbg.warn('updateModelContext: ui/update-model-context failed, trying ui/message:', err.message)
  }

  // Fallback: visible user message (ui/message notification — fire and forget)
  try {
    window.parent.postMessage(
      { jsonrpc: '2.0', method: 'ui/message', params: { role: 'user', content } },
      '*',
    )
    dbg.info('updateModelContext: ui/message sent')
    return
  } catch (err: any) {
    dbg.warn('updateModelContext: ui/message failed, trying window.openai.sendMessage:', err.message)
  }

  // Last resort: legacy ChatGPT Apps SDK
  const openai = (window as any).openai
  if (typeof openai?.sendMessage === 'function') {
    openai.sendMessage(text)
    dbg.info('updateModelContext: window.openai.sendMessage used')
  } else {
    dbg.error('updateModelContext: no mechanism available to update model context')
  }
}

export function setServerUrl(url: string) {
  _serverUrl = url.replace(/\/+$/, '');
  dbg.info('serverUrl set to:', _serverUrl);
}

export function getServerUrl(): string | null {
  return _serverUrl;
}

/**
 * Call a widget-accessible tool on the server via direct fetch to /mcp/widget-tool-call.
 *
 * NOTE: window.openai.callTool() is intentionally NOT used here.
 * It routes through ChatGPT's LLM which drops widget-provided args when the MCP
 * tool has no Zod inputSchema registered — args arrive as undefined on the server.
 * Direct fetch correctly forwards all args.
 */
export async function callTool(
  toolName: string,
  args: Record<string, unknown> = {},
): Promise<any> {
  dbg.info(`callTool("${toolName}", ${JSON.stringify(args)})`);
  dbg.info('_serverUrl:', _serverUrl);

  if (!_serverUrl) {
    const msg = 'serverUrl not set — ensure APP_SERVER env var is set and server restarted';
    dbg.error(msg);
    throw new Error(msg);
  }

  const endpoint = `${_serverUrl}/mcp/widget-tool-call`;
  const body = JSON.stringify({ tool: toolName, toolArgs: args });
  dbg.info('fetch POST', endpoint, 'body:', body);

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    const text = await res.text();
    dbg.info('fetch response:', res.status, text.slice(0, 300));

    if (!res.ok) {
      let parsed: any = null;
      try { parsed = JSON.parse(text); } catch { /* ignore */ }
      throw new Error(parsed?.error || `HTTP ${res.status}: ${text}`);
    }

    return JSON.parse(text);
  } catch (err: any) {
    dbg.error('fetch threw:', err.message);
    throw err;
  }
}
