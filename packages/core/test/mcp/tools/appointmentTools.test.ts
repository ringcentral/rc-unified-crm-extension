jest.mock('../../../lib/jwt');
jest.mock('../../../connector/registry');
jest.mock('../../../handlers/appointment');

const jwt = require('../../../lib/jwt');
const connectorRegistry = require('../../../connector/registry');
const appointmentCore = require('../../../handlers/appointment');
const listAppointments = require('../../../mcp/tools/listAppointments');
const createAppointment = require('../../../mcp/tools/createAppointment');
const updateAppointment = require('../../../mcp/tools/updateAppointment');
const confirmAppointment = require('../../../mcp/tools/confirmAppointment');
const cancelAppointment = require('../../../mcp/tools/cancelAppointment');

describe('MCP appointment tools', () => {
  const decodedToken = {
    id: 'user-123',
    platform: 'testCRM'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jwt.decodeJwt.mockReturnValue(decodedToken);
    connectorRegistry.getConnector.mockReturnValue({
      listAppointments: jest.fn(),
      createAppointment: jest.fn(),
      updateAppointment: jest.fn(),
      confirmAppointment: jest.fn(),
      cancelAppointment: jest.fn()
    });
  });

  test('defines appointment tool schemas and annotations', () => {
    expect(listAppointments.definition.name).toBe('listAppointments');
    expect(listAppointments.definition.annotations.readOnlyHint).toBe(true);
    expect(createAppointment.definition.inputSchema.required).toEqual(['title', 'startTimeUtc', 'durationMinutes']);
    expect(updateAppointment.definition.inputSchema.required).toEqual(['appointmentId']);
    expect(confirmAppointment.definition.inputSchema.required).toEqual(['appointmentId']);
    expect(cancelAppointment.definition.annotations.destructiveHint).toBe(true);
  });

  test('listAppointments resolves upcoming filters and returns matching appointments', async () => {
    appointmentCore.listAppointments.mockResolvedValueOnce({
      successful: true,
      appointments: [{ id: 'appt-1' }],
      returnMessage: { message: 'Listed' }
    });

    const upcomingResult = await listAppointments.execute({
      jwtToken: 'jwt-token',
      filter: 'upcoming',
      mineOnly: true
    });

    expect(upcomingResult.success).toBe(true);
    expect(upcomingResult.data.filter).toBe('upcoming');
    expect(upcomingResult.data.totalCount).toBe(1);
    expect(appointmentCore.listAppointments).toHaveBeenCalledWith({
      platform: 'testCRM',
      userId: 'user-123',
      range: expect.objectContaining({
        startDate: expect.any(String),
        endDate: expect.any(String)
      }),
      mineOnly: true,
      forceSync: false
    });
  });

  test('listAppointments forwards custom date ranges', async () => {
    appointmentCore.listAppointments.mockResolvedValueOnce({
      successful: true,
      appointments: []
    });
    const customResult = await listAppointments.execute({
      jwtToken: 'jwt-token',
      filter: 'custom',
      startDate: '2026-07-01',
      endDate: '2026-07-31'
    });
    expect(customResult.data.range).toEqual({
      startDate: '2026-07-01',
      endDate: '2026-07-31'
    });
  });

  test('listAppointments returns handler failure messages', async () => {
    appointmentCore.listAppointments.mockResolvedValueOnce({
      successful: false,
      returnMessage: { message: 'List failed' }
    });
    const failedResult = await listAppointments.execute({
      jwtToken: 'jwt-token',
      filter: 'past'
    });
    expect(failedResult).toMatchObject({
      success: false,
      error: 'List failed'
    });
  });

  test('listAppointments validates missing and invalid auth', async () => {
    await expect(listAppointments.execute({})).resolves.toMatchObject({
      success: false,
      error: 'Please go to Settings and authorize CRM platform'
    });

    jwt.decodeJwt.mockReturnValueOnce(null);
    await expect(listAppointments.execute({ jwtToken: 'bad' })).resolves.toMatchObject({
      success: false,
      error: 'Invalid JWT token'
    });

    jwt.decodeJwt.mockReturnValueOnce({ platform: 'testCRM' });
    await expect(listAppointments.execute({ jwtToken: 'jwt-token' })).resolves.toMatchObject({
      success: false,
      error: 'Invalid JWT token: userId not found'
    });
  });

  test('listAppointments validates connector availability and implementation', async () => {
    connectorRegistry.getConnector.mockReturnValueOnce(null);
    await expect(listAppointments.execute({ jwtToken: 'jwt-token' })).resolves.toMatchObject({
      success: false,
      error: 'Platform connector not found for: testCRM'
    });

    connectorRegistry.getConnector.mockReturnValueOnce({});
    await expect(listAppointments.execute({ jwtToken: 'jwt-token' })).resolves.toMatchObject({
      success: false,
      error: 'listAppointments is not implemented for platform: testCRM'
    });
  });

  test('createAppointment validates required payload fields', async () => {
    await expect(createAppointment.execute({})).resolves.toMatchObject({
      success: false,
      error: 'Please go to Settings and authorize CRM platform'
    });
    await expect(createAppointment.execute({ jwtToken: 'jwt-token' })).resolves.toMatchObject({
      success: false,
      error: 'title is required'
    });
    await expect(createAppointment.execute({ jwtToken: 'jwt-token', title: 'Meet' })).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('startTimeUtc is required')
    });
    await expect(createAppointment.execute({
      jwtToken: 'jwt-token',
      title: 'Meet',
      startTimeUtc: '2026-07-20T19:00:00.000Z'
    })).resolves.toMatchObject({
      success: false,
      error: 'durationMinutes is required'
    });
  });

  test('createAppointment submits normalized payload and returns created appointment', async () => {
    appointmentCore.createAppointment.mockResolvedValueOnce({
      successful: true,
      appointmentId: 'appt-1',
      appointment: { id: 'appt-1' },
      returnMessage: { message: 'Created' }
    });
    const result = await createAppointment.execute({
      jwtToken: 'jwt-token',
      title: 'Meet',
      summary: 'Summary',
      startTimeUtc: '2026-07-20T19:00:00.000Z',
      durationMinutes: '45',
      contacts: ['contact-1']
    });

    expect(result).toEqual({
      success: true,
      data: {
        appointmentId: 'appt-1',
        appointment: { id: 'appt-1' },
        message: 'Created'
      }
    });
    expect(appointmentCore.createAppointment).toHaveBeenCalledWith({
      platform: 'testCRM',
      userId: 'user-123',
      payload: {
        title: 'Meet',
        summary: 'Summary',
        startTimeUtc: '2026-07-20T19:00:00.000Z',
        durationMinutes: 45,
        contacts: ['contact-1']
      }
    });
  });

  test('createAppointment returns handler failure messages', async () => {
    appointmentCore.createAppointment.mockResolvedValueOnce({
      successful: false,
      returnMessage: { message: 'Create failed' }
    });
    await expect(createAppointment.execute({
      jwtToken: 'jwt-token',
      title: 'Meet',
      startTimeUtc: '2026-07-20T19:00:00.000Z',
      durationMinutes: 30
    })).resolves.toMatchObject({
      success: false,
      error: 'Create failed'
    });
  });

  test('createAppointment validates connector availability and implementation', async () => {
    connectorRegistry.getConnector.mockReturnValueOnce(null);
    await expect(createAppointment.execute({
      jwtToken: 'jwt-token',
      title: 'Meet',
      startTimeUtc: '2026-07-20T19:00:00.000Z',
      durationMinutes: 30
    })).resolves.toMatchObject({
      success: false,
      error: 'Platform connector not found for: testCRM'
    });

    connectorRegistry.getConnector.mockReturnValueOnce({});
    await expect(createAppointment.execute({
      jwtToken: 'jwt-token',
      title: 'Meet',
      startTimeUtc: '2026-07-20T19:00:00.000Z',
      durationMinutes: 30
    })).resolves.toMatchObject({
      success: false,
      error: 'createAppointment is not implemented for platform: testCRM'
    });
  });

  test('updateAppointment validates required appointment id', async () => {
    await expect(updateAppointment.execute({ jwtToken: 'jwt-token' })).resolves.toMatchObject({
      success: false,
      error: 'appointmentId is required'
    });
  });

  test('updateAppointment builds sparse patch body', async () => {
    appointmentCore.updateAppointment.mockResolvedValueOnce({
      successful: true,
      appointment: { id: 'appt-1' },
      returnMessage: { message: 'Updated' }
    });
    const result = await updateAppointment.execute({
      jwtToken: 'jwt-token',
      appointmentId: 'appt-1',
      title: 'Updated',
      summary: 'Summary',
      startTimeUtc: '2026-07-20T19:00:00.000Z',
      durationMinutes: '60',
      contacts: [{ id: 'contact-1' }]
    });

    expect(result).toEqual({
      success: true,
      data: {
        appointment: { id: 'appt-1' },
        message: 'Updated'
      }
    });
    expect(appointmentCore.updateAppointment).toHaveBeenCalledWith({
      platform: 'testCRM',
      userId: 'user-123',
      appointmentId: 'appt-1',
      patchBody: {
        title: 'Updated',
        summary: 'Summary',
        startTimeUtc: '2026-07-20T19:00:00.000Z',
        durationMinutes: 60,
        contacts: [{ id: 'contact-1' }]
      }
    });
  });

  test('updateAppointment returns handler failure messages', async () => {
    appointmentCore.updateAppointment.mockResolvedValueOnce({
      successful: false,
      returnMessage: { message: 'Update failed' }
    });
    await expect(updateAppointment.execute({
      jwtToken: 'jwt-token',
      appointmentId: 'appt-1'
    })).resolves.toMatchObject({
      success: false,
      error: 'Update failed'
    });
  });

  test('updateAppointment validates connector availability and implementation', async () => {
    connectorRegistry.getConnector.mockReturnValueOnce(null);
    await expect(updateAppointment.execute({
      jwtToken: 'jwt-token',
      appointmentId: 'appt-1'
    })).resolves.toMatchObject({
      success: false,
      error: 'Platform connector not found for: testCRM'
    });

    connectorRegistry.getConnector.mockReturnValueOnce({});
    await expect(updateAppointment.execute({
      jwtToken: 'jwt-token',
      appointmentId: 'appt-1'
    })).resolves.toMatchObject({
      success: false,
      error: 'updateAppointment is not implemented for platform: testCRM'
    });
  });

  test.each([
    ['confirmAppointment', confirmAppointment, 'confirmAppointment', appointmentCore.confirmAppointment, 'Appointment confirmed successfully', 'Failed to confirm appointment'],
    ['cancelAppointment', cancelAppointment, 'cancelAppointment', appointmentCore.cancelAppointment, 'Appointment cancelled successfully', 'Failed to cancel appointment']
  ])('%s validates, succeeds, fails, and checks capability', async (name, tool, capabilityName, handlerFn, defaultMessage, defaultError) => {
    await expect(tool.execute({})).resolves.toMatchObject({
      success: false,
      error: 'Please go to Settings and authorize CRM platform'
    });
    await expect(tool.execute({ jwtToken: 'jwt-token' })).resolves.toMatchObject({
      success: false,
      error: 'appointmentId is required'
    });

    handlerFn.mockResolvedValueOnce({
      successful: true,
      appointment: { id: 'appt-1' },
      returnMessage: {}
    });
    await expect(tool.execute({
      jwtToken: 'jwt-token',
      appointmentId: 'appt-1'
    })).resolves.toEqual({
      success: true,
      data: {
        appointment: { id: 'appt-1' },
        message: defaultMessage
      }
    });
    expect(handlerFn).toHaveBeenCalledWith({
      platform: 'testCRM',
      userId: 'user-123',
      appointmentId: 'appt-1'
    });

    handlerFn.mockResolvedValueOnce({
      successful: false,
      returnMessage: {}
    });
    await expect(tool.execute({
      jwtToken: 'jwt-token',
      appointmentId: 'appt-1'
    })).resolves.toMatchObject({
      success: false,
      error: defaultError
    });

    connectorRegistry.getConnector.mockReturnValueOnce(null);
    await expect(tool.execute({
      jwtToken: 'jwt-token',
      appointmentId: 'appt-1'
    })).resolves.toMatchObject({
      success: false,
      error: 'Platform connector not found for: testCRM'
    });

    connectorRegistry.getConnector.mockReturnValueOnce({});
    await expect(tool.execute({
      jwtToken: 'jwt-token',
      appointmentId: 'appt-1'
    })).resolves.toMatchObject({
      success: false,
      error: `${capabilityName} is not implemented for platform: testCRM`
    });
  });
});

export {};
