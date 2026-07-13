import type { Application, RequestHandler, Router } from 'express';
import type {
  ConnectorCapabilities,
  ConnectorImplementation,
  ConnectorInterfaceFunction,
  ConnectorManifest,
} from './connector';

export interface CoreInitializationOptions {
  skipDatabaseInit?: boolean;
  skipAnalyticsInit?: boolean;
}

export interface ConnectorRegistry {
  readonly connectors: Map<string, ConnectorImplementation>;
  readonly manifests: Map<string, ConnectorManifest>;
  readonly releaseNotes: unknown;
  readonly platformInterfaces: Map<string, Map<string, ConnectorInterfaceFunction>>;
  setDefaultManifest(manifest: ConnectorManifest): void;
  registerConnectorInterface(
    platformName: string,
    interfaceName: string,
    interfaceFunction: ConnectorInterfaceFunction,
  ): void;
  getPlatformInterfaces(platformName: string): Map<string, ConnectorInterfaceFunction>;
  hasPlatformInterface(platformName: string, interfaceName: string): boolean;
  unregisterConnectorInterface(platformName: string, interfaceName: string): void;
  registerConnector(
    platform: string,
    connector: ConnectorImplementation,
    manifest?: ConnectorManifest | null,
  ): void;
  getConnector(platform: string): ConnectorImplementation;
  getOriginalConnector(platform: string): ConnectorImplementation;
  getManifest(platform: string, fallbackToDefault?: boolean): ConnectorManifest;
  getRegisteredPlatforms(): string[];
  isRegistered(platform: string): boolean;
  validateConnectorInterface(platform: string, connector: ConnectorImplementation): void;
  unregisterConnector(platform: string): void;
  setReleaseNotes(releaseNotes: unknown): void;
  getReleaseNotes(): unknown;
  getConnectorCapabilities(platform: string): Promise<ConnectorCapabilities>;
}

export function createCoreRouter(): Router;
export function createCoreMiddleware(): RequestHandler[];
export function initializeCore(options?: CoreInitializationOptions): Promise<void>;
export function createCoreApp(options?: CoreInitializationOptions): Application;
export const connectorRegistry: ConnectorRegistry;
export const proxyConnector: ConnectorImplementation;
export { DebugTracer } from '../lib/debugTracer';

export * from './analytics';
export * from './admin';
export * from './appointment';
export * from './auth';
export * from './authSession';
export * from './calldown';
export * from './cacheCleanup';
export * from './common';
export * from './connector';
export * from './contact';
export * from './errorHandler';
export * from './json';
export * from './jwt';
export * from './logging';
export * from './managedAuth';
export * from './managedOAuth';
export * from './manifest';
export * from './migration';
export * from './plugin';
export * from './ringcentral';
export * from './s3ErrorLogReport';
export * from './sharedSMSComposer';
export * from './user';
export * from './util';
