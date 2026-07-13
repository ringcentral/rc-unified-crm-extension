const axios = require('axios');
const { Op } = require('sequelize');
const { getServer } = require('../../../src/index');
const jwt = require('@app-connect/core/lib/jwt');
const { UserModel } = require('@app-connect/core/models/userModel');
const { CallLogModel } = require('@app-connect/core/models/callLogModel');
const { AccountDataModel } = require('@app-connect/core/models/accountDataModel');

async function startServer() {
  await AccountDataModel.sync();
  const server = getServer().listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const { port } = server.address();
  const client = axios.create({
    baseURL: `http://127.0.0.1:${port}`,
    validateStatus: () => true,
    timeout: 10000,
    proxy: false,
  });

  return { server, client };
}

async function stopServer(server) {
  if (server) {
    await new Promise(resolve => server.close(resolve));
  }
}

async function cleanE2EData({ userIds = [], rcAccountIds = [] }) {
  if (userIds.length > 0) {
    await CallLogModel.destroy({ where: { userId: { [Op.in]: userIds } } });
  }
  if (rcAccountIds.length > 0) {
    await AccountDataModel.destroy({ where: { rcAccountId: { [Op.in]: rcAccountIds } } });
  }
  if (userIds.length > 0) {
    await UserModel.destroy({ where: { id: { [Op.in]: userIds } } });
  }
}

function generateJwt({ id, platform, rcUserNumber }) {
  return jwt.generateJwt({ id, platform, rcUserNumber });
}

module.exports = {
  startServer,
  stopServer,
  cleanE2EData,
  generateJwt,
};

export {};
