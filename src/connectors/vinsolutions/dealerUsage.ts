import { cast, col, json, Op, where } from 'sequelize';
import { AccountDataModel } from '@app-connect/core/models/accountDataModel';
import { UserModel } from '@app-connect/core/models/userModel';

// Core requires accessToken to be set. VinSolutions credentials live in platformAdditionalInfo.
export const CONNECTED_SENTINEL = 'vinsolutions-connected';

const connectionScope = { rcAccountId: 'support', platformName: 'vinsolutions' };
const connectionKeyPrefix = 'support-last-connected:';
const lastConnectedAtField = cast(json('data.lastConnectedAt'), 'TEXT');

type DealerUsage = {
    rcAccountIds: string[];
    connectedUserCount: number;
    lastConnectedAt: string | null;
};

export async function recordDealerConnection(dealerId: string, connectedAt: Date) {
    const key = { ...connectionScope, dataKey: connectionKeyPrefix + dealerId };
    const data = { lastConnectedAt: connectedAt.toISOString() };
    // ISO timestamps sort chronologically, so delayed writes cannot replace newer events.
    await AccountDataModel.bulkCreate([{ ...key, data }], { ignoreDuplicates: true });
    await AccountDataModel.update({ data }, {
        where: {
            ...key,
            [Op.and]: where(lastConnectedAtField, { [Op.lt]: data.lastConnectedAt }),
        },
    });
}

export async function listDealerUsage(dealerIds: string[]) {
    const usage = new Map<string, DealerUsage>();
    for (const id of dealerIds) {
        usage.set(id, { rcAccountIds: [], connectedUserCount: 0, lastConnectedAt: null });
    }
    if (usage.size === 0) return usage;

    const dealerIdField = cast(json('platformAdditionalInfo.dealerId'), 'TEXT');
    const [users, connections] = await Promise.all([
        UserModel.findAll({
            attributes: [
                [dealerIdField, 'dealerId'],
                'rcAccountId',
                [where(col('accessToken'), Op.eq, CONNECTED_SENTINEL), 'connected'],
            ],
            where: { platform: 'vinsolutions', [Op.and]: where(dealerIdField, { [Op.in]: dealerIds }) },
            raw: true,
        }),
        AccountDataModel.findAll({
            attributes: ['dataKey', [lastConnectedAtField, 'lastConnectedAt']],
            where: { ...connectionScope, dataKey: { [Op.in]: dealerIds.map(id => connectionKeyPrefix + id) } },
            raw: true,
        }),
    ]);

    for (const user of users) {
        const dealer = usage.get(user.dealerId);
        if (!dealer) continue;
        // VinSolutions user records are keyed by CRM user ID and dealer ID.
        if (user.connected) dealer.connectedUserCount++;
        const accountId = user.rcAccountId;
        if (typeof accountId === 'string' && /^[1-9][0-9]*$/.test(accountId) && !dealer.rcAccountIds.includes(accountId)) {
            dealer.rcAccountIds.push(accountId);
        }
    }
    for (const connection of connections) {
        const dealer = usage.get(connection.dataKey.slice(connectionKeyPrefix.length));
        if (dealer) dealer.lastConnectedAt = connection.lastConnectedAt;
    }
    for (const dealer of usage.values()) {
        dealer.rcAccountIds.sort();
    }
    return usage;
}
