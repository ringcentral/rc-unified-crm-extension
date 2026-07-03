const { CallDownListModel } = require('../../models/callDownListModel');

describe('CallDownListModel', () => {
  beforeAll(async () => {
    await CallDownListModel.sync({ force: true });
  });

  afterEach(async () => {
    await CallDownListModel.destroy({ where: {} });
  });

  test('defines the expected fields and indexes', () => {
    const attributes = CallDownListModel.rawAttributes;

    expect(attributes.id.primaryKey).toBe(true);
    expect(attributes.userId.type.key).toBe('STRING');
    expect(attributes.contactId.type.key).toBe('STRING');
    expect(attributes.contactType.type.key).toBe('STRING');
    expect(attributes.status.type.key).toBe('STRING');
    expect(attributes.scheduledAt.type.key).toBe('DATE');
    expect(attributes.lastCallAt.type.key).toBe('DATE');
    expect(CallDownListModel.options.timestamps).toBe(true);
    expect(CallDownListModel.options.indexes).toEqual(expect.arrayContaining([
      expect.objectContaining({ fields: ['userId'] }),
      expect.objectContaining({ fields: ['status'] }),
      expect.objectContaining({ fields: ['scheduledAt'] }),
      expect.objectContaining({ fields: ['userId', 'status'] }),
    ]));
  });

  test('creates and reads a scheduled callback record', async () => {
    const scheduledAt = new Date('2026-07-02T10:00:00.000Z');

    await CallDownListModel.create({
      id: 'call-down-1',
      userId: 'user-1',
      contactId: 'contact-1',
      contactType: 'Lead',
      status: 'Pending',
      scheduledAt,
    });

    const record = await CallDownListModel.findByPk('call-down-1');

    expect(record).toMatchObject({
      id: 'call-down-1',
      userId: 'user-1',
      contactId: 'contact-1',
      contactType: 'Lead',
      status: 'Pending',
    });
    expect(record.scheduledAt.toISOString()).toBe('2026-07-02T10:00:00.000Z');
    expect(record.lastCallAt).toBeNull();
  });

  test('allows nullable fields under the current schema', async () => {
    await CallDownListModel.create({
      id: 'minimal-call-down',
    });

    const record = await CallDownListModel.findByPk('minimal-call-down');

    expect(record.userId).toBeNull();
    expect(record.contactId).toBeNull();
    expect(record.status).toBeNull();
    expect(record.scheduledAt).toBeNull();
    expect(record.lastCallAt).toBeNull();
  });

  test('updates callback status and last call time', async () => {
    await CallDownListModel.create({
      id: 'call-down-update',
      userId: 'user-1',
      contactId: 'contact-1',
      contactType: 'Contact',
      status: 'Pending',
      scheduledAt: new Date('2026-07-02T10:00:00.000Z'),
    });

    const lastCallAt = new Date('2026-07-02T10:30:00.000Z');
    await CallDownListModel.update({
      status: 'Called',
      lastCallAt,
    }, {
      where: { id: 'call-down-update' },
    });

    const record = await CallDownListModel.findByPk('call-down-update');
    expect(record.status).toBe('Called');
    expect(record.lastCallAt.toISOString()).toBe('2026-07-02T10:30:00.000Z');
  });

  test('queries by user and status together', async () => {
    await CallDownListModel.bulkCreate([
      {
        id: 'call-down-user-1-pending',
        userId: 'user-1',
        status: 'Pending',
        scheduledAt: new Date('2026-07-02T10:00:00.000Z'),
      },
      {
        id: 'call-down-user-1-called',
        userId: 'user-1',
        status: 'Called',
        scheduledAt: new Date('2026-07-02T11:00:00.000Z'),
      },
      {
        id: 'call-down-user-2-pending',
        userId: 'user-2',
        status: 'Pending',
        scheduledAt: new Date('2026-07-02T12:00:00.000Z'),
      },
    ]);

    const records = await CallDownListModel.findAll({
      where: {
        userId: 'user-1',
        status: 'Pending',
      },
    });

    expect(records).toHaveLength(1);
    expect(records[0].id).toBe('call-down-user-1-pending');
  });
});
