import { randomUUID } from 'crypto';
import { track } from './analytics';
import { normalizeRawId } from './analyticsIdentity';
const { getHashValue } = require('./util');
const logger = require('./logger');

type Context = { identity: Record<string, any>; properties: Record<string, any>; startedAt: number };

export function pluginProperties(plugin: any) {
    const manifest = plugin?.data ?? plugin ?? {};
    return {
        pluginId: plugin?.id,
        pluginVersion: manifest.version,
        pluginAccess: manifest.registration?.pluginAccess ?? manifest.access,
    };
}

export function pluginErrorCode(error: any): string {
    const status = error?.response?.status;
    if (status === 401 || status === 403) return 'authorization_failed';
    if (status === 429) return 'rate_limited';
    if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT') return 'timeout';
    if (status >= 500) return 'provider_unavailable';
    return 'plugin_failed';
}

function emit(context: Context, eventName: string, properties: Record<string, any>) {
    try {
        track({
            ...context.identity,
            eventName,
            connectorName: context.properties.adapterName,
            interfaceName: context.properties.operation,
            success: properties.success,
            extras: {
                ...context.properties, ...properties,
                // Stable across delivery retries; distinct for each lifecycle event.
                $insert_id: `${context.properties.executionId}:${eventName}`,
            },
        });
    } catch {
        // Analytics must never interrupt logging or expose provider payloads.
        logger.warn('Plugin analytics emission failed');
    }
}

export function startPluginExecution({ plugin, user, platform, logType, operation, analyticsIdentity = {}, executionId = randomUUID(), executionMode = plugin.data?.isAsync ? 'async' : 'sync' }: any): Context {
    const extensionId = user.hashedRcExtensionId || (analyticsIdentity.userAgent === 'SSCL' ? undefined : analyticsIdentity.extensionId);
    const accountId = user.rcAccountId && process.env.HASH_KEY
        ? getHashValue(String(user.rcAccountId), process.env.HASH_KEY) : analyticsIdentity.accountId;
    const rawExtension = normalizeRawId(analyticsIdentity.rcExtensionIdRaw);
    const context: Context = {
        startedAt: Date.now(),
        identity: {
            accountId, extensionId,
            rcAccountIdRaw: user.rcAccountId,
            ...(rawExtension && process.env.HASH_KEY && getHashValue(rawExtension, process.env.HASH_KEY) === extensionId
                ? { rcExtensionIdRaw: rawExtension } : {}),
            userAgent: analyticsIdentity.userAgent,
            eventAddedVia: analyticsIdentity.eventAddedVia,
        },
        properties: { ...pluginProperties(plugin), adapterName: platform, logType, operation, executionMode, executionId, attemptNumber: 1 },
    };
    emit(context, 'Plugin Execution Started', {});
    return context;
}

export function finishPluginExecution(context: Context | undefined, outcome: 'success' | 'failure' | 'timeout', failureStage?: string, errorCode?: string, now = Date.now()) {
    if (!context) return; // Tasks created before instrumentation have no start event.
    emit(context, 'Plugin Execution Finished', {
        outcome, success: outcome === 'success', durationMs: Math.max(0, now - context.startedAt),
        ...(failureStage ? { failureStage } : {}), ...(errorCode ? { errorCode } : {}),
    });
}
