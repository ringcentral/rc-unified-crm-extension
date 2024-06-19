const Sequelize = require('sequelize');
const { sequelize2 } = require('./sequelize');

// Model for User data
exports.MessageLogModel1 = sequelize2.define('messageLogs', {
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
    date:{
        type: Sequelize.DATEONLY,
    },
    thirdPartyLogId: {
        type: Sequelize.STRING,
    },
    userId: {
        type: Sequelize.STRING,
    }
});
