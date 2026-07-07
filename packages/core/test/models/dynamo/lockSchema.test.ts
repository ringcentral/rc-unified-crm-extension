jest.mock('dynamoose', () => ({
  Schema: jest.fn((definition, options) => ({
    definition,
    options,
  })),
  model: jest.fn((name, schema, options) => ({
    modelName: name,
    schema,
    options,
  })),
}));

const { Lock } = require('../../../models/dynamo/lockSchema');

describe('lockSchema', () => {
  test('defines userId as the hash key', () => {
    expect(Lock.schema.definition.userId).toEqual({
      type: String,
      hashKey: true,
    });
  });

  test('defines ttl as a number field', () => {
    expect(Lock.schema.definition.ttl).toEqual({
      type: Number,
    });
  });

  test('creates the expected Dynamoose model and table options', () => {
    expect(Lock.modelName).toBe('-token-refresh-lock');
    expect(Lock.options).toEqual({
      prefix: process.env.DYNAMODB_TABLE_PREFIX,
      expires: 60,
    });
  });
});


export {};
