const Sequelize = require('sequelize');

const MESSAGE_LOGS_TABLE = 'messageLogs';

const MESSAGE_LOGS_PRIMARY_KEY = ['id', 'platform', 'userId'];

function primaryKeyColumns(description) {
    return Object.entries(description)
        .filter(([, column]) => column && (column as { primaryKey?: boolean }).primaryKey)
        .map(([name]) => name);
}

function hasCompositeMessageLogsKey(description) {
    const columns = primaryKeyColumns(description);
    return columns.length === MESSAGE_LOGS_PRIMARY_KEY.length
        && MESSAGE_LOGS_PRIMARY_KEY.every((name) => columns.includes(name));
}

async function addContactIdColumn(queryInterface, description) {
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

// sync() does not alter an existing table's primary key. Without this, new
// databases get (id, platform, userId) while existing ones keep id-only, and
// the same message id cannot be stored for two CRM users.
async function migrateMessageLogsPrimaryKey(targetSequelize, description) {
    const currentKey = primaryKeyColumns(description);
    if (currentKey.length === 0 || hasCompositeMessageLogsKey(description)) {
        return;
    }
    if (
        typeof targetSequelize.getDialect !== 'function'
        || typeof targetSequelize.query !== 'function'
        || typeof targetSequelize.transaction !== 'function'
    ) {
        return;
    }

    // SQLite is only used for disposable local/test databases, where sync()
    // creates the composite key directly from MessageLogModel.
    if (targetSequelize.getDialect() !== 'postgres') {
        return;
    }

    // Production uses Postgres. Keep the replacement atomic so a failed ADD
    // cannot leave the table without its original primary key.
    await targetSequelize.transaction(async (transaction) => {
        const queryOptions = { transaction };
        await targetSequelize.query(
            `UPDATE "${MESSAGE_LOGS_TABLE}" SET platform = COALESCE(platform, ''), "userId" = COALESCE("userId", '') WHERE platform IS NULL OR "userId" IS NULL`,
            queryOptions
        );
        await targetSequelize.query(
            `ALTER TABLE "${MESSAGE_LOGS_TABLE}" DROP CONSTRAINT IF EXISTS "${MESSAGE_LOGS_TABLE}_pkey", ADD PRIMARY KEY (id, platform, "userId")`,
            queryOptions
        );
    });
}

async function migrateMessageLogsSchema(sequelize?) {
    const targetSequelize = sequelize ?? require('../models/sequelize').sequelize;
    const queryInterface = targetSequelize.getQueryInterface();
    const description = await queryInterface.describeTable(MESSAGE_LOGS_TABLE);
    await addContactIdColumn(queryInterface, description);
    await migrateMessageLogsPrimaryKey(targetSequelize, description);
}

export { migrateMessageLogsSchema };
