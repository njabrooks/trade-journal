import {
  DECISION_TYPE_TIERS,
  UNTYPED_DECISION_TIER,
  type DecisionPacket,
} from "@/lib/types/decisions";

/** One decision_required journal row as served by /api/dashboard/decisions GET. */
export interface DecisionItem {
  id: string;
  objectType: string;
  objectId: string;
  objectTitle: string | null;
  actionDescription: string;
  rationale: string | null;
  timestamp: string;
  source: string;
  decision: DecisionPacket | null;
}

/** Packets on the same object bundled into one card (doc-19 lesson: thesis-level altitude). */
export interface DecisionGroup {
  key: string;
  objectType: string;
  objectId: string;
  objectTitle: string | null;
  items: DecisionItem[];
  /** most urgent tier across the group's packets (drives card order). */
  tier: number;
  /** oldest packet age in days (drives order within a tier; nothing rots silently). */
  maxAgeDays: number;
}

export const ENTITY_PATHS: Record<string, (id: string) => string> = {
  macro_thesis: (id) => `/macro-theses/${id}/overview`,
  asset_thesis: (id) => `/asset-theses/${id}/overview`,
  strategy: (id) => `/strategies/${id}/overview`,
  signal: (id) => `/signals/${id}`,
  claim: (id) => `/claims/${id}`,
};

/** Age past which a packet is visually escalated (Lane B §3). */
export const STALE_AGE_DAYS = 14;

export function decisionAgeDays(timestamp: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 86_400_000));
}

function packetTier(item: DecisionItem): number {
  return item.decision ? DECISION_TYPE_TIERS[item.decision.decision_type] : UNTYPED_DECISION_TIER;
}

/**
 * Group decisions one-card-per-object, ordered by the group's most urgent tier
 * (risk → belief upkeep → graph hygiene → additive — same ranking as list-decisions),
 * oldest first within a tier. Packets inside a group follow the same rule.
 */
export function groupDecisionsByObject(items: DecisionItem[]): DecisionGroup[] {
  const groups = new Map<string, DecisionGroup>();
  for (const item of items) {
    const key = `${item.objectType}:${item.objectId}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        objectType: item.objectType,
        objectId: item.objectId,
        objectTitle: item.objectTitle,
        items: [],
        tier: UNTYPED_DECISION_TIER,
        maxAgeDays: 0,
      };
      groups.set(key, group);
    }
    group.items.push(item);
    group.objectTitle ??= item.objectTitle;
    group.tier = Math.min(group.tier, packetTier(item));
    group.maxAgeDays = Math.max(group.maxAgeDays, decisionAgeDays(item.timestamp));
  }

  const result = [...groups.values()];
  for (const group of result) {
    group.items.sort((a, b) => {
      const ta = packetTier(a);
      const tb = packetTier(b);
      if (ta !== tb) return ta - tb;
      return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    });
  }
  result.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    return b.maxAgeDays - a.maxAgeDays;
  });
  return result;
}
