const connectorRegistry = require('../connector/registry');
const developerPortal = require('../connector/developerPortal');
const { AccountDataModel } = require('../models/accountDataModel');
const { Op } = require('sequelize');
const { encode, decoded } = require('../lib/encode');

const MANAGED_AUTH_ORG_DATA_KEY = 'managed-auth-org';
const MANAGED_AUTH_USER_DATA_KEY = 'managed-auth-user';
const MANAGED_AUTH_LOGIN_FAILURE_DATA_KEY = 'managed-auth-login-failure';

function getUserManagedAuthDataKey({ rcExtensionId }) {
    return `${MANAGED_AUTH_USER_DATA_KEY}:${rcExtensionId}`;
}

function getManagedAuthLoginFailureDataKey({ rcExtensionId }) {
    return `${MANAGED_AUTH_LOGIN_FAILURE_DATA_KEY}:${rcExtensionId}`;
}

function isFilled(value) {
    return value !== undefined && value !== null && value !== '';
}

async function getApiKeyFieldDefinitions({ rcAccountId, platform, connectorId, isPrivate = false }) {
    if (!platform) {
        return [];
    }
    if (connectorId) {
        const manifest = await developerPortal.getConnectorManifest({ rcAccountId, connectorId, isPrivate });
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

async function getManagedFieldDefinitions({ rcAccountId, platform, connectorId, isPrivate = false }) {
    const fieldDefinitions = await getApiKeyFieldDefinitions({ rcAccountId, platform, connectorId, isPrivate });
    return fieldDefinitions.filter(field => field?.managed);
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

async function getManagedAuthRecord({ rcAccountId, platform, dataKey }) {
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

async function getOrgManagedAuthValues({ rcAccountId, platform }) {
    const record = await getManagedAuthRecord({
        rcAccountId,
        platform,
        dataKey: MANAGED_AUTH_ORG_DATA_KEY
    });
    const fields = record?.data?.fields ?? {};
    const decryptedFields = {};
    Object.keys(fields).forEach(key => {
        decryptedFields[key] = decryptStoredValue(fields[key]);
    });
    return decryptedFields;
}

async function getUserManagedAuthValues({ rcAccountId, platform, rcExtensionId }) {
    if (!rcExtensionId) {
        return {};
    }
    const userDataKey = getUserManagedAuthDataKey({ rcExtensionId });
    const scopedRecord = await getManagedAuthRecord({
        rcAccountId,
        platform,
        dataKey: userDataKey
    });
    const fields = scopedRecord?.data?.fields ?? {};
    const decryptedFields = {};
    Object.keys(fields).forEach(key => {
        decryptedFields[key] = decryptStoredValue(fields[key]);
    });
    return decryptedFields;
}

async function hasManagedAuthLoginFailure({ rcAccountId, platform, rcExtensionId }) {
    if (!rcExtensionId) {
        return false;
    }
    const record = await getManagedAuthRecord({
        rcAccountId,
        platform,
        dataKey: getManagedAuthLoginFailureDataKey({ rcExtensionId })
    });
    return !!record;
}

async function markManagedAuthLoginFailure({ rcAccountId, platform, rcExtensionId }) {
    if (!rcAccountId || !platform || !rcExtensionId) {
        return;
    }
    const dataKey = getManagedAuthLoginFailureDataKey({ rcExtensionId });
    const existingRecord = await getManagedAuthRecord({
        rcAccountId,
        platform,
        dataKey
    });
    const data = {
        failedAt: new Date().toISOString()
    };
    if (existingRecord) {
        await existingRecord.update({ data });
        return existingRecord;
    }
    return AccountDataModel.create({
        rcAccountId,
        platformName: platform,
        dataKey,
        data
    });
}

async function clearManagedAuthLoginFailure({ rcAccountId, platform, rcExtensionId }) {
    if (!rcAccountId || !platform || !rcExtensionId) {
        return 0;
    }
    return AccountDataModel.destroy({
        where: {
            rcAccountId,
            platformName: platform,
            dataKey: getManagedAuthLoginFailureDataKey({ rcExtensionId })
        }
    });
}

async function upsertOrgManagedAuthValues({ rcAccountId, platform, values = {}, fieldsToRemove = [] }) {
    const existingRecord = await getManagedAuthRecord({
        rcAccountId,
        platform,
        dataKey: MANAGED_AUTH_ORG_DATA_KEY
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
        dataKey: MANAGED_AUTH_ORG_DATA_KEY,
        data: nextData
    });
}

async function upsertUserManagedAuthValues({ rcAccountId, platform, rcExtensionId, rcUserName, values = {}, fieldsToRemove = [] }) {
    if (!rcExtensionId) {
        throw new Error('rcExtensionId is required for user managed auth values');
    }
    const userDataKey = getUserManagedAuthDataKey({ rcExtensionId });
    const existingRecord = await getManagedAuthRecord({
        rcAccountId,
        platform,
        dataKey: userDataKey
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
        rcExtensionId,
        rcUserName: rcUserName ?? existingRecord?.data?.rcUserName ?? '',
        fields: nextFields
    };

    if (existingRecord) {
        await existingRecord.update({ data: nextData });
        return existingRecord;
    }
    return AccountDataModel.create({
        rcAccountId,
        platformName: platform,
        dataKey: userDataKey,
        data: nextData
    });
}

function getStoredFieldValue({ value }) {
    if (!isFilled(value)) {
        return {
            hasValue: false,
            value: ''
        };
    }
    return {
        hasValue: true,
        value
    };
}

async function getManagedAuthAdminSettings({ platform, rcAccountId, connectorId, isPrivate = false }) {
    const fieldDefinitions = await getManagedFieldDefinitions({ rcAccountId, platform, connectorId, isPrivate });
    const orgFieldDefinitions = fieldDefinitions.filter(field => field.managedScope === 'account');
    const userFieldDefinitions = fieldDefinitions.filter(field => field.managedScope === 'user');
    const orgValues = await getOrgManagedAuthValues({ rcAccountId, platform });
    const userRecords = await AccountDataModel.findAll({
        where: {
            rcAccountId,
            platformName: platform,
            dataKey: {
                [Op.like]: `${MANAGED_AUTH_USER_DATA_KEY}:%`
            }
        }
    });
    const userEntries = userRecords
        .map(record => {
            const extensionIdFromDataKey = record.dataKey?.split(`${MANAGED_AUTH_USER_DATA_KEY}:`)?.[1];
            const rcExtensionId = record?.data?.rcExtensionId ?? extensionIdFromDataKey;
            if (!rcExtensionId) {
                return null;
            }
            return {
                rcExtensionId,
                rcUserName: record?.data?.rcUserName ?? '',
                fields: record?.data?.fields ?? {}
            };
        })
        .filter(Boolean);

    const adminOrgValues = {};
    orgFieldDefinitions.forEach(field => {
        adminOrgValues[field.const] = getStoredFieldValue({
            value: orgValues[field.const]
        });
    });

    const adminUserValues = userEntries.map(entry => {
        const fields = {};
        userFieldDefinitions.forEach(field => {
            fields[field.const] = getStoredFieldValue({
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
        hasManagedAuth: fieldDefinitions.length > 0,
        fields: fieldDefinitions,
        orgFields: orgFieldDefinitions,
        userFields: userFieldDefinitions,
        orgValues: adminOrgValues,
        userValues: adminUserValues
    };
}

async function getManagedAuthState({ platform, rcAccountId, rcExtensionId, connectorId, isPrivate = false }) {
    const fieldDefinitions = await getApiKeyFieldDefinitions({ rcAccountId, platform, connectorId, isPrivate });
    const managedFieldDefinitions = fieldDefinitions.filter(field => field?.managed);
    const orgValues = await getOrgManagedAuthValues({ rcAccountId, platform });
    const userValues = await getUserManagedAuthValues({ rcAccountId, platform, rcExtensionId });
    const hasLoginFailureFallback = await hasManagedAuthLoginFailure({ rcAccountId, platform, rcExtensionId });

    const visibleFieldConsts = [];
    const missingRequiredFieldConsts = [];
    let allRequiredFieldsSatisfied = true;

    // Default behavior for connectors without managed auth: render full API key form.
    if (managedFieldDefinitions.length === 0) {
        return {
            hasManagedAuth: false,
            allRequiredFieldsSatisfied: false,
            visibleFieldConsts: null,
            missingRequiredFieldConsts: fieldDefinitions.filter(field => field.required).map(field => field.const),
            fallbackToManualAuth: false
        };
    }

    if (hasLoginFailureFallback) {
        return {
            hasManagedAuth: true,
            allRequiredFieldsSatisfied: false,
            visibleFieldConsts: null,
            missingRequiredFieldConsts: fieldDefinitions.filter(field => field.required).map(field => field.const),
            fallbackToManualAuth: true
        };
    }

    fieldDefinitions.forEach(field => {
        const storedValue = field.managed
            ? (field.managedScope === 'user' ? userValues[field.const] : orgValues[field.const])
            : undefined;
        const hasStoredValue = isFilled(storedValue);
        // Show any required field the user still needs to provide, including
        // managed fields that have not been configured yet.
        if (field.required && (!field.managed || !hasStoredValue)) {
            visibleFieldConsts.push(field.const);
        }
        if (field.required && !hasStoredValue) {
            missingRequiredFieldConsts.push(field.const);
            allRequiredFieldsSatisfied = false;
        }
        if (field.required && !field.managed) {
            allRequiredFieldsSatisfied = false;
        }
    });

    return {
        hasManagedAuth: managedFieldDefinitions.length > 0,
        allRequiredFieldsSatisfied,
        visibleFieldConsts,
        missingRequiredFieldConsts,
        fallbackToManualAuth: false
    };
}

async function resolveApiKeyLoginFields({ platform, rcAccountId, rcExtensionId, connectorId, isPrivate = false, apiKey, additionalInfo = {}, preferSubmittedValuesForManagedFields = false }) {
    const fieldDefinitions = await getApiKeyFieldDefinitions({ rcAccountId, platform, connectorId, isPrivate });
    const resolvedAdditionalInfo = {
        ...(additionalInfo ?? {})
    };
    if (resolvedAdditionalInfo.apiKey === undefined && apiKey !== undefined) {
        resolvedAdditionalInfo.apiKey = apiKey;
    }

    const orgValues = await getOrgManagedAuthValues({ rcAccountId, platform });
    const userValues = await getUserManagedAuthValues({ rcAccountId, platform, rcExtensionId });
    const missingRequiredFieldConsts = [];

    fieldDefinitions.forEach(field => {
        if (!field?.managed) {
            if (field.required && !isFilled(resolvedAdditionalInfo[field.const])) {
                missingRequiredFieldConsts.push(field.const);
            }
            return;
        }

        const storedValue = field.managedScope === 'user'
            ? userValues[field.const]
            : orgValues[field.const];
        // Prefer managed values when configured, but fall back to submitted
        // auth-page input so missing managed fields can still be supplied.
        if (isFilled(storedValue) && !(preferSubmittedValuesForManagedFields && isFilled(resolvedAdditionalInfo[field.const]))) {
            resolvedAdditionalInfo[field.const] = storedValue;
        }

        if (field.required && !isFilled(resolvedAdditionalInfo[field.const])) {
            missingRequiredFieldConsts.push(field.const);
        }
    });

    return {
        resolvedAdditionalInfo,
        resolvedApiKey: resolvedAdditionalInfo.apiKey ?? apiKey,
        missingRequiredFieldConsts
    };
}

async function persistSubmittedManagedValues({ platform, rcAccountId, rcExtensionId, rcUserName, submittedManagedValues = {} }) {
    if (!rcAccountId) {
        return;
    }
    if (Object.keys(submittedManagedValues.org ?? {}).length > 0) {
        await upsertOrgManagedAuthValues({
            rcAccountId,
            platform,
            values: submittedManagedValues.org
        });
    }
    if (rcExtensionId && Object.keys(submittedManagedValues.user ?? {}).length > 0) {
        await upsertUserManagedAuthValues({
            rcAccountId,
            platform,
            rcExtensionId,
            rcUserName,
            values: submittedManagedValues.user
        });
    }
}

exports.MANAGED_AUTH_ORG_DATA_KEY = MANAGED_AUTH_ORG_DATA_KEY;
exports.MANAGED_AUTH_USER_DATA_KEY = MANAGED_AUTH_USER_DATA_KEY;
exports.getApiKeyFieldDefinitions = getApiKeyFieldDefinitions;
exports.getManagedFieldDefinitions = getManagedFieldDefinitions;
exports.getManagedAuthAdminSettings = getManagedAuthAdminSettings;
exports.getManagedAuthState = getManagedAuthState;
exports.hasManagedAuthLoginFailure = hasManagedAuthLoginFailure;
exports.markManagedAuthLoginFailure = markManagedAuthLoginFailure;
exports.clearManagedAuthLoginFailure = clearManagedAuthLoginFailure;
exports.resolveApiKeyLoginFields = resolveApiKeyLoginFields;
exports.persistSubmittedManagedValues = persistSubmittedManagedValues;
exports.upsertOrgManagedAuthValues = upsertOrgManagedAuthValues;
exports.upsertUserManagedAuthValues = upsertUserManagedAuthValues;

