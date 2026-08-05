const Sequelize = require('sequelize');
const { sequelize: rawSequelize } = require('./sequelize');
const sequelize = rawSequelize as any;

// Model for cache data
const CacheModel = sequelize.define('cache', {
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
}, {
    indexes: [
        { fields: ['expiry'] }
    ]
});

export { CacheModel };
