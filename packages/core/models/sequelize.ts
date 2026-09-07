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

function describeDatabaseTarget(databaseUrl: string | undefined) {
  if (!databaseUrl) {
    return 'not configured';
  }

  const normalizedUrl = databaseUrl.toLowerCase();
  if (normalizedUrl.startsWith('sqlite:')) {
    return `SQLite: ${databaseUrl.slice('sqlite:'.length).replace(/^\/\//, '')}`;
  }

  if (normalizedUrl.startsWith('postgres:') || normalizedUrl.startsWith('postgresql:')) {
    try {
      const parsedUrl = new URL(databaseUrl);
      const port = parsedUrl.port ? `:${parsedUrl.port}` : '';
      const databaseName = parsedUrl.pathname.replace(/^\/+/, '') || '(default database)';
      return `Postgres: ${parsedUrl.hostname}${port}/${databaseName}`;
    } catch (e) {
      return 'Postgres: invalid URL';
    }
  }

  return 'unrecognized database URL';
}

function resolveDatabaseUrl() {
  const appConnectDatabaseUrl = process.env.AC_DATABASE_URL;
  const legacyDatabaseUrl = process.env.DATABASE_URL;

  if (appConnectDatabaseUrl && legacyDatabaseUrl) {
    console.warn('[App Connect] AC_DATABASE_URL and DATABASE_URL are both set. Using AC_DATABASE_URL.');
  }

  const databaseUrl = appConnectDatabaseUrl || legacyDatabaseUrl;
  if (process.env.NODE_ENV !== 'test') {
    console.info(`[App Connect] Database target: ${describeDatabaseTarget(databaseUrl)}`);
  }
  return databaseUrl;
}

const databaseUrl = resolveDatabaseUrl();
const sequelize = new Sequelize(databaseUrl as any, createSequelizeOptions(databaseUrl));

export { sequelize };
