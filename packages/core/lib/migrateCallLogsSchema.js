const Sequelize = require('sequelize');

const CALL_LOGS_TABLE = 'callLogs';
const HASHED_EXTENSION_ID_COLUMN = 'hashedExtensionId';
const CALL_LOG_IDENTITY_PK_COLUMNS = ['id', 'sessionId', 'extensionNumber', HASHED_EXTENSION_ID_COLUMN];

function findColumnKey(tableDescription, name) {
    const lower = name.toLowerCase();
    return Object.keys(tableDescription).find((k) => k.toLowerCase() === lower);
}

async function fetchCallLogsCreateSqlSqlite(sequelize, options = {}) {
    const rows = await sequelize.query(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'callLogs'",
        { type: Sequelize.QueryTypes.SELECT, ...options },
    );
    return rows[0]?.sql ?? null;
}

function callLogsCreateSqlClaimsPkColumns(createSql, columns) {
    if (!createSql || typeof createSql !== 'string') {
        return false;
    }
    const pkRegex = /PRIMARY\s+KEY\s*\(([^)]+)\)/gi;
    let m;
    while ((m = pkRegex.exec(createSql)) !== null) {
        const pkColumns = m[1]
            .split(',')
            .map((column) => column.replace(/["'`\[\]\s]/g, '').toLowerCase());
        if (columns.every((column) => pkColumns.includes(column.toLowerCase()))) {
            return true;
        }
    }
    return false;
}

function callLogsCreateSqlClaimsExtensionPk(createSql) {
    return callLogsCreateSqlClaimsPkColumns(createSql, ['extensionNumber']);
}

async function sqliteCallLogsPkIncludesExtension(sequelize, options = {}) {
    const sql = await fetchCallLogsCreateSqlSqlite(sequelize, options);
    return callLogsCreateSqlClaimsExtensionPk(sql);
}

async function sqliteCallLogsPkIncludesHashedExtension(sequelize, options = {}) {
    const sql = await fetchCallLogsCreateSqlSqlite(sequelize, options);
    return callLogsCreateSqlClaimsPkColumns(sql, CALL_LOG_IDENTITY_PK_COLUMNS);
}

async function describeCallLogsTable(sequelize, options = {}) {
    return sequelize.getQueryInterface().describeTable(CALL_LOGS_TABLE, options);
}

/**
 * SQLite cannot change composite PK via Sequelize addConstraint (it appends a second PRIMARY KEY).
 * Rebuild the table with the current call-log identity primary key and copy rows.
 */
async function migrateCallLogsIdentitySqlite(sequelize, transaction) {
    const qg = sequelize.getQueryInterface().queryGenerator;
    const qi = sequelize.getQueryInterface();
    const q = (id) => qg.quoteIdentifier(id);
    const tmpName = `callLogs_mig_legacy_${Date.now()}`;
    const mainTableSql = qg.quoteTable({ tableName: CALL_LOGS_TABLE });
    const tmpTableSql = qg.quoteTable({ tableName: tmpName });

    await sequelize.query(
        `ALTER TABLE ${mainTableSql} RENAME TO ${qg.quoteIdentifier(tmpName)};`,
        { transaction },
    );

    await sequelize.query(
        `
    CREATE TABLE ${mainTableSql} (
      ${q('id')} VARCHAR(255) NOT NULL,
      ${q('sessionId')} VARCHAR(255) NOT NULL,
      ${q('extensionNumber')} VARCHAR(255) NOT NULL DEFAULT '',
      ${q(HASHED_EXTENSION_ID_COLUMN)} VARCHAR(255) NOT NULL DEFAULT '',
      ${q('platform')} VARCHAR(255),
      ${q('thirdPartyLogId')} VARCHAR(255),
      ${q('userId')} VARCHAR(255),
      ${q('contactId')} VARCHAR(255),
      ${q('createdAt')} DATETIME NOT NULL,
      ${q('updatedAt')} DATETIME NOT NULL,
      PRIMARY KEY (${CALL_LOG_IDENTITY_PK_COLUMNS.map(q).join(', ')})
    );
    `,
        { transaction },
    );

    const oldDesc = await qi.describeTable(tmpName, { transaction });

    const targetCols = [
        'id',
        'sessionId',
        'extensionNumber',
        HASHED_EXTENSION_ID_COLUMN,
        'platform',
        'thirdPartyLogId',
        'userId',
        'contactId',
        'createdAt',
        'updatedAt',
    ];

    const missingRequired = targetCols.filter(
        (c) => findColumnKey(oldDesc, c) == null && c !== 'extensionNumber' && c !== HASHED_EXTENSION_ID_COLUMN,
    );
    if (missingRequired.length) {
        throw new Error(
            `unexpected callLogs schema before migration (missing columns: ${missingRequired.join(', ')})`,
        );
    }

    const insertCols = targetCols.map(q).join(', ');
    const selectExprs = targetCols
        .map((col) => {
            const key = findColumnKey(oldDesc, col);
            if (key != null) {
                return q(key);
            }
            return `CAST('' AS VARCHAR(255))`;
        })
        .join(', ');

    await sequelize.query(
        `INSERT INTO ${mainTableSql} (${insertCols}) SELECT ${selectExprs} FROM ${tmpTableSql};`,
        { transaction },
    );

    await sequelize.query(`DROP TABLE ${tmpTableSql};`, { transaction });
}

async function migrateCallLogsExtensionNumberSqlite(sequelize, transaction) {
    return migrateCallLogsIdentitySqlite(sequelize, transaction);
}

async function getPostgresPrimaryKeyConstraint(sequelize, options = {}) {
    const constraints = await sequelize.query(
        `
        SELECT tc.constraint_name AS "constraintName"
        FROM information_schema.table_constraints tc
        WHERE tc.table_name = :tableName
          AND tc.constraint_type = 'PRIMARY KEY'
        LIMIT 1
        `,
        {
            type: Sequelize.QueryTypes.SELECT,
            replacements: { tableName: CALL_LOGS_TABLE },
            ...options,
        },
    );
    return constraints[0]?.constraintName ?? null;
}

async function postgresCallLogsPkIncludesHashedExtension(sequelize, options = {}) {
    const pkConstraintName = await getPostgresPrimaryKeyConstraint(sequelize, options);
    if (!pkConstraintName) {
        return false;
    }
    const rows = await sequelize.query(
        `
        SELECT kcu.column_name AS "columnName"
        FROM information_schema.key_column_usage kcu
        WHERE kcu.table_name = :tableName
          AND kcu.constraint_name = :constraintName
        ORDER BY kcu.ordinal_position
        `,
        {
            type: Sequelize.QueryTypes.SELECT,
            replacements: { tableName: CALL_LOGS_TABLE, constraintName: pkConstraintName },
            ...options,
        },
    );
    const pkColumns = rows.map((row) => row.columnName.toLowerCase());
    return CALL_LOG_IDENTITY_PK_COLUMNS.every((column) => pkColumns.includes(column.toLowerCase()));
}

async function migrateCallLogsIdentityPostgres(sequelize, transaction) {
    const qi = sequelize.getQueryInterface();
    const qg = qi.queryGenerator;
    const table = qg.quoteTable({ tableName: CALL_LOGS_TABLE });
    const pkConstraintName = await getPostgresPrimaryKeyConstraint(sequelize, { transaction });
    if (pkConstraintName) {
        await sequelize.query(
            `ALTER TABLE ${table} DROP CONSTRAINT ${qg.quoteIdentifier(pkConstraintName)};`,
            { transaction },
        );
    }
    await sequelize.query(
        `ALTER TABLE ${table} ADD PRIMARY KEY (${CALL_LOG_IDENTITY_PK_COLUMNS.map((column) => qg.quoteIdentifier(column)).join(', ')});`,
        { transaction },
    );
}

async function ensureCallLogsHashedExtensionIdSchema(sequelize) {
    const qi = sequelize.getQueryInterface();
    const dialect = sequelize.getDialect();
    let desc = await describeCallLogsTable(sequelize);

    if (findColumnKey(desc, HASHED_EXTENSION_ID_COLUMN) == null) {
        await qi.addColumn(CALL_LOGS_TABLE, HASHED_EXTENSION_ID_COLUMN, {
            type: Sequelize.STRING,
            allowNull: false,
            defaultValue: '',
        });
        desc = await describeCallLogsTable(sequelize);
    }

    if (dialect === 'sqlite') {
        const hasIdentityPk = await sqliteCallLogsPkIncludesHashedExtension(sequelize);
        if (!hasIdentityPk) {
            await sequelize.transaction(async (transaction) => {
                await migrateCallLogsIdentitySqlite(sequelize, transaction);
            });
        }
        return;
    }

    if (dialect === 'postgres') {
        const hasIdentityPk = await postgresCallLogsPkIncludesHashedExtension(sequelize);
        if (!hasIdentityPk) {
            await sequelize.transaction(async (transaction) => {
                await migrateCallLogsIdentityPostgres(sequelize, transaction);
            });
        }
    }
}

module.exports = {
    findColumnKey,
    migrateCallLogsExtensionNumberSqlite,
    migrateCallLogsIdentitySqlite,
    sqliteCallLogsPkIncludesExtension,
    sqliteCallLogsPkIncludesHashedExtension,
    ensureCallLogsHashedExtensionIdSchema,
};
