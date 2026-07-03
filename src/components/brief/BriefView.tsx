"use client";

import { useCallback, useState } from "react";
import { Check, Copy } from "lucide-react";
import { MarkdownDisplay } from "@/components/ui/markdown-display";

export interface AttentionItem {
  title: string;
  why: string;
  deepLink: string;
}

export interface Brief {
  id: string;
  briefDate: string;
  headline: string;
  attention: AttentionItem[];
  bodyMd: string | null;
  updatedAt: string;
}

/**
 * Shared renderer for one morning brief (docs/v2/20 Lane A) — headline, the ranked
 * attention list (each with a copyable deep-link command for a terminal session), and
 * the body. Used by the dashboard MorningBrief module (compact, collapsible body) and
 * the /brief history page (full, body always shown). Read-only: a brief never mutates
 * the belief layer.
 */
export function BriefView({ brief, showBody = true }: { brief: Brief; showBody?: boolean }) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const copyCommand = useCallback(async (command: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(command);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx((cur) => (cur === idx ? null : cur)), 1500);
    } catch {
      // clipboard unavailable (non-secure context) — nothing to do
    }
  }, []);

  return (
    <div>
      <p className="text-sm font-medium">{brief.headline}</p>

      {brief.attention.length > 0 && (
        <ol className="mt-3 space-y-2">
          {brief.attention.map((item, idx) => (
            <li key={idx} className="flex items-start gap-2 text-sm">
              <span className="mt-0.5 w-4 shrink-0 text-right text-xs font-semibold text-sky-600 dark:text-sky-400">
                {idx + 1}.
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium">{item.title}</span>
                  <button
                    type="button"
                    onClick={() => copyCommand(item.deepLink, idx)}
                    className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                    title="Copy command"
                  >
                    {item.deepLink}
                    {copiedIdx === idx ? (
                      <Check className="h-3 w-3 text-emerald-500" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </button>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{item.why}</p>
              </div>
            </li>
          ))}
        </ol>
      )}

      {showBody && brief.bodyMd && (
        <div className="mt-4 border-t border-border/60 pt-3">
          <MarkdownDisplay content={brief.bodyMd} />
        </div>
      )}
    </div>
  );
}
