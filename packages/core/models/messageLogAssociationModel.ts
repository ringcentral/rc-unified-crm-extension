const Sequelize = require('sequelize');
const { sequelize: rawSequelize } = require('./sequelize');
const sequelize = rawSequelize as any;

// Association table for selective message logging.
// Unlike `messageLogs` (which is bucketed per conversation/day, i.e. roughly one
// row per conversationLogId), this table stores one row per individual message so
// a many-messages-to-one CRM-log relationship can be represented and a selective
// log can span multiple conversationLogIds. The daily-digest/auto path continues
// to use `messageLogs` and is intentionally left untouched.
const MessageLogAssociationModel = sequelize.define('messageLogAssociations', {
    // RingCentral message id (the unit of selection)
    messageId: {
        type: Sequelize.STRING,
        primaryKey: true,
    },
    // Thread scope; drives the GET /messageLog lookup
    conversationId: {
        type: Sequelize.STRING,
    },
    // The day bucket the message came from; metadata only, may be null
    conversationLogId: {
        type: Sequelize.STRING,
        allowNull: true,
    },
    // CRM log record id used for navigation from the client
    thirdPartyLogId: {
        type: Sequelize.STRING,
    },
    userId: {
        type: Sequelize.STRING,
    },
    rcAccountId: {
        type: Sequelize.STRING,
    },
    platform: {
        type: Sequelize.STRING,
    }
}, {
    tableName: 'message_log_association',
    indexes: [
        { fields: ['conversationId'] }
    ]
});

export { MessageLogAssociationModel };
