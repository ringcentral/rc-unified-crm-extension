const Sequelize = require('sequelize');
const { sequelize } = require('./sequelize');

// Model for Admin data
exports.LlmSessionModel = sequelize.define('llmSessions', {
    // LLM session ID
    id: {
        type: Sequelize.STRING,
        primaryKey: true,
    },
    jwtToken: {
        type: Sequelize.STRING,
    }
});
