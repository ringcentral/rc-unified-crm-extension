const { handleMcpRequest } = require('../../mcp/mcpHandler');

function mockResponse() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
    end: jest.fn(),
  };
}

describe('MCP Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('tools/list includes output schemas for registered tools', async () => {
    const req = {
      body: {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
      },
      headers: {},
    };
    const res = mockResponse();

    await handleMcpRequest(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const response = res.json.mock.calls[0][0];
    const getHelp = response.result.tools.find(tool => tool.name === 'getHelp');
    const getPublicConnectors = response.result.tools.find(tool => tool.name === 'getPublicConnectors');

    expect(getHelp.outputSchema).toEqual(expect.objectContaining({
      type: 'object',
      required: ['success', 'data'],
    }));
    expect(getPublicConnectors.outputSchema.properties).toHaveProperty('serverUrl');
  });

  test('tools/call returns structuredContent matching the tool output', async () => {
    const req = {
      body: {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'getHelp',
          arguments: {},
        },
      },
      headers: {},
    };
    const res = mockResponse();

    await handleMcpRequest(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const response = res.json.mock.calls[0][0];

    expect(response.result.structuredContent).toEqual(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        overview: expect.any(String),
        steps: expect.any(Array),
      }),
    }));
    expect(response.result.content[0]).toEqual(expect.objectContaining({
      type: 'text',
      text: expect.stringContaining('"success": true'),
    }));
  });
});

export {};
