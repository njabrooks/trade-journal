import { redirect } from 'next/navigation';

interface SignalPageProps {
  params: Promise<{ id: string; signalId: string }>;
}

export default async function LegacyAssetSignalPage({ params }: SignalPageProps) {
  const { signalId } = await params;
  redirect(`/signals/${signalId}`);
}
