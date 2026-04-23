import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { existsSync, statfsSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { db } from "@/lib/db";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as Record<string, unknown>).role !== "admin") {
    return null;
  }
  return session;
}

interface DiskInfo {
  path: string;
  mountPoint: string;
  total: number;
  used: number;
  available: number;
  usagePercent: number;
  isMounted: boolean;
  label: string;
  type: "local" | "driver";
  driverId?: string;
  driverName?: string;
}

interface DiskContentItem {
  name: string;
  type: "file" | "directory";
  size: number;
  modified: string;
}

// GET /api/admin/disk - List available local disk paths and mounted directories
export async function GET(request: NextRequest) {
  try {
    const session = await requireAdmin();
    if (!session) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const browsePath = searchParams.get("path");

    // If browsing a specific path
    if (browsePath) {
      try {
        if (!existsSync(browsePath)) {
          return NextResponse.json({ error: "Path not found" }, { status: 404 });
        }

        const entries = readdirSync(browsePath);
        const items: DiskContentItem[] = entries
          .filter((name) => !name.startsWith("."))
          .map((name) => {
            const fullPath = join(browsePath, name);
            try {
              const stats = statSync(fullPath);
              return {
                name,
                type: stats.isDirectory() ? "directory" as const : "file" as const,
                size: stats.isFile() ? stats.size : 0,
                modified: stats.mtime.toISOString(),
              };
            } catch {
              return null;
            }
          })
          .filter((item): item is DiskContentItem => item !== null)
          .sort((a, b) => {
            if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
            return a.name.localeCompare(b.name);
          });

        return NextResponse.json({ items, path: browsePath });
      } catch (error) {
        return NextResponse.json(
          { error: `Failed to browse path: ${(error as Error).message}` },
          { status: 500 }
        );
      }
    }

    // List all disk paths
    const disks: DiskInfo[] = [];

    // Get system root disk info
    try {
      const stats = statfsSync("/");
      const total = Number(stats.blocks) * Number(stats.bsize);
      const available = Number(stats.bfree) * Number(stats.bsize);
      const used = total - available;
      disks.push({
        path: "/",
        mountPoint: "/",
        total,
        used,
        available,
        usagePercent: total > 0 ? (used / total) * 100 : 0,
        isMounted: true,
        label: "System Root",
        type: "local",
      });
    } catch {
      // statfs might not work in some environments
      disks.push({
        path: "/",
        mountPoint: "/",
        total: 0,
        used: 0,
        available: 0,
        usagePercent: 0,
        isMounted: true,
        label: "System Root",
        type: "local",
      });
    }

    // Get storage directory info
    const storagePath = join(process.cwd(), "storage");
    if (existsSync(storagePath)) {
      try {
        const stats = statfsSync(storagePath);
        const total = Number(stats.blocks) * Number(stats.bsize);
        const available = Number(stats.bfree) * Number(stats.bsize);
        const used = total - available;
        disks.push({
          path: storagePath,
          mountPoint: storagePath,
          total,
          used,
          available,
          usagePercent: total > 0 ? (used / total) * 100 : 0,
          isMounted: true,
          label: "CloudDrive Storage",
          type: "local",
        });
      } catch {
        disks.push({
          path: storagePath,
          mountPoint: storagePath,
          total: 0,
          used: 0,
          available: 0,
          usagePercent: 0,
          isMounted: true,
          label: "CloudDrive Storage",
          type: "local",
        });
      }
    }

    // Get driver-based storage paths
    try {
      const drivers = await db.storageDriver.findMany({
        where: { status: "active" },
      });

      for (const driver of drivers) {
        if (driver.type === "local" && driver.basePath && existsSync(driver.basePath)) {
          try {
            const stats = statfsSync(driver.basePath);
            const total = Number(stats.blocks) * Number(stats.bsize);
            const available = Number(stats.bfree) * Number(stats.bsize);
            const used = total - available;
            disks.push({
              path: driver.basePath,
              mountPoint: driver.basePath,
              total,
              used,
              available,
              usagePercent: total > 0 ? (used / total) * 100 : 0,
              isMounted: true,
              label: driver.name,
              type: "driver",
              driverId: driver.id,
              driverName: driver.name,
            });
          } catch {
            disks.push({
              path: driver.basePath,
              mountPoint: driver.basePath,
              total: 0,
              used: 0,
              available: 0,
              usagePercent: 0,
              isMounted: true,
              label: driver.name,
              type: "driver",
              driverId: driver.id,
              driverName: driver.name,
            });
          }
        }
      }
    } catch {
      // Drivers might not be accessible
    }

    // Home directory
    const homeDir = process.env.HOME || process.env.USERPROFILE || "/home";
    if (existsSync(homeDir) && homeDir !== "/") {
      try {
        const stats = statfsSync(homeDir);
        const total = Number(stats.blocks) * Number(stats.bsize);
        const available = Number(stats.bfree) * Number(stats.bsize);
        const used = total - available;
        disks.push({
          path: homeDir,
          mountPoint: homeDir,
          total,
          used,
          available,
          usagePercent: total > 0 ? (used / total) * 100 : 0,
          isMounted: true,
          label: "Home Directory",
          type: "local",
        });
      } catch {
        disks.push({
          path: homeDir,
          mountPoint: homeDir,
          total: 0,
          used: 0,
          available: 0,
          usagePercent: 0,
          isMounted: true,
          label: "Home Directory",
          type: "local",
        });
      }
    }

    // Deduplicate by path
    const seenPaths = new Set<string>();
    const uniqueDisks = disks.filter((disk) => {
      if (seenPaths.has(disk.path)) return false;
      seenPaths.add(disk.path);
      return true;
    });

    return NextResponse.json({ disks: uniqueDisks });
  } catch (error) {
    console.error("Error listing disks:", error);
    return NextResponse.json({ error: "Failed to list disks" }, { status: 500 });
  }
}

// POST /api/admin/disk - Mount a new local directory as storage
export async function POST(request: NextRequest) {
  try {
    const session = await requireAdmin();
    if (!session) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const { path, name, priority, isDefault } = await request.json();

    if (!path || !name) {
      return NextResponse.json(
        { error: "Path and name are required" },
        { status: 400 }
      );
    }

    // Verify the path exists
    if (!existsSync(path)) {
      return NextResponse.json(
        { error: "The specified path does not exist" },
        { status: 400 }
      );
    }

    // Create a storage driver for this path
    const driver = await db.storageDriver.create({
      data: {
        name,
        type: "local",
        basePath: path,
        priority: priority || 0,
        isDefault: isDefault || false,
        config: JSON.stringify({ path }),
        status: "active",
        isEnabled: true,
      },
    });

    return NextResponse.json({
      id: driver.id,
      name: driver.name,
      type: driver.type,
      basePath: driver.basePath,
      status: driver.status,
      createdAt: driver.createdAt.toISOString(),
    }, { status: 201 });
  } catch (error) {
    console.error("Error mounting disk:", error);
    return NextResponse.json({ error: "Failed to mount disk" }, { status: 500 });
  }
}
