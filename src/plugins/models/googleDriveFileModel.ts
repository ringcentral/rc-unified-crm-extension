// @ts-check

const Sequelize = /** @type {any} */ (require('sequelize'));
const { sequelize } = /** @type {any} */ (require('../../../packages/core/models/sequelize'));

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

export {};
