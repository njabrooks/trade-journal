"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ChevronDown, ChevronRight, Copy, Sunrise } from "lucide-react";
import { MarkdownDisplay } from "@/components/ui/markdown-display";

interface AttentionItem {
  title: string;
  why: string;
  deepLink: string;
}

interface Brief {
  id: string;
  briefDate: string;
  headline: string;
  attention: AttentionItem[];
  bodyMd: string | null;
  updatedAt: string;
}

/**
 * Morning brief module (docs/v2/20 Lane A) — the daily synthesis surface at the top
 * of the morning screen. Renders the latest morning_briefs row: headline, the ranked
 * attention list (each with a copyable deep-link command for a terminal session),
 * and a collapsible body. Read-only: the brief never mutates the belief layer.
 */
export function MorningBrief() {
  const [brief, setBrief] = useState<Brief | null>(null);
  const [isStale, setIsStale] = useState(false);
  const [bodyOpen, setBodyOpen] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/dashboard/morning-brief")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const b: Brief | null = data?.brief ?? null;
        setBrief(b);
        if (b) {
          setIsStale(Date.now() - new Date(`${b.briefDate}T00:00:00Z`).getTime() > 2 * 86_400_000);
        }
      })
      .catch(() => {});
  }, []);

  const copyCommand = useCallback(async (command: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(command);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx((cur) => (cur === idx ? null : cur)), 1500);
    } catch {
      // clipboard unavailable (non-secure context) — nothing to do
    }
  }, []);

  if (!brief) return null;

  return (
    <section className="rounded-2xl border border-sky-500/40 bg-sky-500/5 p-4">
      <div className="mb-1 flex items-center gap-2">
        <Sunrise className="h-4 w-4 text-sky-500" />
        <h3 className="text-sm font-semibold">Morning brief</h3>
        <span className="text-xs text-muted-foreground">{brief.briefDate}</span>
        {isStale && (
          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
            stale
          </span>
        )}
      </div>

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

      {brief.bodyMd && (
        <div className="mt-3 border-t border-border/60 pt-2">
          <button
            type="button"
            onClick={() => setBodyOpen((o) => !o)}
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {bodyOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            {bodyOpen ? "Hide detail" : "Show detail"}
          </button>
          {bodyOpen && <MarkdownDisplay content={brief.bodyMd} className="mt-2" />}
        </div>
      )}
    </section>
  );
}
