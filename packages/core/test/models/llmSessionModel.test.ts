const { LlmSessionModel } = require('../../models/llmSessionModel');

describe('LlmSessionModel', () => {
  beforeAll(async () => {
    await LlmSessionModel.sync({ force: true });
  });

  afterEach(async () => {
    await LlmSessionModel.destroy({ where: {} });
  });

  test('defines the expected session fields', () => {
    const attributes = LlmSessionModel.rawAttributes;

    expect(attributes.id.primaryKey).toBe(true);
    expect(attributes.jwtToken.type.key).toBe('STRING');
    expect(attributes.expiry.type.key).toBe('DATE');
  });

  test('creates and reads a persisted LLM session', async () => {
    await LlmSessionModel.create({
      id: 'llm-session-1',
      jwtToken: 'jwt-token-1',
      expiry: new Date('2026-07-02T11:00:00.000Z'),
    });

    const record = await LlmSessionModel.findByPk('llm-session-1');

    expect(record.id).toBe('llm-session-1');
    expect(record.jwtToken).toBe('jwt-token-1');
    expect(record.expiry.toISOString()).toBe('2026-07-02T11:00:00.000Z');
  });

  test('allows nullable token and expiry under the current schema', async () => {
    await LlmSessionModel.create({
      id: 'minimal-llm-session',
    });

    const record = await LlmSessionModel.findByPk('minimal-llm-session');

    expect(record.jwtToken).toBeNull();
    expect(record.expiry).toBeNull();
  });

  test('updates session token and expiry', async () => {
    await LlmSessionModel.create({
      id: 'llm-session-update',
      jwtToken: 'old-token',
      expiry: new Date('2026-07-02T11:00:00.000Z'),
    });

    await LlmSessionModel.update({
      jwtToken: 'new-token',
      expiry: new Date('2026-07-02T12:00:00.000Z'),
    }, {
      where: { id: 'llm-session-update' },
    });

    const record = await LlmSessionModel.findByPk('llm-session-update');
    expect(record.jwtToken).toBe('new-token');
    expect(record.expiry.toISOString()).toBe('2026-07-02T12:00:00.000Z');
  });

  test('deletes expired session records by expiry query', async () => {
    await LlmSessionModel.bulkCreate([
      {
        id: 'expired-llm-session',
        jwtToken: 'expired-token',
        expiry: new Date('2026-07-02T10:59:59.000Z'),
      },
      {
        id: 'active-llm-session',
        jwtToken: 'active-token',
        expiry: new Date('2026-07-02T11:00:01.000Z'),
      },
    ]);

    const { Op } = require('sequelize');
    await LlmSessionModel.destroy({
      where: {
        expiry: {
          [Op.lt]: new Date('2026-07-02T11:00:00.000Z'),
        },
      },
    });

    await expect(LlmSessionModel.findByPk('expired-llm-session')).resolves.toBeNull();
    await expect(LlmSessionModel.findByPk('active-llm-session')).resolves.not.toBeNull();
  });
});


export {};
