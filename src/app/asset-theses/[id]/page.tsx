import { redirect } from 'next/navigation';

interface AssetThesisPageProps {
  params: Promise<{ id: string }>;
}

export default async function AssetThesisPage({ params }: AssetThesisPageProps) {
  const { id } = await params;
  redirect(`/asset-theses/${id}/overview`);
}
