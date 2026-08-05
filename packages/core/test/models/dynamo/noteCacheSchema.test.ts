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

const { NoteCache } = require('../../../models/dynamo/noteCacheSchema');

describe('noteCacheSchema', () => {
  test('defines sessionId as the hash key', () => {
    expect(NoteCache.schema.definition.sessionId).toEqual({
      type: String,
      hashKey: true,
    });
  });

  test('requires the cached note value', () => {
    expect(NoteCache.schema.definition.note).toEqual({
      type: String,
      required: true,
    });
  });

  test('requires ttl as a number field', () => {
    expect(NoteCache.schema.definition.ttl).toEqual({
      type: Number,
      required: true,
    });
  });

  test('creates the expected Dynamoose model and table options', () => {
    expect(NoteCache.modelName).toBe('-note-cache');
    expect(NoteCache.options).toEqual({
      prefix: process.env.DYNAMODB_TABLE_PREFIX,
      expires: 60,
    });
  });
});


export {};
