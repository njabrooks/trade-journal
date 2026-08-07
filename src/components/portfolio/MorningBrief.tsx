"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Sunrise } from "lucide-react";
import { BriefView, type Brief } from "@/components/brief/BriefView";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseMorningBriefResponse(data: unknown): Brief | null {
  if (!isRecord(data) || !isRecord(data.brief)) return null;
  const brief = data.brief;
  if (
    typeof brief.id !== "string" ||
    typeof brief.briefDate !== "string" ||
    typeof brief.headline !== "string" ||
    !Array.isArray(brief.attention) ||
    (brief.bodyMd !== null && typeof brief.bodyMd !== "string") ||
    typeof brief.updatedAt !== "string"
  ) return null;
  const attention = brief.attention.filter((item): item is Brief["attention"][number] =>
    isRecord(item) &&
    typeof item.title === "string" &&
    typeof item.why === "string" &&
    typeof item.deepLink === "string"
  );
  if (attention.length !== brief.attention.length) return null;
  return {
    id: brief.id,
    briefDate: brief.briefDate,
    headline: brief.headline,
    attention,
    bodyMd: brief.bodyMd,
    updatedAt: brief.updatedAt,
  };
}

/**
 * Morning brief module (docs/v2/20 Lane A) — the daily synthesis surface at the top
 * of the morning screen. Renders the latest morning_briefs row via the shared
 * BriefView (headline + ranked attention list; body behind a toggle to keep the
 * dashboard compact). Past briefs live on /brief. Read-only: the brief never mutates
 * the belief layer.
 */
export function MorningBrief() {
  const [brief, setBrief] = useState<Brief | null>(null);
  const [isStale, setIsStale] = useState(false);
  const [bodyOpen, setBodyOpen] = useState(false);

  useEffect(() => {
    fetch("/api/dashboard/morning-brief")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const b = parseMorningBriefResponse(data);
        setBrief(b);
        if (b) {
          setIsStale(Date.now() - new Date(`${b.briefDate}T00:00:00Z`).getTime() > 2 * 86_400_000);
        }
      })
      .catch(() => {});
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
        <Link
          href="/brief"
          className="ml-auto text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          History →
        </Link>
      </div>

      <BriefView brief={brief} showBody={bodyOpen} />

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
        </div>
      )}
    </section>
  );
}
