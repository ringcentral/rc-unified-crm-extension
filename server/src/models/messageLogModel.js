const Sequelize = require('sequelize');
const { sequelize } = require('./sequelize');

// Model for User data
exports.MessageLogModel = sequelize.define('messageLogs', {
    id: {
        type: Sequelize.NUMBER,
        primaryKey: true,
    },
    platform: {
        type: Sequelize.STRING,
    },
    conversationId: {
        type: Sequelize.STRING,
    },
    thirdPartyLogId: {
        type: Sequelize.STRING,
    },
    userId: {
        type: Sequelize.STRING,
    }
});
