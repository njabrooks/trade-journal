import { redirect } from 'next/navigation';

interface EvidencePageProps {
  params: Promise<{ id: string }>;
}

/**
 * Redirect to Overview tab — Claims & Signals content has been merged into Overview.
 */
export default async function AssetThesisEvidencePage({ params }: EvidencePageProps) {
  const { id } = await params;
  redirect(`/asset-theses/${id}/overview`);
}
