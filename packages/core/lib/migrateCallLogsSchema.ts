import type {
    MigrationLogger,
    PostgresClientLike,
    SequelizeLike,
    SequelizeTransactionLike,
    TableDescription
} from '../types';

const Sequelize = require('sequelize');

const CALL_LOGS_TABLE = 'callLogs';
const HASHED_EXTENSION_ID_COLUMN = 'hashedExtensionId';
const CALL_LOG_IDENTITY_PK_COLUMNS = ['id', 'sessionId', 'extensionNumber', HASHED_EXTENSION_ID_COLUMN];

function findColumnKey(tableDescription: TableDescription, name: string): string | undefined {
    const lower = name.toLowerCase();
    return Object.keys(tableDescription).find((k) => k.toLowerCase() === lower);
}

async function fetchCallLogsCreateSqlSqlite(
    sequelize: SequelizeLike,
    options: Record<string, unknown> = {}
): Promise<string | null> {
    const rows = await sequelize.query(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'callLogs'",
        { type: Sequelize.QueryTypes.SELECT, ...options },
    );
    return rows[0]?.sql ?? null;
}

function callLogsCreateSqlClaimsPkColumns(
    createSql: string | null | undefined,
    columns: string[]
): boolean {
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

function callLogsCreateSqlClaimsExtensionPk(createSql: string | null | undefined): boolean {
    return callLogsCreateSqlClaimsPkColumns(createSql, ['extensionNumber']);
}

async function sqliteCallLogsPkIncludesExtension(
    sequelize: SequelizeLike,
    options: Record<string, unknown> = {}
): Promise<boolean> {
    const sql = await fetchCallLogsCreateSqlSqlite(sequelize, options);
    return callLogsCreateSqlClaimsExtensionPk(sql);
}

async function sqliteCallLogsPkIncludesHashedExtension(
    sequelize: SequelizeLike,
    options: Record<string, unknown> = {}
): Promise<boolean> {
    const sql = await fetchCallLogsCreateSqlSqlite(sequelize, options);
    return callLogsCreateSqlClaimsPkColumns(sql, CALL_LOG_IDENTITY_PK_COLUMNS);
}

async function describeCallLogsTable(
    sequelize: SequelizeLike,
    options: Record<string, unknown> = {}
): Promise<TableDescription> {
    return sequelize.getQueryInterface().describeTable(CALL_LOGS_TABLE, options);
}

/**
 * SQLite cannot change composite PK via Sequelize addConstraint (it appends a second PRIMARY KEY).
 * Rebuild the table with the current call-log identity primary key and copy rows.
 */
async function migrateCallLogsIdentitySqlite(
    sequelize: SequelizeLike,
    transaction: SequelizeTransactionLike
): Promise<void> {
    const qg = sequelize.getQueryInterface().queryGenerator;
    const qi = sequelize.getQueryInterface();
    const q = (id: string) => qg.quoteIdentifier(id);
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

async function migrateCallLogsExtensionNumberSqlite(
    sequelize: SequelizeLike,
    transaction: SequelizeTransactionLike
): Promise<void> {
    return migrateCallLogsIdentitySqlite(sequelize, transaction);
}

async function getPostgresPrimaryKeyConstraint(
    sequelize: SequelizeLike,
    options: Record<string, unknown> = {}
): Promise<string | null> {
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

async function postgresCallLogsPkIncludesHashedExtension(
    sequelize: SequelizeLike,
    options: Record<string, unknown> = {}
): Promise<boolean> {
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
    const pkColumns = rows.map((row: any) => row.columnName.toLowerCase());
    return CALL_LOG_IDENTITY_PK_COLUMNS.every((column) => pkColumns.includes(column.toLowerCase()));
}

async function migrateCallLogsIdentityPostgres(
    sequelize: SequelizeLike,
    transaction: SequelizeTransactionLike
): Promise<void> {
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

async function ensureCallLogsHashedExtensionIdSchema(sequelize: SequelizeLike): Promise<void> {
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
            await sequelize.transaction(async (transaction: SequelizeTransactionLike) => {
                await migrateCallLogsIdentitySqlite(sequelize, transaction);
            });
        }
        return;
    }

    if (dialect === 'postgres') {
        const hasIdentityPk = await postgresCallLogsPkIncludesHashedExtension(sequelize);
        if (!hasIdentityPk) {
            await sequelize.transaction(async (transaction: SequelizeTransactionLike) => {
                await migrateCallLogsIdentityPostgres(sequelize, transaction);
            });
        }
    }
}

// Dedicated name for the online-built unique index that becomes the new PK.
const IDENTITY_INDEX_NAME = 'callLogs_identity_pk';
// Stable application-wide key for the Postgres advisory lock that serializes the
// migration across concurrently-booting instances. Any fixed integer works as long
// as it is unique within the app; keep it constant so every instance agrees on it.
const CALL_LOGS_MIGRATION_LOCK_KEY = 4972001;

async function postgresPrimaryKeyNameOnConnection(client: PostgresClientLike): Promise<string | null> {
    const { rows } = await client.query(
        `SELECT conname FROM pg_constraint
         WHERE conrelid = '"${CALL_LOGS_TABLE}"'::regclass AND contype = 'p' LIMIT 1`,
    );
    return rows[0]?.conname ?? null;
}

async function postgresPkIncludesIdentityOnConnection(client: PostgresClientLike): Promise<boolean> {
    const { rows } = await client.query(
        `SELECT kcu.column_name AS col
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON kcu.constraint_name = tc.constraint_name
          AND kcu.table_name = tc.table_name
         WHERE tc.table_name = $1 AND tc.constraint_type = 'PRIMARY KEY'`,
        [CALL_LOGS_TABLE],
    );
    const cols = rows.map((r: any) => String(r.col).toLowerCase());
    return CALL_LOG_IDENTITY_PK_COLUMNS.every((c) => cols.includes(c.toLowerCase()));
}

async function postgresColumnIsNullableOnConnection(
    client: PostgresClientLike,
    column: string
): Promise<boolean> {
    const { rows } = await client.query(
        `SELECT is_nullable FROM information_schema.columns
         WHERE table_name = $1 AND column_name = $2`,
        [CALL_LOGS_TABLE, column],
    );
    return rows[0]?.is_nullable === 'YES';
}

// 'absent' | 'valid' | 'invalid' - an INVALID index is the residue of a
// CONCURRENTLY build that was interrupted (process killed, connection dropped).
async function postgresIdentityIndexState(client: PostgresClientLike): Promise<'absent' | 'valid' | 'invalid'> {
    const { rows } = await client.query(
        `SELECT (i.indisvalid AND i.indisready) AS ok
         FROM pg_class c
         JOIN pg_index i ON i.indexrelid = c.oid
         WHERE c.relname = $1`,
        [IDENTITY_INDEX_NAME],
    );
    if (rows.length === 0) return 'absent';
    return rows[0].ok ? 'valid' : 'invalid';
}

/**
 * Online (non-blocking) Postgres migration.
 *
 * Adds the hashedExtensionId column and rebuilds the primary key to the call-log
 * identity WITHOUT holding an ACCESS EXCLUSIVE lock for the duration of the index
 * build. This is the safe path for large production tables:
 *   - ADD COLUMN ... NOT NULL DEFAULT '' is metadata-only on PG 11+.
 *   - CREATE UNIQUE INDEX CONCURRENTLY builds the index while reads/writes continue.
 *   - ADD PRIMARY KEY USING INDEX attaches the prebuilt index with only a brief lock.
 *
 * Runs on a single dedicated pooled connection so the advisory lock and the
 * (necessarily non-transactional) CONCURRENTLY statements share one backend session.
 */
async function ensureCallLogsHashedExtensionIdSchemaPostgresOnline(
    sequelize: SequelizeLike,
    logger?: MigrationLogger
): Promise<void> {
    // Cheap pre-check on a pooled connection; skip entirely once migrated.
    if (await postgresCallLogsPkIncludesHashedExtension(sequelize)) {
        return;
    }

    const connectionManager = sequelize.connectionManager;
    const client = await connectionManager.getConnection({ type: 'write' });
    let lockAcquired = false;
    try {
        const lockRes = await client.query(
            `SELECT pg_try_advisory_lock(${CALL_LOGS_MIGRATION_LOCK_KEY}) AS locked`,
        );
        lockAcquired = lockRes.rows[0]?.locked === true;
        if (!lockAcquired) {
            logger?.info?.('[callLogs migration] another instance is migrating; skipping this run');
            return;
        }

        // Re-check under the lock - another instance may have finished between the
        // pre-check and acquiring the lock.
        if (await postgresPkIncludesIdentityOnConnection(client)) {
            return;
        }

        logger?.info?.('[callLogs migration] starting online migration (add column + rebuild primary key)');

        // A server-side statement_timeout (common in RDS parameter groups) would abort
        // the long CONCURRENTLY build and leave an INVALID index. Disable it for this
        // session only; it is reset before the connection returns to the pool.
        await client.query(`SET statement_timeout = 0`);

        // 1. Add the column (metadata-only on PG 11+, safe to repeat).
        await client.query(
            `ALTER TABLE "${CALL_LOGS_TABLE}" ADD COLUMN IF NOT EXISTS "${HASHED_EXTENSION_ID_COLUMN}" varchar(255) NOT NULL DEFAULT ''`,
        );

        // 2. Primary-key columns must be NOT NULL. Only touch extensionNumber if needed.
        if (await postgresColumnIsNullableOnConnection(client, 'extensionNumber')) {
            await client.query(
                `UPDATE "${CALL_LOGS_TABLE}" SET "extensionNumber" = '' WHERE "extensionNumber" IS NULL`,
            );
            await client.query(
                `ALTER TABLE "${CALL_LOGS_TABLE}" ALTER COLUMN "extensionNumber" SET NOT NULL`,
            );
        }

        // 3. Build the unique index without blocking traffic (cannot run in a transaction).
        //    Reuse an already-valid index from a prior run so a failed *attach* (step 4)
        //    never forces us to redo the expensive build; only rebuild if it is missing
        //    or was left INVALID by an interrupted run.
        const indexState = await postgresIdentityIndexState(client);
        if (indexState === 'invalid') {
            await client.query(`DROP INDEX CONCURRENTLY IF EXISTS "${IDENTITY_INDEX_NAME}"`);
        }
        if (indexState !== 'valid') {
            await client.query(
                `CREATE UNIQUE INDEX CONCURRENTLY "${IDENTITY_INDEX_NAME}" ON "${CALL_LOGS_TABLE}" (${CALL_LOG_IDENTITY_PK_COLUMNS.map((c) => `"${c}"`).join(', ')})`,
            );
        }

        // 4. Swap the primary key onto the prebuilt index (brief ACCESS EXCLUSIVE lock,
        //    no rebuild). Bound the lock wait so that if a long-running query holds the
        //    table we fail fast and retry next boot, instead of parking an exclusive-lock
        //    request at the head of the queue and stalling all traffic behind it.
        await client.query(`SET lock_timeout = '5s'`);
        const pkName = await postgresPrimaryKeyNameOnConnection(client);
        if (pkName) {
            await client.query(
                `ALTER TABLE "${CALL_LOGS_TABLE}" DROP CONSTRAINT "${pkName}", ADD PRIMARY KEY USING INDEX "${IDENTITY_INDEX_NAME}"`,
            );
        } else {
            await client.query(
                `ALTER TABLE "${CALL_LOGS_TABLE}" ADD PRIMARY KEY USING INDEX "${IDENTITY_INDEX_NAME}"`,
            );
        }

        logger?.info?.('[callLogs migration] completed');
    } finally {
        // Restore session defaults before the connection goes back to the pool, so no
        // other query inherits statement_timeout=0 / the short lock_timeout.
        try {
            await client.query('RESET statement_timeout');
            await client.query('RESET lock_timeout');
        } catch (e) {
            const error = e as any;
            logger?.warn?.('[callLogs migration] failed to reset session settings', { message: error?.message });
        }
        if (lockAcquired) {
            try {
                await client.query(`SELECT pg_advisory_unlock(${CALL_LOGS_MIGRATION_LOCK_KEY})`);
            } catch (e) {
                const error = e as any;
                logger?.warn?.('[callLogs migration] failed to release advisory lock', { message: error?.message });
            }
        }
        connectionManager.releaseConnection(client);
    }
}

/**
 * Automatic entry point. Safe to call fire-and-forget off the startup critical path:
 * it never throws (failures are logged and retried on the next boot) and, on Postgres,
 * never blocks readiness or live traffic.
 */
async function runCallLogsSchemaMigration(
    sequelize: SequelizeLike,
    logger?: MigrationLogger
): Promise<void> {
    try {
        const dialect = sequelize.getDialect();
        if (dialect === 'postgres') {
            await ensureCallLogsHashedExtensionIdSchemaPostgresOnline(sequelize, logger);
        } else {
            // sqlite / local / tests: tables are tiny, the transactional rebuild is instant.
            await ensureCallLogsHashedExtensionIdSchema(sequelize);
        }
    } catch (e) {
        const error = e as any;
        logger?.error?.('[callLogs migration] failed; will retry on next start', {
            message: error?.message,
            stack: error?.stack,
        });
    }
}

export {
    findColumnKey,
    migrateCallLogsExtensionNumberSqlite,
    migrateCallLogsIdentitySqlite,
    sqliteCallLogsPkIncludesExtension,
    sqliteCallLogsPkIncludesHashedExtension,
    ensureCallLogsHashedExtensionIdSchema,
    ensureCallLogsHashedExtensionIdSchemaPostgresOnline,
    runCallLogsSchemaMigration
};
