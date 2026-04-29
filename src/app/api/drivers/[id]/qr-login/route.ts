import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDriverFactory, invalidateDriver } from "@/lib/storage-drivers/manager";
import { QuarkDriver } from "@/lib/storage-drivers/quark-driver";
import { Drive115Driver } from "@/lib/storage-drivers/115-driver";
import { invalidateMountCache } from "@/lib/vfs";
import type { StorageDriverConfig } from "@/lib/storage-drivers/types";

/**
 * Supported QR code login driver types
 */
const QR_LOGIN_DRIVER_TYPES = ["quark", "115"] as const;
type QrLoginDriverType = (typeof QR_LOGIN_DRIVER_TYPES)[number];

function isQrLoginDriver(type: string): type is QrLoginDriverType {
  return QR_LOGIN_DRIVER_TYPES.includes(type as QrLoginDriverType);
}

/**
 * GET /api/drivers/[id]/qr-login - Request a QR code for login
 *
 * Returns a QR code token and image URL for the user to scan with the
 * corresponding mobile app (Quark or 115).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { id } = await params;

    // Find the driver in the database
    const driverRecord = await db.storageDriver.findUnique({ where: { id } });
    if (!driverRecord) {
      return NextResponse.json({ error: "Driver not found" }, { status: 404 });
    }

    const driverType = driverRecord.type as string;

    // Only supported driver types allow QR code login
    if (!isQrLoginDriver(driverType)) {
      return NextResponse.json(
        { error: `QR code login not supported for driver type: ${driverType}` },
        { status: 400 }
      );
    }

    // Get the factory and create a driver instance
    const factory = await getDriverFactory(driverType);
    if (!factory) {
      return NextResponse.json(
        { error: `${driverType} driver factory not found` },
        { status: 500 }
      );
    }

    // Parse the stored config
    const parsedConfig = JSON.parse(driverRecord.config || "{}");

    const storageConfig: StorageDriverConfig = {
      id: driverRecord.id,
      name: driverRecord.name,
      type: driverType as StorageDriverConfig["type"],
      config: parsedConfig,
      isDefault: driverRecord.isDefault,
      isEnabled: driverRecord.isEnabled,
      createdAt: driverRecord.createdAt,
      updatedAt: driverRecord.updatedAt,
    };

    // Create driver instance
    const driver = factory.create(storageConfig);

    // Handle QR code request based on driver type
    if (driverType === "quark") {
      if (!(driver instanceof QuarkDriver)) {
        return NextResponse.json(
          { error: "Failed to create Quark driver instance" },
          { status: 500 }
        );
      }

      const qrResult = await driver.requestQrCode();

      return NextResponse.json({
        success: true,
        driverType: "quark",
        token: qrResult.token,
        imageUrl: qrResult.imageUrl,
        qrcodeUrl: qrResult.qrcodeUrl,
        message: "请使用夸克网盘 App 扫描二维码登录",
      });
    }

    if (driverType === "115") {
      if (!(driver instanceof Drive115Driver)) {
        return NextResponse.json(
          { error: "Failed to create 115 driver instance" },
          { status: 500 }
        );
      }

      const qrResult = await driver.requestQrCode();

      return NextResponse.json({
        success: true,
        driverType: "115",
        uid: qrResult.uid,
        time: qrResult.time,
        sign: qrResult.sign,
        imageUrl: qrResult.imageUrl,
        message: "请使用115网盘 App 扫描二维码登录",
      });
    }

    return NextResponse.json(
      { error: `QR code login not implemented for driver type: ${driverType}` },
      { status: 400 }
    );
  } catch (error) {
    console.error("Error requesting QR code:", error);
    return NextResponse.json(
      {
        error: "Failed to request QR code",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/drivers/[id]/qr-login - Check QR code scan status
 *
 * For Quark: Accepts a QR code token and checks if the user has scanned it.
 * For 115: Accepts uid, time, sign and checks if the user has scanned it.
 * If confirmed, saves the cookies to the driver config.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { id } = await params;
    const body = await request.json();

    // Find the driver in the database
    const driverRecord = await db.storageDriver.findUnique({ where: { id } });
    if (!driverRecord) {
      return NextResponse.json({ error: "Driver not found" }, { status: 404 });
    }

    const driverType = driverRecord.type as string;

    // Only supported driver types allow QR code login
    if (!isQrLoginDriver(driverType)) {
      return NextResponse.json(
        { error: `QR code login not supported for driver type: ${driverType}` },
        { status: 400 }
      );
    }

    // Get the factory and create a driver instance
    const factory = await getDriverFactory(driverType);
    if (!factory) {
      return NextResponse.json(
        { error: `${driverType} driver factory not found` },
        { status: 500 }
      );
    }

    // Parse the stored config
    const parsedConfig = JSON.parse(driverRecord.config || "{}");

    const storageConfig: StorageDriverConfig = {
      id: driverRecord.id,
      name: driverRecord.name,
      type: driverType as StorageDriverConfig["type"],
      config: parsedConfig,
      isDefault: driverRecord.isDefault,
      isEnabled: driverRecord.isEnabled,
      createdAt: driverRecord.createdAt,
      updatedAt: driverRecord.updatedAt,
    };

    // Create driver instance
    const driver = factory.create(storageConfig);

    // Handle QR code status check based on driver type
    if (driverType === "quark") {
      const { token } = body;
      if (!token) {
        return NextResponse.json(
          { error: "QR code token is required" },
          { status: 400 }
        );
      }

      if (!(driver instanceof QuarkDriver)) {
        return NextResponse.json(
          { error: "Failed to create Quark driver instance" },
          { status: 500 }
        );
      }

      const statusResult = await driver.checkQrCodeStatus(token);

      // If confirmed, save cookies to the database
      if (statusResult.status === "confirmed" && statusResult.cookies) {
        const configWithCookies = { ...parsedConfig, cookies: statusResult.cookies };

        await db.storageDriver.update({
          where: { id },
          data: {
            config: JSON.stringify(configWithCookies),
            authType: "password",
            authStatus: "authorized",
            lastSyncAt: new Date(),
          },
        });

        invalidateDriver(id);
        invalidateMountCache();
      }

      return NextResponse.json({
        success: true,
        driverType: "quark",
        status: statusResult.status,
        message: statusResult.message,
        cookies: statusResult.cookies,
      });
    }

    if (driverType === "115") {
      const { uid, time, sign } = body;
      if (!uid || !time || !sign) {
        return NextResponse.json(
          { error: "uid, time, and sign are required for 115 QR code status check" },
          { status: 400 }
        );
      }

      if (!(driver instanceof Drive115Driver)) {
        return NextResponse.json(
          { error: "Failed to create 115 driver instance" },
          { status: 500 }
        );
      }

      const statusResult = await driver.checkQrCodeStatus(uid, time, sign);

      // If confirmed, save cookies to the database
      if (statusResult.status === "confirmed" && statusResult.cookies) {
        const configWithCookies = { ...parsedConfig, cookies: statusResult.cookies };

        await db.storageDriver.update({
          where: { id },
          data: {
            config: JSON.stringify(configWithCookies),
            authType: "password",
            authStatus: "authorized",
            lastSyncAt: new Date(),
          },
        });

        invalidateDriver(id);
        invalidateMountCache();
      }

      return NextResponse.json({
        success: true,
        driverType: "115",
        status: statusResult.status,
        message: statusResult.message,
        cookies: statusResult.cookies,
      });
    }

    return NextResponse.json(
      { error: `QR code status check not implemented for driver type: ${driverType}` },
      { status: 400 }
    );
  } catch (error) {
    console.error("Error checking QR code status:", error);
    return NextResponse.json(
      {
        error: "Failed to check QR code status",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
