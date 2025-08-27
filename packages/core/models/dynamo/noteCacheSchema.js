const dynamoose = require('dynamoose');

const noteCacheSchema = new dynamoose.Schema({
    sessionId: {
        type: String,
        hashKey: true,
    },
    note: {
        type: String,
        required: true,
    },
    ttl: {
        type: Number,
        required: true,
    },
});

const tableOptions = {
    prefix: process.env.DYNAMODB_TABLE_PREFIX,
    expires: 60 // 60 seconds
};

if (process.env.NODE_ENV === 'production') {
    tableOptions.create = false;
    tableOptions.waitForActive = false;
}

const NoteCache = dynamoose.model('-note-cache', noteCacheSchema, tableOptions);

exports.NoteCache = NoteCache;