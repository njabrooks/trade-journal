import { getMacroThesesList } from '@/db/queries/macroTheses';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { CreateThesisButton } from '@/components/theses/CreateThesisButton';
import { UnifiedMacroThesisBrowser } from '@/components/theses/UnifiedMacroThesisBrowser';

export default async function MacroThesesPage() {
  const theses = await getMacroThesesList();

  return (
    <DashboardShell
      title="Macro Theses"
      subtitle="Cross-asset beliefs and secular trends"
      activeNav="theses"
    >
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div className="text-sm text-slate-600">
            {theses.length} {theses.length === 1 ? 'thesis' : 'theses'}
          </div>
          <CreateThesisButton />
        </div>

        {theses.length === 0 ? (
          <div className="bg-white rounded-lg border border-slate-200 p-12 text-center text-slate-500">
            No macro theses yet. Create your first thesis to get started.
          </div>
        ) : (
          <UnifiedMacroThesisBrowser theses={theses} />
        )}
      </div>
    </DashboardShell>
  );
}
