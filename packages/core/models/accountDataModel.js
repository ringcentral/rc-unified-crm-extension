const Sequelize = require('sequelize');
const { sequelize } = require('./sequelize');

// Model for account data with composite primary key
exports.AccountDataModel = sequelize.define('accountData', {
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

exports.getOrRefreshAccountData = async function getOrRefreshAccountData({ rcAccountId, platformName, dataKey, forceRefresh, fetchFn }) {
    const existing = await exports.AccountDataModel.findOne({ where: { rcAccountId, platformName, dataKey } });
    if (existing && !forceRefresh) return existing.data;

    const fresh = await fetchFn();
    if (existing) {
        await existing.update({ data: fresh });
    } else {
        await exports.AccountDataModel.create({ rcAccountId, platformName, dataKey, data: fresh });
    }
    return fresh;
}