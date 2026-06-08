const { Op } = require('sequelize');
const { CacheModel } = require('../models/cacheModel');
const { AccountDataModel } = require('../models/accountDataModel');
const logger = require('./logger');

const ACCOUNT_CONTACT_DATA_KEY_PATTERN = 'contact-%';
const ACCOUNT_CONTACT_DATA_RETENTION_MONTHS = 3;

async function clearExpiredCache({ now = new Date() } = {}) {
    const cacheDeletedCount = await clearExpiredCacheRows({ now });
    const accountContactDataDeletedCount = await clearExpiredAccountContactData({ now });
    const deletedCount = cacheDeletedCount + accountContactDataDeletedCount;

    logger.info('Expired cache cleanup completed', {
        deletedCount,
        cacheDeletedCount,
        accountContactDataDeletedCount
    });

    return deletedCount;
}

function getAccountContactDataCutoffDate({ now, retentionMonths }) {
    const cutoffDate = new Date(now.getTime());
    cutoffDate.setMonth(cutoffDate.getMonth() - retentionMonths);
    return cutoffDate;
}

async function clearExpiredCacheRows({ now }) {
    return CacheModel.destroy({
        where: {
            expiry: {
                [Op.lte]: now
            }
        }
    });
}

async function clearExpiredAccountContactData({
    now = new Date(),
    retentionMonths = ACCOUNT_CONTACT_DATA_RETENTION_MONTHS
} = {}) {
    const cutoffDate = getAccountContactDataCutoffDate({ now, retentionMonths });

    return AccountDataModel.destroy({
        where: {
            dataKey: {
                [Op.like]: ACCOUNT_CONTACT_DATA_KEY_PATTERN
            },
            createdAt: {
                [Op.lt]: cutoffDate
            }
        }
    });
}

module.exports = {
    clearExpiredAccountContactData,
    clearExpiredCache
};
