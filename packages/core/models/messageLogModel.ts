const Sequelize = require('sequelize');
const { sequelize: rawSequelize } = require('./sequelize');
const sequelize = rawSequelize as any;

// Stores RingCentral message ids (or local conversation bucket ids) mapped to
// CRM activity ids.
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
}, {
    indexes: [
        { fields: ['conversationId'] },
        { fields: ['conversationLogId'] },
        {
            name: 'message_logs_user_platform_conversation_message',
            fields: ['userId', 'platform', 'conversationId', 'id']
        }
    ]
});

export { MessageLogModel };
