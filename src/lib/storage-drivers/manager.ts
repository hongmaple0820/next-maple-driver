import type { StorageDriver, StorageDriverConfig, StorageDriverFactory } from "./types";
import { localDriverFactory } from "./local-driver";

// Registry of all available driver factories
const driverFactories: Map<string, StorageDriverFactory> = new Map();

// Active driver instances
const driverInstances: Map<string, StorageDriver> = new Map();

// Default driver ID
let defaultDriverId: string = "local-default";

// Track which lazy factories have been loaded
const loadedLazyFactories = new Set<string>();

// Register built-in factories
export function registerDriverFactory(factory: StorageDriverFactory) {
  driverFactories.set(factory.type, factory);
}

// Eagerly register the local driver (lightweight, no heavy deps)
registerDriverFactory(localDriverFactory);

/**
 * Lazy factory loaders – these are called on first access instead of at
 * module-evaluation time.  This prevents Turbopack/dev from compiling
 * @aws-sdk, ssh2, basic-ftp, etc. unless a route actually needs them,
 * which dramatically reduces peak memory during hot-reloading.
 */
const lazyFactoryLoaders: Record<string, () => Promise<{ factory: StorageDriverFactory }>> = {
  s3:       () => import("./s3-driver").then(m =>      ({ factory: m.s3DriverFactory })),
  webdav:   () => import("./webdav-driver").then(m =>  ({ factory: m.webdavDriverFactory })),
  mount:    () => import("./mount-driver").then(m =>   ({ factory: m.mountDriverFactory })),
  baidu:    () => import("./baidu-driver").then(m =>   ({ factory: m.baiduDriverFactory })),
  aliyun:   () => import("./aliyun-driver").then(m =>  ({ factory: m.aliyunDriverFactory })),
  onedrive: () => import("./onedrive-driver").then(m => ({ factory: m.onedriveDriverFactory })),
  google:   () => import("./google-driver").then(m =>  ({ factory: m.googleDriverFactory })),
  "115":    () => import("./115-driver").then(m =>     ({ factory: m.drive115DriverFactory })),
  quark:    () => import("./quark-driver").then(m =>   ({ factory: m.quarkDriverFactory })),
  ftp:      () => import("./ftp-driver").then(m =>     ({ factory: m.ftpDriverFactory })),
};

/** Ensure the factory for a given driver type is loaded and registered. */
async function ensureFactoryLoaded(type: string): Promise<void> {
  if (driverFactories.has(type) || loadedLazyFactories.has(type)) return;

  const loader = lazyFactoryLoaders[type];
  if (!loader) return;

  loadedLazyFactories.add(type); // prevent concurrent loads
  try {
    const { factory } = await loader();
    registerDriverFactory(factory);
  } catch {
    loadedLazyFactories.delete(type); // allow retry
  }
}

export async function getDriverFactory(type: string): Promise<StorageDriverFactory | undefined> {
  await ensureFactoryLoaded(type);
  return driverFactories.get(type);
}

export async function getAllDriverFactories(): Promise<StorageDriverFactory[]> {
  // Load all lazy factories in parallel
  await Promise.all(Object.keys(lazyFactoryLoaders).map(ensureFactoryLoaded));
  return Array.from(driverFactories.values());
}

// Get or create a driver instance
export async function getDriver(config: StorageDriverConfig): Promise<StorageDriver> {
  const existing = driverInstances.get(config.id);
  if (existing) return existing;

  await ensureFactoryLoaded(config.type);

  const factory = driverFactories.get(config.type);
  if (!factory) {
    throw new Error(`Unknown driver type: ${config.type}`);
  }

  const driver = factory.create(config);
  driverInstances.set(config.id, driver);
  return driver;
}

// Get the default driver (local, synchronous – always available)
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

/**
 * Eagerly load a specific driver module and return its named exports.
 * Use this when you need direct access to a driver class (e.g. CloudDriverBase)
 * rather than just the factory.
 */
export async function loadDriverModule(type: string): Promise<Record<string, unknown>> {
  const moduleMap: Record<string, () => Promise<Record<string, unknown>>> = {
    s3:       () => import("./s3-driver"),
    webdav:   () => import("./webdav-driver"),
    mount:    () => import("./mount-driver"),
    baidu:    () => import("./baidu-driver"),
    aliyun:   () => import("./aliyun-driver"),
    onedrive: () => import("./onedrive-driver"),
    google:   () => import("./google-driver"),
    "115":    () => import("./115-driver"),
    quark:    () => import("./quark-driver"),
    ftp:      () => import("./ftp-driver"),
  };
  const loader = moduleMap[type];
  if (!loader) throw new Error(`Unknown driver type: ${type}`);
  return loader();
}
