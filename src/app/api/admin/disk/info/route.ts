import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { existsSync, statfsSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { db } from "@/lib/db";
import { execSync } from "child_process";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as Record<string, unknown>).role !== "admin") {
    return null;
  }
  return session;
}

interface PartitionInfo {
  filesystem: string;
  mountPoint: string;
  type: string;
  total: number;
  used: number;
  available: number;
  usagePercent: number;
}

interface StorageDirInfo {
  path: string;
  exists: boolean;
  totalFiles: number;
  totalFolders: number;
  totalSize: number;
  diskUsedPercent: number;
}

function countDirContents(dirPath: string): { files: number; folders: number; size: number } {
  let files = 0;
  let folders = 0;
  let size = 0;

  try {
    const entries = readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const fullPath = join(dirPath, entry.name);
      try {
        if (entry.isDirectory()) {
          folders++;
          const sub = countDirContents(fullPath);
          files += sub.files;
          folders += sub.folders;
          size += sub.size;
        } else if (entry.isFile()) {
          files++;
          const stats = statSync(fullPath);
          size += stats.size;
        }
      } catch {
        // Skip inaccessible entries
      }
    }
  } catch {
    // Directory not accessible
  }

  return { files, folders, size };
}

function getPartitions(): PartitionInfo[] {
  const partitions: PartitionInfo[] = [];

  try {
    // Use df command to get partition info
    const output = execSync("df -T -B1 2>/dev/null || true", {
      encoding: "utf-8",
      timeout: 5000,
    });

    const lines = output.trim().split("\n");
    // Skip header line
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(/\s+/);
      if (parts.length < 7) continue;

      const filesystem = parts[0];
      const type = parts[1];
      const total = parseInt(parts[2], 10);
      const used = parseInt(parts[3], 10);
      const available = parseInt(parts[4], 10);
      const usageStr = parts[5];
      const mountPoint = parts.slice(6).join(" ");

      // Filter out pseudo filesystems
      if (
        filesystem.startsWith("devtmpfs") ||
        filesystem.startsWith("tmpfs") ||
        filesystem.startsWith("none") ||
        type === "tmpfs" ||
        type === "devtmpfs" ||
        type === "squashfs" ||
        type === "overlay" ||
        type === "proc" ||
        type === "sysfs" ||
        type === "cgroup" ||
        type === "cgroup2" ||
        type === "devpts" ||
        type === "mqueue"
      ) {
        continue;
      }

      // Only include real device filesystems
      if (!filesystem.startsWith("/dev/") && filesystem !== "overlay") continue;

      const usagePercent = parseFloat(usageStr.replace("%", "")) || (total > 0 ? (used / total) * 100 : 0);

      partitions.push({
        filesystem,
        mountPoint,
        type,
        total,
        used,
        available,
        usagePercent,
      });
    }
  } catch {
    // Fallback: use statfsSync for root
    try {
      const stats = statfsSync("/");
      const total = Number(stats.blocks) * Number(stats.bsize);
      const available = Number(stats.bfree) * Number(stats.bsize);
      const used = total - available;
      partitions.push({
        filesystem: "/dev/root",
        mountPoint: "/",
        type: "ext4",
        total,
        used,
        available,
        usagePercent: total > 0 ? (used / total) * 100 : 0,
      });
    } catch {
      // Cannot determine disk info
    }
  }

  // Deduplicate by mount point
  const seen = new Set<string>();
  return partitions.filter((p) => {
    if (seen.has(p.mountPoint)) return false;
    seen.add(p.mountPoint);
    return true;
  });
}

// GET /api/admin/disk/info - Get detailed disk and storage info
export async function GET() {
  try {
    const session = await requireAdmin();
    if (!session) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    // Get system partitions
    const partitions = getPartitions();

    // Get storage directory info
    const storagePath = join(process.cwd(), "storage");
    let storageDir: StorageDirInfo;

    if (existsSync(storagePath)) {
      const contents = countDirContents(storagePath);
      let diskUsedPercent = 0;

      // Find the partition that contains the storage directory
      const matchingPartition = partitions
        .filter((p) => storagePath.startsWith(p.mountPoint))
        .sort((a, b) => b.mountPoint.length - a.mountPoint.length)[0];

      if (matchingPartition && matchingPartition.total > 0) {
        // Try to get actual storage dir size using du if available
        try {
          const duOutput = execSync(`du -sb "${storagePath}" 2>/dev/null || echo "0"`, {
            encoding: "utf-8",
            timeout: 10000,
          });
          const actualSize = parseInt(duOutput.split("\t")[0], 10);
          if (actualSize > 0) {
            diskUsedPercent = (actualSize / matchingPartition.total) * 100;
          }
        } catch {
          diskUsedPercent = (contents.size / matchingPartition.total) * 100;
        }
      }

      storageDir = {
        path: storagePath,
        exists: true,
        totalFiles: contents.files,
        totalFolders: contents.folders,
        totalSize: contents.size,
        diskUsedPercent,
      };
    } else {
      storageDir = {
        path: storagePath,
        exists: false,
        totalFiles: 0,
        totalFolders: 0,
        totalSize: 0,
        diskUsedPercent: 0,
      };
    }

    // Get mount configs from DB
    let mountConfigs: Array<{
      id: string;
      name: string;
      type: string;
      config: string;
      isEnabled: boolean;
      status: string;
    }> = [];

    try {
      mountConfigs = await db.storageDriver.findMany({
        where: { type: "mount" },
        select: {
          id: true,
          name: true,
          type: true,
          config: true,
          isEnabled: true,
          status: true,
        },
      });
    } catch {
      // DB might not have mount entries yet
    }

    return NextResponse.json({
      partitions,
      storageDir,
      mountConfigs,
    });
  } catch (error) {
    console.error("Error getting disk info:", error);
    return NextResponse.json({ error: "Failed to get disk info" }, { status: 500 });
  }
}
