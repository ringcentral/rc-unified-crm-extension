const Sequelize = require('sequelize');
const { sequelize } = require('./sequelize');

exports.CallDownListModel = sequelize.define('callDownLists', {
    id: {
        type: Sequelize.STRING,
        primaryKey: true,
    },
    userId: {
        type: Sequelize.STRING,
    },
    contactId: {
        type: Sequelize.STRING,
    },
    contactType: {
        type: Sequelize.STRING,
    },
    status: {
        type: Sequelize.STRING,
    },
    scheduledAt: {
        type: Sequelize.DATE,
    },
    lastCallAt: {
        type: Sequelize.DATE,
    }
}, {
    timestamps: true,
    indexes: [
        { fields: ['userId'] },
        { fields: ['status'] },
        { fields: ['scheduledAt'] },
        { fields: ['userId', 'status'] }
    ]
});