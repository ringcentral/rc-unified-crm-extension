const connectorRegistry = require('../connector/registry');
const developerPortal = require('../connector/developerPortal');
const { AccountDataModel } = require('../models/accountDataModel');
const { Op } = require('sequelize');
const { encode, decoded } = require('../lib/encode');

const SHARED_AUTH_ORG_DATA_KEY = 'managed-auth-org';
const SHARED_AUTH_USER_DATA_KEY = 'managed-auth-user';

function getUserManagedAuthDataKey({ rcExtensionId }) {
    return `${SHARED_AUTH_USER_DATA_KEY}:${rcExtensionId}`;
}

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
        dataKey: SHARED_AUTH_ORG_DATA_KEY
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

async function upsertOrgManagedAuthValues({ rcAccountId, platform, values = {}, fieldsToRemove = [] }) {
    const existingRecord = await getManagedAuthRecord({
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
    const fieldDefinitions = await getSharedFieldDefinitions({ platform, connectorId, isPrivate });
    const orgFieldDefinitions = fieldDefinitions.filter(field => field.sharedScope === 'org');
    const userFieldDefinitions = fieldDefinitions.filter(field => field.sharedScope === 'user');
    const orgValues = await getOrgManagedAuthValues({ rcAccountId, platform });
    const userRecords = await AccountDataModel.findAll({
        where: {
            rcAccountId,
            platformName: platform,
            dataKey: {
                [Op.like]: `${SHARED_AUTH_USER_DATA_KEY}:%`
            }
        }
    });
    const userEntries = userRecords
        .map(record => {
            const extensionIdFromDataKey = record.dataKey?.split(`${SHARED_AUTH_USER_DATA_KEY}:`)?.[1];
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
    const fieldDefinitions = await getApiKeyFieldDefinitions({ platform, connectorId, isPrivate });
    const sharedFieldDefinitions = fieldDefinitions.filter(field => field?.shared);
    const orgValues = await getOrgManagedAuthValues({ rcAccountId, platform });
    const userValues = await getUserManagedAuthValues({ rcAccountId, platform, rcExtensionId });

    const visibleFieldConsts = [];
    const missingRequiredFieldConsts = [];
    let allRequiredFieldsSatisfied = true;

    // Default behavior for connectors without managed auth: render full API key form.
    if (sharedFieldDefinitions.length === 0) {
        return {
            hasManagedAuth: false,
            allRequiredFieldsSatisfied: false,
            visibleFieldConsts: null,
            missingRequiredFieldConsts: fieldDefinitions.filter(field => field.required).map(field => field.const)
        };
    }

    fieldDefinitions.forEach(field => {
        const storedValue = field.shared
            ? (field.sharedScope === 'user' ? userValues[field.const] : orgValues[field.const])
            : undefined;
        const hasStoredValue = isFilled(storedValue);
        // Only show remaining required non-shared fields to end users.
        if (field.required && !field.shared) {
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
        hasManagedAuth: sharedFieldDefinitions.length > 0,
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

    const orgValues = await getOrgManagedAuthValues({ rcAccountId, platform });
    const userValues = await getUserManagedAuthValues({ rcAccountId, platform, rcExtensionId });
    const missingRequiredFieldConsts = [];

    fieldDefinitions.forEach(field => {
        if (!field?.shared) {
            if (field.required && !isFilled(resolvedAdditionalInfo[field.const])) {
                missingRequiredFieldConsts.push(field.const);
            }
            return;
        }

        const storedValue = field.sharedScope === 'user'
            ? userValues[field.const]
            : orgValues[field.const];
        // Shared fields are admin-managed only; end-user input for shared fields is ignored.
        if (isFilled(storedValue)) {
            resolvedAdditionalInfo[field.const] = storedValue;
        }
        else {
            delete resolvedAdditionalInfo[field.const];
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

async function persistSubmittedSharedValues({ platform, rcAccountId, rcExtensionId, rcUserName, submittedSharedValues = {} }) {
    if (!rcAccountId) {
        return;
    }
    if (Object.keys(submittedSharedValues.org ?? {}).length > 0) {
        await upsertOrgManagedAuthValues({
            rcAccountId,
            platform,
            values: submittedSharedValues.org
        });
    }
    if (rcExtensionId && Object.keys(submittedSharedValues.user ?? {}).length > 0) {
        await upsertUserManagedAuthValues({
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
exports.getManagedAuthAdminSettings = getManagedAuthAdminSettings;
exports.getManagedAuthState = getManagedAuthState;
exports.resolveApiKeyLoginFields = resolveApiKeyLoginFields;
exports.persistSubmittedSharedValues = persistSubmittedSharedValues;
exports.upsertOrgManagedAuthValues = upsertOrgManagedAuthValues;
exports.upsertUserManagedAuthValues = upsertUserManagedAuthValues;
