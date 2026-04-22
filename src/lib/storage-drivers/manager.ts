import type { StorageDriver, StorageDriverConfig, StorageDriverFactory } from "./types";
import { localDriverFactory } from "./local-driver";

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

// Initialize with local driver
registerDriverFactory(localDriverFactory);

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
