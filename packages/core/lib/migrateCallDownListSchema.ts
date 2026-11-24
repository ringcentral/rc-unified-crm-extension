const Sequelize = require('sequelize');

const CALL_DOWN_LISTS_TABLE = 'callDownLists';
const ADDED_COLUMNS = ['platform', 'thirdPartyId'];

async function addMissingColumn(queryInterface, tableDescription, columnName) {
    if (tableDescription[columnName]) {
        return tableDescription;
    }

    try {
        await queryInterface.addColumn(CALL_DOWN_LISTS_TABLE, columnName, {
            type: Sequelize.STRING,
            allowNull: true,
        });
    }
    catch (error) {
        const refreshedDescription = await queryInterface.describeTable(CALL_DOWN_LISTS_TABLE);
        if (!refreshedDescription[columnName]) {
            throw error;
        }
        return refreshedDescription;
    }

    return {
        ...tableDescription,
        [columnName]: { type: 'STRING', allowNull: true },
    };
}

async function migrateCallDownListSchema(sequelize?) {
    const targetSequelize = sequelize ?? require('../models/sequelize').sequelize;
    const queryInterface = targetSequelize.getQueryInterface();
    let description = await queryInterface.describeTable(CALL_DOWN_LISTS_TABLE);
    for (const columnName of ADDED_COLUMNS) {
        description = await addMissingColumn(queryInterface, description, columnName);
    }
}

export { migrateCallDownListSchema };
