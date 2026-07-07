const Sequelize = require('sequelize');
const { sequelize: rawSequelize } = require('./sequelize');
const sequelize = rawSequelize as any;

// Model for User data
const MessageLogModel = sequelize.define('messageLogs', {
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

export { MessageLogModel };
