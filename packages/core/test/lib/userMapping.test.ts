const {
    findMappedCrmUserId,
    findMappedCrmUserIdBySubmission,
    getMappingRcExtensionIds,
    getMappingRcxAgentIds,
    getStoredRcxAgentIdsByExtensionId,
    mergeRcxAgentIds,
    normalizeAgentIds,
} = require('../../lib/userMapping');

describe('userMapping lib', () => {
    const userMappings = [
        { crmUserId: 'crm-legacy', rcExtensionId: '100' },
        { crmUserId: 'crm-1', rcExtensionId: ['101', '102'], rcxAgentIds: { '101': ['9001'], '102': ['9002', '9003'] } },
        { crmUserId: 'crm-2', rcExtensionId: ['201'] },
    ];

    describe('findMappedCrmUserId', () => {
        test('finds the CRM user by RC extension ID in array and legacy string mappings', () => {
            expect(findMappedCrmUserId({ userMappings, rcExtensionId: '102' })).toBe('crm-1');
            expect(findMappedCrmUserId({ userMappings, rcExtensionId: '100' })).toBe('crm-legacy');
            expect(findMappedCrmUserId({ userMappings, rcExtensionId: 201 })).toBe('crm-2');
        });

        test('falls back to the RingCX agent ID when the RC extension is unknown or unmapped', () => {
            expect(findMappedCrmUserId({ userMappings, rcxAgentId: '9003' })).toBe('crm-1');
            expect(findMappedCrmUserId({ userMappings, rcExtensionId: '999', rcxAgentId: 9001 })).toBe('crm-1');
        });

        test('prefers the RC extension match over the RingCX agent match', () => {
            expect(findMappedCrmUserId({ userMappings, rcExtensionId: '201', rcxAgentId: '9001' })).toBe('crm-2');
        });

        test('returns undefined when nothing matches or input is missing', () => {
            expect(findMappedCrmUserId({ userMappings, rcExtensionId: '999', rcxAgentId: '1' })).toBeUndefined();
            expect(findMappedCrmUserId({ userMappings })).toBeUndefined();
            expect(findMappedCrmUserId({ userMappings: null, rcExtensionId: '101' })).toBeUndefined();
        });

        test('ignores malformed mappings instead of throwing', () => {
            const malformed = [
                null,
                { crmUserId: 'no-extension' },
                { crmUserId: 'bad-agents', rcExtensionId: [], rcxAgentIds: ['9001'] },
                { crmUserId: 'crm-ok', rcExtensionId: ['5'], rcxAgentIds: { '5': 'not-an-array' } },
            ];
            expect(findMappedCrmUserId({ userMappings: malformed, rcExtensionId: '5' })).toBe('crm-ok');
            expect(findMappedCrmUserId({ userMappings: malformed, rcxAgentId: '9001' })).toBeUndefined();
        });
    });

    test('findMappedCrmUserIdBySubmission reads adminAssignedUserRcId then adminAssignedUserRcxAgentId', () => {
        expect(findMappedCrmUserIdBySubmission(userMappings, { adminAssignedUserRcId: '101' })).toBe('crm-1');
        expect(findMappedCrmUserIdBySubmission(userMappings, { adminAssignedUserRcxAgentId: '9002' })).toBe('crm-1');
        expect(findMappedCrmUserIdBySubmission(userMappings, null)).toBeUndefined();
    });

    test('helpers normalize stored IDs', () => {
        expect(getMappingRcExtensionIds({ rcExtensionId: 101 })).toEqual(['101']);
        expect(getMappingRcExtensionIds({})).toEqual([]);
        expect(getMappingRcxAgentIds(userMappings[1])).toEqual(['9001', '9002', '9003']);
        expect(normalizeAgentIds([9001, '9001', '', null, ' 9002 '])).toEqual(['9001', '9002']);
        expect(normalizeAgentIds('9001')).toEqual([]);
    });

    describe('mergeRcxAgentIds', () => {
        const stored = [
            { crmUserId: 'crm-1', rcExtensionId: ['101', '102'], rcxAgentIds: { '101': ['9001'], '102': ['9002'] } },
            { crmUserId: 'crm-2', rcExtensionId: ['201'], rcxAgentIds: { '201': ['9201'] } },
        ];

        test('keeps stored agent IDs of still-mapped extensions on writes without rcxAgentIds', () => {
            expect(mergeRcxAgentIds([
                { crmUserId: 'crm-1', rcExtensionId: ['101'] },
                { crmUserId: 'crm-2', rcExtensionId: ['201'] },
                { crmUserId: 'crm-3', rcExtensionId: [] },
            ], stored)).toEqual([
                { crmUserId: 'crm-1', rcExtensionId: ['101'], rcxAgentIds: { '101': ['9001'] } },
                { crmUserId: 'crm-2', rcExtensionId: ['201'], rcxAgentIds: { '201': ['9201'] } },
                { crmUserId: 'crm-3', rcExtensionId: [] },
            ]);
        });

        test('moves agent IDs with an extension mapped to another CRM user', () => {
            expect(mergeRcxAgentIds([
                { crmUserId: 'crm-3', rcExtensionId: ['102'] },
            ], stored)).toEqual([
                { crmUserId: 'crm-3', rcExtensionId: ['102'], rcxAgentIds: { '102': ['9002'] } },
            ]);
        });

        test('uses explicit agent IDs per extension and clears them with an empty array or null', () => {
            expect(mergeRcxAgentIds([
                { crmUserId: 'crm-1', rcExtensionId: ['101', '102'], rcxAgentIds: { '101': ['9005', 9005], '102': [] } },
                { crmUserId: 'crm-2', rcExtensionId: ['201'], rcxAgentIds: null },
            ], stored)).toEqual([
                { crmUserId: 'crm-1', rcExtensionId: ['101', '102'], rcxAgentIds: { '101': ['9005'] } },
                { crmUserId: 'crm-2', rcExtensionId: ['201'] },
            ]);
        });

        test('keeps stored agent IDs for extensions missing from a partial rcxAgentIds', () => {
            expect(mergeRcxAgentIds([
                { crmUserId: 'crm-1', rcExtensionId: ['101', '102'], rcxAgentIds: { '101': ['9005'] } },
            ], stored)).toEqual([
                { crmUserId: 'crm-1', rcExtensionId: ['101', '102'], rcxAgentIds: { '101': ['9005'], '102': ['9002'] } },
            ]);
        });

        test('drops agent IDs of unmapped extensions and handles legacy string extension IDs', () => {
            expect(mergeRcxAgentIds([
                { crmUserId: 'crm-1', rcExtensionId: '101', rcxAgentIds: { '999': ['1'] } },
            ], stored)).toEqual([
                { crmUserId: 'crm-1', rcExtensionId: '101', rcxAgentIds: { '101': ['9001'] } },
            ]);
            expect(mergeRcxAgentIds([{ crmUserId: 'crm-1', rcExtensionId: ['101'] }], null)).toEqual([
                { crmUserId: 'crm-1', rcExtensionId: ['101'] },
            ]);
        });

        test('collects stored agent IDs by extension', () => {
            expect(getStoredRcxAgentIdsByExtensionId([
                ...stored,
                { crmUserId: 'crm-dup', rcExtensionId: ['101'], rcxAgentIds: { '101': ['9001', '9009'] } },
                null,
                { crmUserId: 'crm-bad', rcxAgentIds: ['x'] },
            ])).toEqual({ '101': ['9001', '9009'], '102': ['9002'], '201': ['9201'] });
            expect(getStoredRcxAgentIdsByExtensionId(undefined)).toEqual({});
        });
    });
});
