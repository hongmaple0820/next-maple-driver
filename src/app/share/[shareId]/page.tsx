import { type Metadata } from "next";
import { ShareClientWrapper } from "./share-client";

export const metadata: Metadata = {
  title: "Shared File - CloudDrive",
  description: "Access a shared file on CloudDrive",
};

interface SharePageProps {
  params: Promise<{ shareId: string }>;
}

export default async function SharePage({ params }: SharePageProps) {
  const { shareId } = await params;

  return <ShareClientWrapper shareId={shareId} />;
}
