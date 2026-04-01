const connectorRegistry = require('../connector/registry');
const developerPortal = require('../connector/developerPortal');
const { AccountDataModel } = require('../models/accountDataModel');
const { encode, decoded } = require('../lib/encode');

const SHARED_AUTH_ORG_DATA_KEY = 'shared-auth-org';
const SHARED_AUTH_USER_DATA_KEY = 'shared-auth-user';

function isFilled(value) {
    return value !== undefined && value !== null && value !== '';
}

async function getApiKeyFieldDefinitions({ platform, connectorId, isPrivate = false }) {
    if (!platform) {
        return [];
    }
    if (connectorId) {
        const manifest = await developerPortal.getConnectorManifest({ connectorId, isPrivate });
        if (manifest?.platforms?.[platform]?.auth?.apiKey?.page?.content) {
            return manifest.platforms[platform].auth.apiKey.page.content;
        }
    }
    try {
        const manifest = connectorRegistry.getManifest(platform, true);
        return manifest?.platforms?.[platform]?.auth?.apiKey?.page?.content ?? [];
    }
    catch (error) {
        return [];
    }
}

async function getSharedFieldDefinitions({ platform, connectorId, isPrivate = false }) {
    const fieldDefinitions = await getApiKeyFieldDefinitions({ platform, connectorId, isPrivate });
    return fieldDefinitions.filter(field => field?.shared);
}

function encryptStoredValue(value) {
    return {
        version: 1,
        encrypted: true,
        value: encode(JSON.stringify(value))
    };
}

function decryptStoredValue(value) {
    if (!value) {
        return undefined;
    }
    if (value?.encrypted && value?.value) {
        return JSON.parse(decoded(value.value));
    }
    return value;
}

async function getSharedAuthRecord({ rcAccountId, platform, dataKey }) {
    if (!rcAccountId || !platform) {
        return null;
    }
    return AccountDataModel.findOne({
        where: {
            rcAccountId,
            platformName: platform,
            dataKey
        }
    });
}

async function getOrgSharedAuthValues({ rcAccountId, platform }) {
    const record = await getSharedAuthRecord({
        rcAccountId,
        platform,
        dataKey: SHARED_AUTH_ORG_DATA_KEY
    });
    const fields = record?.data?.fields ?? {};
    const decryptedFields = {};
    Object.keys(fields).forEach(key => {
        decryptedFields[key] = decryptStoredValue(fields[key]);
    });
    return decryptedFields;
}

async function getUserSharedAuthValues({ rcAccountId, platform, rcExtensionId }) {
    if (!rcExtensionId) {
        return {};
    }
    const record = await getSharedAuthRecord({
        rcAccountId,
        platform,
        dataKey: SHARED_AUTH_USER_DATA_KEY
    });
    const fields = record?.data?.users?.[rcExtensionId]?.fields ?? {};
    const decryptedFields = {};
    Object.keys(fields).forEach(key => {
        decryptedFields[key] = decryptStoredValue(fields[key]);
    });
    return decryptedFields;
}

async function upsertOrgSharedAuthValues({ rcAccountId, platform, values = {}, fieldsToRemove = [] }) {
    const existingRecord = await getSharedAuthRecord({
        rcAccountId,
        platform,
        dataKey: SHARED_AUTH_ORG_DATA_KEY
    });
    const nextFields = {
        ...(existingRecord?.data?.fields ?? {})
    };

    Object.keys(values).forEach(key => {
        if (isFilled(values[key])) {
            nextFields[key] = encryptStoredValue(values[key]);
        }
    });
    fieldsToRemove.forEach(key => {
        delete nextFields[key];
    });

    const nextData = {
        fields: nextFields
    };

    if (existingRecord) {
        await existingRecord.update({ data: nextData });
        return existingRecord;
    }
    return AccountDataModel.create({
        rcAccountId,
        platformName: platform,
        dataKey: SHARED_AUTH_ORG_DATA_KEY,
        data: nextData
    });
}

async function upsertUserSharedAuthValues({ rcAccountId, platform, rcExtensionId, rcUserName, values = {}, fieldsToRemove = [] }) {
    if (!rcExtensionId) {
        throw new Error('rcExtensionId is required for user shared auth values');
    }
    const existingRecord = await getSharedAuthRecord({
        rcAccountId,
        platform,
        dataKey: SHARED_AUTH_USER_DATA_KEY
    });
    const nextUsers = {
        ...(existingRecord?.data?.users ?? {})
    };
    const existingUser = nextUsers[rcExtensionId] ?? {
        rcExtensionId,
        rcUserName: rcUserName ?? '',
        fields: {}
    };
    const nextFields = {
        ...(existingUser.fields ?? {})
    };

    Object.keys(values).forEach(key => {
        if (isFilled(values[key])) {
            nextFields[key] = encryptStoredValue(values[key]);
        }
    });
    fieldsToRemove.forEach(key => {
        delete nextFields[key];
    });

    nextUsers[rcExtensionId] = {
        rcExtensionId,
        rcUserName: rcUserName ?? existingUser.rcUserName ?? '',
        fields: nextFields
    };

    const nextData = {
        users: nextUsers
    };

    if (existingRecord) {
        await existingRecord.update({ data: nextData });
        return existingRecord;
    }
    return AccountDataModel.create({
        rcAccountId,
        platformName: platform,
        dataKey: SHARED_AUTH_USER_DATA_KEY,
        data: nextData
    });
}

function getMaskedFieldValue({ fieldDefinition, value }) {
    if (!isFilled(value)) {
        return {
            hasValue: false,
            value: '',
            confidential: !!fieldDefinition?.confidential
        };
    }
    return {
        hasValue: true,
        value,
        confidential: false
    };
}

async function getSharedAuthAdminSettings({ platform, rcAccountId, connectorId, isPrivate = false }) {
    const fieldDefinitions = await getSharedFieldDefinitions({ platform, connectorId, isPrivate });
    const orgFieldDefinitions = fieldDefinitions.filter(field => field.sharedScope === 'org');
    const userFieldDefinitions = fieldDefinitions.filter(field => field.sharedScope === 'user');
    const orgValues = await getOrgSharedAuthValues({ rcAccountId, platform });
    const userRecord = await getSharedAuthRecord({
        rcAccountId,
        platform,
        dataKey: SHARED_AUTH_USER_DATA_KEY
    });
    const userEntries = Object.values(userRecord?.data?.users ?? {});

    const adminOrgValues = {};
    orgFieldDefinitions.forEach(field => {
        adminOrgValues[field.const] = getMaskedFieldValue({
            fieldDefinition: field,
            value: orgValues[field.const]
        });
    });

    const adminUserValues = userEntries.map(entry => {
        const fields = {};
        userFieldDefinitions.forEach(field => {
            fields[field.const] = getMaskedFieldValue({
                fieldDefinition: field,
                value: decryptStoredValue(entry?.fields?.[field.const])
            });
        });
        return {
            rcExtensionId: entry.rcExtensionId,
            rcUserName: entry.rcUserName ?? '',
            fields
        };
    });

    return {
        hasSharedAuth: fieldDefinitions.length > 0,
        fields: fieldDefinitions,
        orgFields: orgFieldDefinitions,
        userFields: userFieldDefinitions,
        orgValues: adminOrgValues,
        userValues: adminUserValues
    };
}

async function getSharedAuthState({ platform, rcAccountId, rcExtensionId, connectorId, isPrivate = false }) {
    const fieldDefinitions = await getApiKeyFieldDefinitions({ platform, connectorId, isPrivate });
    const sharedFieldDefinitions = fieldDefinitions.filter(field => field?.shared);
    const orgValues = await getOrgSharedAuthValues({ rcAccountId, platform });
    const userValues = await getUserSharedAuthValues({ rcAccountId, platform, rcExtensionId });

    const visibleFieldConsts = [];
    const missingRequiredFieldConsts = [];
    let allRequiredFieldsSatisfied = true;

    fieldDefinitions.forEach(field => {
        const storedValue = field.shared
            ? (field.sharedScope === 'user' ? userValues[field.const] : orgValues[field.const])
            : undefined;
        const hasStoredValue = isFilled(storedValue);
        if (!field.shared || !hasStoredValue) {
            visibleFieldConsts.push(field.const);
        }
        if (field.required && !hasStoredValue) {
            missingRequiredFieldConsts.push(field.const);
            allRequiredFieldsSatisfied = false;
        }
        if (field.required && !field.shared) {
            allRequiredFieldsSatisfied = false;
        }
    });

    return {
        hasSharedAuth: sharedFieldDefinitions.length > 0,
        allRequiredFieldsSatisfied,
        visibleFieldConsts,
        missingRequiredFieldConsts
    };
}

async function resolveApiKeyLoginFields({ platform, rcAccountId, rcExtensionId, connectorId, isPrivate = false, apiKey, additionalInfo = {} }) {
    const fieldDefinitions = await getApiKeyFieldDefinitions({ platform, connectorId, isPrivate });
    const resolvedAdditionalInfo = {
        ...(additionalInfo ?? {})
    };
    if (resolvedAdditionalInfo.apiKey === undefined && apiKey !== undefined) {
        resolvedAdditionalInfo.apiKey = apiKey;
    }

    const orgValues = await getOrgSharedAuthValues({ rcAccountId, platform });
    const userValues = await getUserSharedAuthValues({ rcAccountId, platform, rcExtensionId });
    const submittedSharedValues = {
        org: {},
        user: {}
    };
    const missingRequiredFieldConsts = [];

    fieldDefinitions.forEach(field => {
        if (!field?.shared) {
            if (field.required && !isFilled(resolvedAdditionalInfo[field.const])) {
                missingRequiredFieldConsts.push(field.const);
            }
            return;
        }

        const submittedValue = resolvedAdditionalInfo[field.const];
        const storedValue = field.sharedScope === 'user'
            ? userValues[field.const]
            : orgValues[field.const];

        if (!isFilled(submittedValue) && isFilled(storedValue)) {
            resolvedAdditionalInfo[field.const] = storedValue;
        }

        if (isFilled(submittedValue)) {
            if (submittedSharedValues[field.sharedScope]) {
                submittedSharedValues[field.sharedScope][field.const] = submittedValue;
            }
        }

        if (field.required && !isFilled(resolvedAdditionalInfo[field.const])) {
            missingRequiredFieldConsts.push(field.const);
        }
    });

    return {
        resolvedAdditionalInfo,
        resolvedApiKey: resolvedAdditionalInfo.apiKey ?? apiKey,
        missingRequiredFieldConsts,
        submittedSharedValues
    };
}

async function persistSubmittedSharedValues({ platform, rcAccountId, rcExtensionId, rcUserName, submittedSharedValues = {} }) {
    if (!rcAccountId) {
        return;
    }
    if (Object.keys(submittedSharedValues.org ?? {}).length > 0) {
        await upsertOrgSharedAuthValues({
            rcAccountId,
            platform,
            values: submittedSharedValues.org
        });
    }
    if (rcExtensionId && Object.keys(submittedSharedValues.user ?? {}).length > 0) {
        await upsertUserSharedAuthValues({
            rcAccountId,
            platform,
            rcExtensionId,
            rcUserName,
            values: submittedSharedValues.user
        });
    }
}

exports.SHARED_AUTH_ORG_DATA_KEY = SHARED_AUTH_ORG_DATA_KEY;
exports.SHARED_AUTH_USER_DATA_KEY = SHARED_AUTH_USER_DATA_KEY;
exports.getApiKeyFieldDefinitions = getApiKeyFieldDefinitions;
exports.getSharedFieldDefinitions = getSharedFieldDefinitions;
exports.getSharedAuthAdminSettings = getSharedAuthAdminSettings;
exports.getSharedAuthState = getSharedAuthState;
exports.resolveApiKeyLoginFields = resolveApiKeyLoginFields;
exports.persistSubmittedSharedValues = persistSubmittedSharedValues;
exports.upsertOrgSharedAuthValues = upsertOrgSharedAuthValues;
exports.upsertUserSharedAuthValues = upsertUserSharedAuthValues;
