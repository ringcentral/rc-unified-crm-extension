const dynamoose = require('dynamoose');
const crypto = require('crypto');

const CONNECTOR_STATUS = {
  PRIVATE: 'private',
  UNDER_REVIEW: 'under_review',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};

const connectorSchema = new dynamoose.Schema({
  accountId: {
    type: String,
    hashKey: true,
  },
  id: {
    type: String,
    rangeKey: true,
  },
  // Reference to original connector (for partition records)
  originalAccountId: {
    type: String,
    required: false, // Only set for partition records (under_review, approved)
  },
  // Basic Information
  name: {
    type: String,
    required: true,
  },
  displayName: String,
  description: String,
  iconUrl: String,
  // Status and Workflow
  status: {
    type: String,
    required: true,
    enum: Object.values(CONNECTOR_STATUS),
    default: CONNECTOR_STATUS.PRIVATE,
    index: {
      name: 'statusIdIndex',
      global: true,
      rangeKey: 'id',
      project: ['accountId', 'name', 'displayName', 'developer', 'originalAccountId'],
    },
  },
  creatorId: String,
  // Developer Information
  developer: {
    type: Object,
    schema: {
      name: String,
      websiteUrl: String,
      supportUrl: String,
    },
  },
  // Manifest Management
  manifest: {
    type: Object,
    required: true,
  },
  proxyConfig: {
    type: Object,
    required: false,
  },
  proxyId: {
    type: String,
    index: {
      name: 'proxyIdIndex',
      global: true,
      project: ['id', 'accountId', 'creatorId', 'name', 'displayName', 'status', 'developer', 'originalAccountId', 'proxyConfig'],
    }
  },
  // Review and Approval
  submittedAt: Number,
  reviewedBy: String,
  reviewedAt: Number,
  reviewNotes: String,
  rejectionReason: String,
  demoAccounts: String,
  // Usage and Analytics
  usageCount: {
    type: Number,
    default: 0,
  },
  lastUsedAt: Number,
  allowedAccounts: {
    type: Array,
    schema: [String],
  },
  encodedSecretKey: String,
}, {
  saveUnknown: ['manifest.**', 'proxyConfig.**'],
  timestamps: true,
});

const tableOptions = {
  prefix: process.env.DEVELOPER_DYNAMODB_TABLE_PREFIX,
};

if (process.env.NODE_ENV === 'production') {
  tableOptions.create = false;
  tableOptions.waitForActive = false;
}

const Connector = dynamoose.model('connectors', connectorSchema, tableOptions);

function getDeveloperCipherKey() {
  if (!process.env.DEVELOPER_APP_SERVER_SECRET_KEY) {
    throw new Error('DEVELOPER_APP_SERVER_SECRET_KEY is not defined');
  }
  if (process.env.DEVELOPER_APP_SERVER_SECRET_KEY.length < 32) {
    // pad secret key with spaces if it is less than 32 bytes
    return process.env.DEVELOPER_APP_SERVER_SECRET_KEY.padEnd(32, ' ');
  }
  if (process.env.DEVELOPER_APP_SERVER_SECRET_KEY.length > 32) {
    // truncate secret key if it is more than 32 bytes
    return process.env.DEVELOPER_APP_SERVER_SECRET_KEY.slice(0, 32);
  }
  return process.env.DEVELOPER_APP_SERVER_SECRET_KEY;
}

function decode(encryptedData) {
  const decipher = crypto.createDecipheriv('aes-256-cbc', getDeveloperCipherKey(), Buffer.alloc(16, 0));
  return decipher.update(encryptedData, 'hex', 'utf8') + decipher.final('utf8');
}

// ADD static method to get connector by proxyId
Connector.getProxyConfig = async (proxyId) => {
  const connectors = await Connector
    .query('proxyId')
    .eq(proxyId)
    .using('proxyIdIndex')
    .exec();
  if (connectors.length > 0) {
    const proxyConfig = connectors[0].proxyConfig;
    const encodedSecretKey = connectors[0].encodedSecretKey;
    const secretKey = encodedSecretKey ? decode(encodedSecretKey) : null;
    if (secretKey) {
      proxyConfig.secretKey = secretKey;
    }
    return proxyConfig;
  }
  return null;
};

exports.Connector = Connector;
