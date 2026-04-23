import type { StorageDriver, StorageDriverConfig, StorageDriverFactory } from "./types";
import { localDriverFactory } from "./local-driver";
import { s3DriverFactory } from "./s3-driver";
import { webdavDriverFactory } from "./webdav-driver";
import { mountDriverFactory } from "./mount-driver";
import { baiduDriverFactory } from "./baidu-driver";
import { aliyunDriverFactory } from "./aliyun-driver";
import { onedriveDriverFactory } from "./onedrive-driver";
import { googleDriverFactory } from "./google-driver";
import { drive115DriverFactory } from "./115-driver";
import { quarkDriverFactory } from "./quark-driver";

// Registry of all available driver factories
const driverFactories: Map<string, StorageDriverFactory> = new Map();

// Active driver instances
const driverInstances: Map<string, StorageDriver> = new Map();

// Default driver ID
let defaultDriverId: string = "local-default";

// Register built-in factories
export function registerDriverFactory(factory: StorageDriverFactory) {
  driverFactories.set(factory.type, factory);
}

// Initialize with all driver factories
registerDriverFactory(localDriverFactory);
registerDriverFactory(s3DriverFactory);
registerDriverFactory(webdavDriverFactory);
registerDriverFactory(mountDriverFactory);
registerDriverFactory(baiduDriverFactory);
registerDriverFactory(aliyunDriverFactory);
registerDriverFactory(onedriveDriverFactory);
registerDriverFactory(googleDriverFactory);
registerDriverFactory(drive115DriverFactory);
registerDriverFactory(quarkDriverFactory);

export function getDriverFactory(type: string): StorageDriverFactory | undefined {
  return driverFactories.get(type);
}

export function getAllDriverFactories(): StorageDriverFactory[] {
  return Array.from(driverFactories.values());
}

// Get or create a driver instance
export function getDriver(config: StorageDriverConfig): StorageDriver {
  const existing = driverInstances.get(config.id);
  if (existing) return existing;

  const factory = driverFactories.get(config.type);
  if (!factory) {
    throw new Error(`Unknown driver type: ${config.type}`);
  }

  const driver = factory.create(config);
  driverInstances.set(config.id, driver);
  return driver;
}

// Get the default driver
export function getDefaultDriver(): StorageDriver {
  const instance = driverInstances.get(defaultDriverId);
  if (instance) return instance;

  // Create default local driver
  const defaultConfig: StorageDriverConfig = {
    id: "local-default",
    name: "Default Local Storage",
    type: "local",
    config: { path: "./storage" },
    isDefault: true,
    isEnabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const driver = localDriverFactory.create(defaultConfig);
  driverInstances.set(defaultDriverId, driver);
  return driver;
}

// Set default driver
export function setDefaultDriverId(id: string) {
  defaultDriverId = id;
}

export function getDefaultDriverId(): string {
  return defaultDriverId;
}

// Invalidate a cached driver instance (e.g., after config change)
export function invalidateDriver(id: string) {
  driverInstances.delete(id);
}

// Invalidate all cached driver instances
export function invalidateAllDrivers() {
  driverInstances.clear();
}

// Cloud driver types (for UI filtering)
export const CLOUD_DRIVER_TYPES = ["baidu", "aliyun", "onedrive", "google", "115", "quark"] as const;

export function isCloudDriver(type: string): boolean {
  return CLOUD_DRIVER_TYPES.includes(type as typeof CLOUD_DRIVER_TYPES[number]);
}

// OAuth driver types
export const OAUTH_DRIVER_TYPES = ["baidu", "aliyun", "onedrive", "google"] as const;

export function isOAuthDriver(type: string): boolean {
  return OAUTH_DRIVER_TYPES.includes(type as typeof OAUTH_DRIVER_TYPES[number]);
}

// Password-based driver types
export const PASSWORD_DRIVER_TYPES = ["115", "quark"] as const;

export function isPasswordDriver(type: string): boolean {
  return PASSWORD_DRIVER_TYPES.includes(type as typeof PASSWORD_DRIVER_TYPES[number]);
}
