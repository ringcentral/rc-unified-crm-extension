const Sequelize = require('sequelize');

const MESSAGE_LOGS_TABLE = 'messageLogs';

async function migrateMessageLogsSchema(sequelize?) {
    const targetSequelize = sequelize ?? require('../models/sequelize').sequelize;
    const queryInterface = targetSequelize.getQueryInterface();
    const description = await queryInterface.describeTable(MESSAGE_LOGS_TABLE);
    if (description.contactId) {
        return;
    }

    try {
        await queryInterface.addColumn(MESSAGE_LOGS_TABLE, 'contactId', {
            type: Sequelize.STRING,
            allowNull: true,
        });
    }
    catch (error) {
        // Another process may have added the nullable column after our initial
        // check. Re-read the schema before surfacing a migration failure.
        const refreshedDescription = await queryInterface.describeTable(MESSAGE_LOGS_TABLE);
        if (!refreshedDescription.contactId) {
            throw error;
        }
    }
}

export { migrateMessageLogsSchema };
