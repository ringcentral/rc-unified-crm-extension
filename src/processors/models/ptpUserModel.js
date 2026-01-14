const Sequelize = require('sequelize');
const { sequelize } = require('@app-connect/core/models/sequelize');

exports.PtpUserModel = sequelize.define('ptp_users', {
    id: {
        type: Sequelize.STRING,
        primaryKey: true,
    },
    // in apiKey auth, accessToken will be API key
    accessToken: {
      type: Sequelize.STRING(2000),
    },
    refreshToken: {
      type: Sequelize.STRING(2000),
    },
    tokenExpiry: {
      type: Sequelize.DATE
    }
});