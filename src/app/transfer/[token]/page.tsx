import TransferClient from "./transfer-client";

interface TransferPageProps {
  params: Promise<{ token: string }>;
}

export default async function TransferPage({ params }: TransferPageProps) {
  const { token } = await params;
  return <TransferClient token={token} />;
}
