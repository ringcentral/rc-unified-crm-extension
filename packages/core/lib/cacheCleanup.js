const { Op } = require('sequelize');
const { CacheModel } = require('../models/cacheModel');
const logger = require('./logger');

async function clearExpiredCache({ now = new Date() } = {}) {
    const deletedCount = await CacheModel.destroy({
        where: {
            expiry: {
                [Op.lte]: now
            }
        }
    });

    logger.info('Expired cache cleanup completed', { deletedCount });

    return deletedCount;
}

module.exports = {
    clearExpiredCache
};
