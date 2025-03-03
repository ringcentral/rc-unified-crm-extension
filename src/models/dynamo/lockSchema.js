const dynamoose = require('dynamoose');

const lockSchema = new dynamoose.Schema({
    userId: {
        type: String,
        hashKey: true
    },
    ttl: {
      type: Number
    }
});

const tableOptions = {
    prefix: process.env.DYNAMODB_TABLE_PREFIX,
    expires: 60 // 60 seconds
};

if (process.env.NODE_ENV === 'production') {
    tableOptions.create = false;
    tableOptions.waitForActive = false;
}

const Lock = dynamoose.model('-token-refresh-lock', lockSchema, tableOptions);

exports.Lock = Lock;