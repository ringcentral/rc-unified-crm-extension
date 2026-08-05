const Sequelize = require('sequelize');
const { sequelize: rawSequelize } = require('./sequelize');
const sequelize = rawSequelize as any;

// Model for Admin data
const LlmSessionModel = sequelize.define('llmSessions', {
    // LLM session ID
    id: {
        type: Sequelize.STRING,
        primaryKey: true,
    },
    jwtToken: {
        type: Sequelize.STRING,
    },
    expiry: {
        type: Sequelize.DATE
  }
});

export { LlmSessionModel };
