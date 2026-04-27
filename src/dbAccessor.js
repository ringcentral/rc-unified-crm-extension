// require('dotenv').config();
const { sequelize } = require('@app-connect/core/models/sequelize');
const logger = require('@app-connect/core/lib/logger');
const { AdminConfigModel } = require('@app-connect/core/models/adminConfigModel');
const { getHashValue } = require('@app-connect/core/lib/util');
const { Op } = require('sequelize');
const { where, fn, col } = require('sequelize');

async function executeQuery(input) {
    try {
        if (input.dbQuery === 'migrate dry') {
            await migration({ dryRun: true, threshold: 20 })
            return;
        }
        else if (input.dbQuery === 'migrate') {
            await migration({ dryRun: false, threshold: 20 })
            return;
        }
        logger.info(input.dbQuery);
        const result = await sequelize.query(input.dbQuery);
        logger.info(JSON.stringify(result, null, 2));
    }
    catch (e) {
        logger.error(e.message);
    }
}

async function migration(options) {
    try {
        await migrateUnhashedData(options);
        console.log(`Migration completed successfully${options.dryRun ? ' (dry run only)' : ''}.`);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exitCode = 1;
    }
}

function getIdLengthExpression() {
    const dialect = sequelize.getDialect();
    const lengthFnName = dialect === 'sqlite' ? 'length' : 'char_length';
    return fn(lengthFnName, col('id'));
}

async function migrateUnhashedData({ dryRun, threshold }) {
    if (!process.env.DATABASE_URL) {
        throw new Error('DATABASE_URL is required');
    }
    if (!process.env.HASH_KEY) {
        throw new Error('HASH_KEY is required');
    }

    const unhashedItems = await AdminConfigModel.findAll({
        where: where(getIdLengthExpression(), {
            [Op.lt]: threshold,
        }),
        order: [['id', 'ASC']],
    });

    console.log(`Found ${unhashedItems.length} adminConfig record(s) with id length < ${threshold}.`);

    for (const item of unhashedItems) {
        const oldId = item.id;
        const hashedId = getHashValue(oldId, process.env.HASH_KEY);

        if (oldId === hashedId) {
            console.log(`Skipping ${oldId}: id is already hashed.`);
            continue;
        }

        const transaction = dryRun ? null : await sequelize.transaction();

        try {
            const existingRecord = await AdminConfigModel.findByPk(hashedId, { transaction });

            if (existingRecord) {
                if (dryRun) {
                    console.log(`[dry-run] Would merge ${oldId} into existing record ${hashedId}`);
                } else {
                    await existingRecord.update({
                        adminAccessToken: item.adminAccessToken,
                        adminRefreshToken: item.adminRefreshToken,
                        adminTokenExpiry: item.adminTokenExpiry,
                    }, { transaction });
                    await item.destroy({ transaction });
                    await transaction.commit();
                    console.log(`Merged ${oldId} into existing record ${hashedId} and deleted original.`);
                }
            } else {
                const plainData = item.get({ plain: true });
                const newData = {
                    ...plainData,
                    id: hashedId,
                };

                if (dryRun) {
                    console.log(`[dry-run] Would create ${hashedId} from ${oldId} and delete original.`);
                } else {
                    await AdminConfigModel.create(newData, { transaction });
                    await item.destroy({ transaction });
                    await transaction.commit();
                    console.log(`Created hashed record ${hashedId} from ${oldId} and deleted original.`);
                }
            }
        } catch (error) {
            if (transaction) {
                await transaction.rollback();
            }
            throw new Error(`Failed to migrate adminConfig ${oldId}: ${error.message}`);
        }
    }
}

exports.app = executeQuery;