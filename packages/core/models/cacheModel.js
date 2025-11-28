const Sequelize = require('sequelize');
const { sequelize } = require('./sequelize');

// Model for cache data
exports.CacheModel = sequelize.define('cache', {
    // id = {userId}-{cacheKey}
    id: {
        type: Sequelize.STRING,
        primaryKey: true,
    },
    status: {
        type: Sequelize.STRING,
    },
    userId: {
        type: Sequelize.STRING,
    },
    cacheKey: {
        type: Sequelize.STRING,
    },
    data: {
        type: Sequelize.JSON
    },
    expiry: {
        type: Sequelize.DATE
    }
});
