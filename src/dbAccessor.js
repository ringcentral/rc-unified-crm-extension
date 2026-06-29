
const { sequelize } = require('@app-connect/core/models/sequelize');
const logger = require('@app-connect/core/lib/logger');
const { UserModel } = require('@app-connect/core/models/userModel');
const { Op } = require('sequelize');
const { where, json } = require('sequelize');
// require('dotenv').config();
async function executeQuery(input) {
    try {
        if (input.dbQuery === 'migrate') {
            await migration()
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
        // const ausUsers = await UserModel.findAll({
        //     where: {
        //         platform: 'bullhorn',
        //         [Op.and]: where(json('platformAdditionalInfo.tokenUrl'), {
        //             [Op.like]: 'https://auth-aus%'
        //         })
        //     }
        // });
        // logger.info(`Found ${ausUsers.length} bullhorn AUS users`);
        // logger.info(JSON.stringify(ausUsers.map(user => user.id), null, 2));
        // for (const user of ausUsers) {
        //     const platformAdditionalInfo = {
        //         ...user.platformAdditionalInfo,
        //         tokenUrl: user.platformAdditionalInfo.tokenUrl.replace('-aus', '-syd'),
        //         loginUrl: user.platformAdditionalInfo.loginUrl.replace('-aus', '-syd'),
        //         restUrl: user.platformAdditionalInfo.restUrl.replace('-aus', '-syd'),
        //     };
        //     user.set('platformAdditionalInfo', platformAdditionalInfo);
        //     user.changed('platformAdditionalInfo', true);
        //     console.log(user.platformAdditionalInfo);
        //     await user.save({ fields: ['platformAdditionalInfo'] });
        //     logger.info(`Updated user ${user.id} with new token URL`);
        // }
        const singaporeUsers = await UserModel.findAll({
            where: {
                platform: 'bullhorn',
                [Op.and]: where(json('platformAdditionalInfo.tokenUrl'), {
                    [Op.like]: 'https://auth-apac%'
                })
            }
        });
        logger.info(`Found ${singaporeUsers.length} bullhorn APAC users`);
        logger.info(JSON.stringify(singaporeUsers.map(user => user.id), null, 2));
        for (const user of singaporeUsers) {
            const platformAdditionalInfo = {
                ...user.platformAdditionalInfo,
                tokenUrl: user.platformAdditionalInfo.tokenUrl.replace('-apac', '-syd'),
                loginUrl: user.platformAdditionalInfo.loginUrl.replace('-apac', '-syd'),
                restUrl: user.platformAdditionalInfo.restUrl.replace('-apac', '-syd'),
            };
            user.set('platformAdditionalInfo', platformAdditionalInfo);
            user.changed('platformAdditionalInfo', true);
            console.log(user.platformAdditionalInfo);
            await user.save({ fields: ['platformAdditionalInfo'] });
            logger.info(`Updated user ${user.id} with new token URL`);
        }
    } catch (error) {
        console.error('Migration failed:', error);
        process.exitCode = 1;
    }
}


exports.app = executeQuery;
