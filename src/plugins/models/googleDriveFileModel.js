const Sequelize = require('sequelize');
const { sequelize } = require('@app-connect/core/models/sequelize');

exports.GoogleDriveFileModel = sequelize.define('google_drive_files', {
    id: {
        type: Sequelize.STRING,
        primaryKey: true,
    },
    userId: {
        type: Sequelize.STRING,
    },
    telephonySessionId: {
        type: Sequelize.STRING,
    }
});