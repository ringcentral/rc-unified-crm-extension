const Sequelize = require('sequelize');

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

function callLogsCreateSqlClaimsExtensionPk(createSql) {
    if (!createSql || typeof createSql !== 'string') {
        return false;
    }
    const pkRegex = /PRIMARY\s+KEY\s*\(([^)]+)\)/gi;
    let m;
    while ((m = pkRegex.exec(createSql)) !== null) {
        if (/\bextensionNumber\b/i.test(m[1])) {
            return true;
        }
    }
    return false;
}

async function sqliteCallLogsPkIncludesExtension(sequelize, options = {}) {
    const sql = await fetchCallLogsCreateSqlSqlite(sequelize, options);
    return callLogsCreateSqlClaimsExtensionPk(sql);
}

/**
 * SQLite cannot change composite PK via Sequelize addConstraint (it appends a second PRIMARY KEY).
 * Rebuild the table with the correct 3-column primary key and copy rows.
 */
async function migrateCallLogsExtensionNumberSqlite(sequelize, transaction) {
    const qg = sequelize.getQueryInterface().queryGenerator;
    const qi = sequelize.getQueryInterface();
    const q = (id) => qg.quoteIdentifier(id);
    const tmpName = `callLogs_mig_legacy_${Date.now()}`;
    const mainTableSql = qg.quoteTable({ tableName: 'callLogs' });
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
      ${q('platform')} VARCHAR(255),
      ${q('thirdPartyLogId')} VARCHAR(255),
      ${q('userId')} VARCHAR(255),
      ${q('contactId')} VARCHAR(255),
      ${q('createdAt')} DATETIME NOT NULL,
      ${q('updatedAt')} DATETIME NOT NULL,
      PRIMARY KEY (${q('id')}, ${q('sessionId')}, ${q('extensionNumber')})
    );
    `,
        { transaction },
    );

    const oldDesc = await qi.describeTable(tmpName, { transaction });

    const targetCols = [
        'id',
        'sessionId',
        'extensionNumber',
        'platform',
        'thirdPartyLogId',
        'userId',
        'contactId',
        'createdAt',
        'updatedAt',
    ];

    const missingRequired = targetCols.filter(
        (c) => findColumnKey(oldDesc, c) == null && c !== 'extensionNumber',
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

module.exports = {
    findColumnKey,
    migrateCallLogsExtensionNumberSqlite,
    sqliteCallLogsPkIncludesExtension,
};
