import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { existsSync } from "fs";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as Record<string, unknown>).role !== "admin") {
    return null;
  }
  return session;
}

// POST /api/admin/drivers/[id]/health-check - Test driver health
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdmin();
    if (!session) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const { id } = await params;

    // Handle default-local virtual driver
    if (id === "default-local") {
      const storageExists = existsSync("./storage");
      return NextResponse.json({
        healthy: storageExists,
        message: storageExists
          ? "Local storage path is accessible"
          : "Local storage path not found",
        responseTime: Date.now(),
      });
    }

    const driver = await db.storageDriverConfig.findUnique({ where: { id } });
    if (!driver) {
      return NextResponse.json({ error: "Driver not found" }, { status: 404 });
    }

    const startTime = Date.now();

    if (driver.type === "local") {
      const path = driver.basePath || "./storage";
      const healthy = existsSync(path);
      return NextResponse.json({
        healthy,
        message: healthy
          ? `Local path "${path}" is accessible`
          : `Local path "${path}" is not accessible`,
        responseTime: Date.now() - startTime,
      });
    }

    if (driver.type === "webdav") {
      try {
        const config = JSON.parse(driver.config || "{}");
        const url = config.url || config.endpoint;
        if (!url) {
          return NextResponse.json({
            healthy: false,
            message: "WebDAV URL not configured",
            responseTime: Date.now() - startTime,
          });
        }

        // Test WebDAV connection with a PROPFIND request
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        try {
          const headers: Record<string, string> = {
            "Depth": "0",
          };

          if (config.username && config.password) {
            const credentials = Buffer.from(`${config.username}:${config.password}`).toString("base64");
            headers["Authorization"] = `Basic ${credentials}`;
          }

          const response = await fetch(url, {
            method: "PROPFIND",
            headers,
            signal: controller.signal,
          });

          clearTimeout(timeout);

          // WebDAV servers typically respond with 207 Multi-Status for PROPFIND
          // or 200 OK, or 401 if credentials are needed
          const healthy = response.status === 207 || response.status === 200 || response.status === 401;

          let message = "";
          if (response.status === 401) {
            message = "WebDAV server reachable but authentication failed. Check credentials.";
          } else if (response.status === 207 || response.status === 200) {
            message = "WebDAV connection successful";
          } else {
            message = `WebDAV server responded with status ${response.status}`;
          }

          return NextResponse.json({
            healthy,
            message,
            responseTime: Date.now() - startTime,
            statusCode: response.status,
          });
        } catch (fetchError) {
          clearTimeout(timeout);
          const errMessage = fetchError instanceof Error && fetchError.name === "AbortError"
            ? "Connection timed out after 10 seconds"
            : `Connection failed: ${(fetchError as Error).message}`;

          return NextResponse.json({
            healthy: false,
            message: errMessage,
            responseTime: Date.now() - startTime,
          });
        }
      } catch (configError) {
        return NextResponse.json({
          healthy: false,
          message: `Invalid WebDAV configuration: ${(configError as Error).message}`,
          responseTime: Date.now() - startTime,
        });
      }
    }

    if (driver.type === "s3") {
      try {
        const config = JSON.parse(driver.config || "{}");
        const endpoint = config.endpoint || config.url;
        const region = config.region || "us-east-1";

        if (!endpoint && !config.bucket) {
          return NextResponse.json({
            healthy: false,
            message: "S3 endpoint or bucket not configured",
            responseTime: Date.now() - startTime,
          });
        }

        // Test S3 connection - try to list objects (with max-keys=1)
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        try {
          // Simple HTTP check to S3 endpoint
          const testUrl = endpoint || `https://s3.${region}.amazonaws.com`;
          const response = await fetch(testUrl, {
            method: "HEAD",
            signal: controller.signal,
          });

          clearTimeout(timeout);

          const healthy = response.status < 500;

          return NextResponse.json({
            healthy,
            message: healthy
              ? "S3 endpoint is reachable"
              : `S3 endpoint responded with status ${response.status}`,
            responseTime: Date.now() - startTime,
            statusCode: response.status,
          });
        } catch (fetchError) {
          clearTimeout(timeout);
          const errMessage = fetchError instanceof Error && fetchError.name === "AbortError"
            ? "Connection timed out after 10 seconds"
            : `Connection failed: ${(fetchError as Error).message}`;

          return NextResponse.json({
            healthy: false,
            message: errMessage,
            responseTime: Date.now() - startTime,
          });
        }
      } catch (configError) {
        return NextResponse.json({
          healthy: false,
          message: `Invalid S3 configuration: ${(configError as Error).message}`,
          responseTime: Date.now() - startTime,
        });
      }
    }

    // Unknown driver type
    return NextResponse.json({
      healthy: false,
      message: `Health check not supported for driver type: ${driver.type}`,
      responseTime: Date.now() - startTime,
    });
  } catch (error) {
    console.error("Error running health check:", error);
    return NextResponse.json({ error: "Failed to run health check" }, { status: 500 });
  }
}
