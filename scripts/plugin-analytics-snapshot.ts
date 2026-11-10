// Read-only database export; run against an explicitly configured deployment.
import { writeFileSync } from 'fs';
import { buildPluginInventory } from '../packages/core/lib/pluginInventory';
const { AccountDataModel } = require('../packages/core/models/accountDataModel');
const { sequelize } = require('../packages/core/models/sequelize');

async function main() {
    const output = process.argv[2];
    if (!output) throw new Error('Usage: node .ts-build/scripts/plugin-analytics-snapshot.js <output.json>');
    if (!process.env.HASH_KEY) throw new Error('HASH_KEY is required');
    try {
        const rows = await AccountDataModel.findAll({ where: { dataKey: 'pluginData' }, raw: true });
        writeFileSync(output, JSON.stringify(buildPluginInventory(rows, process.env.HASH_KEY), null, 2), { flag: 'wx' });
        console.log(`Exported ${rows.length} installation records`);
    } finally {
        await sequelize.close();
    }
}
main().catch(() => { console.error('Plugin inventory export failed; check database configuration and output path'); process.exitCode = 1; });
