import { type Metadata } from "next";
import TransferUploadClient from "./transfer-upload-client";

export const metadata: Metadata = {
  title: "Mobile Upload - CloudDrive",
  description: "Upload files to CloudDrive via QR code",
};

interface TransferUploadPageProps {
  searchParams: Promise<{ session?: string }>;
}

export default async function TransferUploadPage({ searchParams }: TransferUploadPageProps) {
  const { session } = await searchParams;
  return <TransferUploadClient sessionId={session || ""} />;
}
