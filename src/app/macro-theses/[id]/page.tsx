import { redirect } from 'next/navigation';

interface MacroThesisPageProps {
  params: Promise<{ id: string }>;
}

/**
 * Redirect to Overview tab by default.
 */
export default async function MacroThesisPage({ params }: MacroThesisPageProps) {
  const { id } = await params;
  redirect(`/macro-theses/${id}/overview`);
}
