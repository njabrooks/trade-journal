"use client";

import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { DecisionPacketRow, type PatchDecision } from "./DecisionPacketRow";
import { ENTITY_PATHS, STALE_AGE_DAYS, type DecisionGroup } from "./shared";

const OBJECT_TYPE_LABELS: Record<string, string> = {
  macro_thesis: "Macro thesis",
  asset_thesis: "Asset thesis",
  strategy: "Strategy",
  signal: "Signal",
  claim: "Claim",
  underlying: "Underlying",
  position: "Position",
};

/**
 * One card per thesis/object bundling its active decision packets (Lane B §1 —
 * thesis-level altitude, the doc-19 lesson). Escalates the whole card when its
 * oldest packet has gone stale.
 */
export function DecisionObjectCard({ group, onPatch }: { group: DecisionGroup; onPatch: PatchDecision }) {
  const href = ENTITY_PATHS[group.objectType]?.(group.objectId);
  const title = group.objectTitle ?? OBJECT_TYPE_LABELS[group.objectType] ?? group.objectType;
  const stale = group.maxAgeDays > STALE_AGE_DAYS;

  return (
    <Card className={cn("gap-3 py-4", stale && "border-red-500/40")}>
      <CardHeader className="px-4">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          {href ? (
            <Link href={href} className="hover:underline">
              {title}
            </Link>
          ) : (
            <span>{title}</span>
          )}
          <Badge variant="secondary">{OBJECT_TYPE_LABELS[group.objectType] ?? group.objectType}</Badge>
          {group.items.length > 1 && (
            <span className="text-xs font-normal text-muted-foreground">
              {group.items.length} decisions
            </span>
          )}
          {stale && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-red-500">
              <TriangleAlert className="h-3 w-3" />
              {group.maxAgeDays}d old
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4">
        <ul className="divide-y divide-border">
          {group.items.map((item) => (
            <DecisionPacketRow key={item.id} item={item} onPatch={onPatch} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
