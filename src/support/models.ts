// @ts-check

const Sequelize = /** @type {any} */ (require('sequelize'));
const { sequelize } = /** @type {any} */ (require('@app-connect/core/models/sequelize'));

// Every CRM integration the Support console has ever seen, kept after it disappears from the CRM.
// id = {platform}-{integrationId}
exports.SupportIntegrationRecordModel = sequelize.define('support_integration_records', {
    id: {
        type: Sequelize.STRING,
        primaryKey: true,
    },
    platform: {
        type: Sequelize.STRING,
    },
    integrationId: {
        type: Sequelize.STRING,
    },
    name: {
        type: Sequelize.STRING,
    },
    // CRM-specific display fields, e.g. VinSolutions dealer city and state
    details: {
        type: Sequelize.JSON,
    },
    // { [service]: { firstSeenAt, lastSeenAt } }
    services: {
        type: Sequelize.JSON,
    },
}, {
    indexes: [
        { fields: ['platform'] }
    ]
});

// Removals requested from the Support console, one row per service call.
exports.SupportIntegrationEventModel = sequelize.define('support_integration_events', {
    id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    platform: {
        type: Sequelize.STRING,
    },
    integrationId: {
        type: Sequelize.STRING,
    },
    service: {
        type: Sequelize.STRING,
    },
    action: {
        type: Sequelize.STRING,
    },
    // removed | alreadyRemoved | failed
    result: {
        type: Sequelize.STRING,
    },
    errorMessage: {
        type: Sequelize.STRING(1000),
    },
    actorExtensionId: {
        type: Sequelize.STRING,
    },
    actorName: {
        type: Sequelize.STRING,
    },
    actorEmail: {
        type: Sequelize.STRING,
    },
}, {
    indexes: [
        { fields: ['platform', 'integrationId'] }
    ]
});

// Integrations that must not be removed by mistake. id = {platform}-{integrationId}
exports.SupportAllowlistEntryModel = sequelize.define('support_allowlist_entries', {
    id: {
        type: Sequelize.STRING,
        primaryKey: true,
    },
    platform: {
        type: Sequelize.STRING,
    },
    integrationId: {
        type: Sequelize.STRING,
    },
    note: {
        type: Sequelize.STRING(1000),
    },
    addedByExtensionId: {
        type: Sequelize.STRING,
    },
    addedByName: {
        type: Sequelize.STRING,
    },
}, {
    indexes: [
        { fields: ['platform'] }
    ]
});

export {};
