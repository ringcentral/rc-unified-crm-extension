const { Sequelize } = require('sequelize');

function getDatabaseDialect(databaseUrl: string | undefined) {
  const normalizedUrl = databaseUrl?.toLowerCase() || '';
  if (normalizedUrl.startsWith('sqlite:')) {
    return 'sqlite';
  }
  if (normalizedUrl.startsWith('postgres:') || normalizedUrl.startsWith('postgresql:')) {
    return 'postgres';
  }
  return 'postgres';
}

function getDatabaseHost(databaseUrl: string | undefined) {
  if (!databaseUrl) {
    return '';
  }
  try {
    return new URL(databaseUrl).hostname.toLowerCase();
  } catch (e) {
    return '';
  }
}

function isLocalDatabaseHost(host: string) {
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.localhost');
}

function parseDatabaseSslOverride(value: string | undefined) {
  if (!value) {
    return undefined;
  }
  const normalizedValue = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalizedValue)) {
    return true;
  }
  if (['false', '0', 'no', 'off'].includes(normalizedValue)) {
    return false;
  }
  throw new Error('DATABASE_SSL must be true or false when set.');
}

function shouldUsePostgresSsl(databaseUrl: string | undefined) {
  const sslOverride = parseDatabaseSslOverride(process.env.DATABASE_SSL);
  if (typeof sslOverride === 'boolean') {
    return sslOverride;
  }
  return !isLocalDatabaseHost(getDatabaseHost(databaseUrl));
}

function createSequelizeOptions(databaseUrl: string | undefined) {
  const dialect = getDatabaseDialect(databaseUrl);
  const options: any = {
    dialect,
    logging: false
  };

  if (dialect === 'postgres') {
    options.protocol = 'postgres';
    if (shouldUsePostgresSsl(databaseUrl)) {
      options.dialectOptions = {
        ssl: {
          rejectUnauthorized: false
        }
      };
    }
  }

  return options;
}

const sequelize = new Sequelize(process.env.DATABASE_URL as any, createSequelizeOptions(process.env.DATABASE_URL));

export { sequelize };
