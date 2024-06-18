const Sequelize = require('sequelize');
const { sequelize } = require('./sequelize');

// Model for User data
exports.MessageLogModel = sequelize.define('messageLogs', {
    id: {
        type: Sequelize.STRING,
        primaryKey: true,
    },
    platform: {
        type: Sequelize.STRING,
    },
    conversationId: {
        type: Sequelize.STRING,
    },
    conversationLogId:{
        type: Sequelize.STRING,
    },
    thirdPartyLogId: {
        type: Sequelize.STRING,
    },
    userId: {
        type: Sequelize.STRING,
    }
});
