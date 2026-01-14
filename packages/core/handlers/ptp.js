const { CacheModel } = require('../models/cacheModel');
const { Op } = require('sequelize');

async function getPtpAsyncTasks({ asyncTaskIds }) {
    const caches = await CacheModel.findAll({
        where: {
            id: {
                [Op.in]: asyncTaskIds
            }
        }
    });
    const result = caches.map(cache => ({
        cacheKey: cache.cacheKey,
        status: cache.status
    }));
    const toRemoveIds = caches.map(cache => cache.id);
    await CacheModel.destroy({
        where: {
            id: {
                [Op.in]: toRemoveIds
            }
        }
    });
    return result;
}

exports.getPtpAsyncTasks = getPtpAsyncTasks;