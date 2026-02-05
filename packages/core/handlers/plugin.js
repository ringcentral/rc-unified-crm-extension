const { CacheModel } = require('../models/cacheModel');
const { Op } = require('sequelize');

async function getPluginAsyncTasks({ asyncTaskIds }) {
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
    const toRemoveCaches = caches.filter(cache => cache.status === 'completed' || cache.status === 'failed');
    await CacheModel.destroy({
        where: {
            id: {
                [Op.in]: toRemoveCaches.map(cache => cache.id)
            }
        }
    });
    return result;
}

exports.getPluginAsyncTasks = getPluginAsyncTasks;