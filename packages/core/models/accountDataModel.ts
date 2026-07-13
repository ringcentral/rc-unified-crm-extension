const Sequelize = require('sequelize');
const { sequelize: rawSequelize } = require('./sequelize');
const sequelize = rawSequelize as any;

// Model for account data with composite primary key
const AccountDataModel = sequelize.define('accountData', {
    rcAccountId: {
        type: Sequelize.STRING,
        primaryKey: true,
    },
    platformName: {
        type: Sequelize.STRING,
        primaryKey: true,
    },
    dataKey: {
        type: Sequelize.STRING,
        primaryKey: true,
    },
    data: {
        type: Sequelize.JSON,
    }
});

async function getOrRefreshAccountData({ rcAccountId, platformName, dataKey, forceRefresh, fetchFn }: any): Promise<any> {
    const existing = await AccountDataModel.findOne({ where: { rcAccountId, platformName, dataKey } });
    if (existing && !forceRefresh) return existing.data;

    const fresh = await fetchFn();
    if (existing) {
        await existing.update({ data: fresh });
    } else {
        await AccountDataModel.create({ rcAccountId, platformName, dataKey, data: fresh });
    }
    return fresh;
}

export {
    AccountDataModel,
    getOrRefreshAccountData
};
