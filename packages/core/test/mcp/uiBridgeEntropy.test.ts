jest.mock('../../mcp/ui/App/lib/debugLog', () => ({
  dbg: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const { updateModelContext } = require('../../mcp/ui/App/lib/callTool');

describe('MCP UI RPC correlation and entropy', () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  let listeners: Set<(event: any) => void>;
  let parent: any;
  let browser: any;
  let getRandomValues: jest.Mock;
  let weakRandom: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    listeners = new Set();
    parent = { postMessage: jest.fn() };
    getRandomValues = jest.fn((bytes: Uint8Array) => { bytes.fill(0xab); return bytes; });
    browser = {
      parent,
      crypto: { getRandomValues },
      addEventListener: jest.fn((_name: string, fn: (event: any) => void) => listeners.add(fn)),
      removeEventListener: jest.fn((_name: string, fn: (event: any) => void) => listeners.delete(fn)),
    };
    Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: browser });
    weakRandom = jest.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  afterEach(() => {
    weakRandom.mockRestore();
    jest.useRealTimers();
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else delete (globalThis as any).window;
  });

  function respond(source: any, data: any) {
    for (const listener of listeners) listener({ source, data });
  }

  test('uses browser crypto and only accepts a matching reply from the parent', async () => {
    const pending = updateModelContext('context');
    const packet = parent.postMessage.mock.calls[0][0];
    respond({}, { jsonrpc: '2.0', id: packet.id, result: {} });
    respond(parent, { jsonrpc: '2.0', id: 'different', result: {} });
    expect(listeners.size).toBe(1);
    respond(parent, { jsonrpc: '2.0', id: packet.id, result: {} });
    await pending;
    expect(packet.id).toMatch(/^ui\/update-model-context-\d+-[0-9a-f]{32}$/);
    expect(getRandomValues).toHaveBeenCalledTimes(1);
    expect(getRandomValues.mock.calls[0][0]).toHaveLength(16);
    expect(weakRandom).not.toHaveBeenCalled();
    expect(listeners.size).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
  });

  test('retains the notification fallback and cleanup after a parent error', async () => {
    const pending = updateModelContext('context');
    const packet = parent.postMessage.mock.calls[0][0];
    respond(parent, { jsonrpc: '2.0', id: packet.id, error: { message: 'unsupported' } });
    await pending;
    expect(parent.postMessage.mock.calls[1][0]).toMatchObject({ method: 'ui/message' });
    expect(listeners.size).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
  });

  test('retains timeout fallback and removes the stale listener', async () => {
    const pending = updateModelContext('context');
    jest.advanceTimersByTime(10_000);
    await pending;
    expect(parent.postMessage.mock.calls[1][0]).toMatchObject({ method: 'ui/message' });
    expect(listeners.size).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
  });

  test('does not downgrade to weak randomness when browser crypto is unavailable', async () => {
    browser.crypto = undefined;
    const pending = updateModelContext('context');
    jest.advanceTimersByTime(10_000);
    await pending;
    const calls = parent.postMessage.mock.calls;
    expect(calls[calls.length - 1][0]).toMatchObject({ method: 'ui/message' });
    expect(weakRandom).not.toHaveBeenCalled();
    expect(listeners.size).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
  });
});

export {};
