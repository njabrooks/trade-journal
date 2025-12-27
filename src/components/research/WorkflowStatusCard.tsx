'use client';

import { Button } from '@/components/ui/button';
import { CheckCircle2, Circle, Clock } from 'lucide-react';

interface WorkflowStatusCardProps {
  hasClaimsStructure: boolean;
  mainClaimsCount: number;
  evidenceClaimsCount: number;
  unconvertedCount: number;
  convertedCount: number;
  onViewUnconverted?: () => void;
}

interface ChecklistItemProps {
  done: boolean;
  inProgress?: boolean;
  children: React.ReactNode;
}

function ChecklistItem({ done, inProgress, children }: ChecklistItemProps) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex-shrink-0 mt-0.5">
        {done ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
        ) : inProgress ? (
          <Clock className="h-5 w-5 text-blue-600" />
        ) : (
          <Circle className="h-5 w-5 text-slate-300" />
        )}
      </div>
      <div
        className={`text-sm ${
          done
            ? 'text-slate-900 font-medium'
            : inProgress
              ? 'text-blue-700 font-medium'
              : 'text-slate-500'
        }`}
      >
        {children}
      </div>
    </div>
  );
}

export function WorkflowStatusCard({
  hasClaimsStructure,
  mainClaimsCount,
  evidenceClaimsCount,
  unconvertedCount,
  convertedCount,
  onViewUnconverted,
}: WorkflowStatusCardProps) {
  const allConverted = unconvertedCount === 0 && convertedCount > 0;

  return (
    <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border border-blue-200 p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Workflow Status</h3>
          <p className="text-sm text-slate-600 mt-1">
            Track your research processing progress
          </p>
        </div>
        {allConverted && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-full text-sm font-medium">
            <CheckCircle2 className="h-4 w-4" />
            Complete
          </div>
        )}
      </div>

      <div className="space-y-3">
        {/* Step 1: Uploaded */}
        <ChecklistItem done={true}>Uploaded to database</ChecklistItem>

        {/* Step 2: Claims Extracted */}
        <ChecklistItem done={hasClaimsStructure}>
          {hasClaimsStructure ? (
            <>
              Claims extracted{' '}
              <span className="text-slate-600 font-normal">
                ({mainClaimsCount} main, {evidenceClaimsCount} evidence)
              </span>
            </>
          ) : (
            'Claims not yet extracted'
          )}
        </ChecklistItem>

        {/* Step 3: Conversion Status */}
        {hasClaimsStructure && (
          <>
            <ChecklistItem done={allConverted} inProgress={unconvertedCount > 0}>
              {unconvertedCount > 0 ? (
                <>
                  <span className="text-blue-700">{unconvertedCount}</span> claim
                  {unconvertedCount !== 1 ? 's' : ''} ready to convert
                </>
              ) : convertedCount > 0 ? (
                'All claims processed'
              ) : (
                'No claims converted yet'
              )}
            </ChecklistItem>

            {/* Step 4: Converted Count */}
            {convertedCount > 0 && (
              <ChecklistItem done={true}>
                <span className="text-emerald-600">{convertedCount}</span> claim
                {convertedCount !== 1 ? 's' : ''} converted to hierarchy
              </ChecklistItem>
            )}
          </>
        )}
      </div>

      {/* Action Button */}
      {hasClaimsStructure && unconvertedCount > 0 && onViewUnconverted && (
        <div className="mt-6 pt-4 border-t border-blue-200">
          <Button onClick={onViewUnconverted} size="sm" className="w-full sm:w-auto">
            View {unconvertedCount} Unconverted Claim{unconvertedCount !== 1 ? 's' : ''} →
          </Button>
        </div>
      )}
    </div>
  );
}
