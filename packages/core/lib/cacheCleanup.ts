import type {
    AccountContactCleanupOptions,
    AccountContactCutoffOptions,
    CacheCleanupOptions
} from '../types';

const { Op } = require('sequelize');
const { CacheModel } = require('../models/cacheModel');
const { AccountDataModel } = require('../models/accountDataModel');
const logger = require('./logger');

const ACCOUNT_CONTACT_DATA_KEY_PATTERN = 'contact-%';
const ACCOUNT_CONTACT_DATA_RETENTION_MONTHS = 3;

async function clearExpiredCache({ now = new Date() }: CacheCleanupOptions = {}): Promise<number> {
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

function getAccountContactDataCutoffDate({ now, retentionMonths }: AccountContactCutoffOptions): Date {
    const cutoffDate = new Date(now.getTime());
    cutoffDate.setMonth(cutoffDate.getMonth() - retentionMonths);
    return cutoffDate;
}

async function clearExpiredCacheRows({ now }: { now: Date }): Promise<number> {
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
}: AccountContactCleanupOptions = {}): Promise<number> {
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

export {
    clearExpiredAccountContactData,
    clearExpiredCache
};
