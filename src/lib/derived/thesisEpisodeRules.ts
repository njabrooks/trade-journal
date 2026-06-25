/**
 * Pure episode-boundary derivation for thesis expression episodes (docs/v2/13 §2b, E1). No DB.
 *
 * An "expression episode" is a contiguous span during which a thesis was `monitoring`
 * (live expression — an active strategy). Performance and retrospectives key on episodes,
 * not the whole lifetime, so a thesis that closes and later re-expresses gets a fresh
 * retrospective per holding period rather than one record glued across both.
 *
 * Boundaries come from the status-change journal trail: every cascade + manual transition
 * persists `newState.status`, so the ordered sequence of entered statuses fully determines
 * the episodes. This module is the pure timeline→episodes mapper; the DB orchestration that
 * reads the journal and upserts rows lives in ./thesisEpisodes.
 *
 * §4 lean ⑦ (flicker guard): a monitoring span becomes a counted episode only when it ENDS
 * in a resolved status (closed/complete/rejected). A monitoring run that reverts to
 * developing/draft without resolving is sub-threshold flap and is dropped — it never held a
 * real, retrospect-able expression.
 */

export const MONITORING = 'monitoring';

/** Statuses whose entry closes (and thereby ratifies) a monitoring episode. */
export const CLOSING_STATUSES = ['closed', 'complete', 'rejected'] as const;

/** One ordered point in a thesis's status timeline — the status it ENTERED at `at`. */
export interface StatusPoint {
  /** Sortable timestamp the thesis entered `status` (e.g. ISO string). Opaque to this module — caller orders. */
  at: string;
  /** The status entered at `at` (journal `newState.status`). */
  status: string;
}

export interface DerivedEpisode {
  /** 1-based chronological index among counted episodes. */
  episodeNo: number;
  /** when the thesis entered monitoring. */
  openedAt: string;
  /** when it left monitoring into a closing status; null = still monitoring (open episode). */
  closedAt: string | null;
  /** the status that closed the episode (closed/complete/rejected); null while open. */
  closingStatus: string | null;
}

function isClosing(status: string): boolean {
  return (CLOSING_STATUSES as readonly string[]).includes(status);
}

/**
 * Reduce an ordered status timeline to expression episodes.
 *
 * @param points status entries, ascending by `at`. Caller is responsible for ordering;
 *               ties preserve array order. Statuses other than entries/exits of `monitoring`
 *               are pass-through context.
 */
export function deriveEpisodes(points: StatusPoint[]): DerivedEpisode[] {
  const episodes: DerivedEpisode[] = [];
  let openStart: string | null = null; // when the current monitoring run began (null = not monitoring)

  for (const p of points) {
    if (p.status === MONITORING) {
      // Enter monitoring (idempotent — repeated monitoring entries keep the original start).
      if (openStart === null) openStart = p.at;
      continue;
    }
    // Entered a non-monitoring status while a monitoring run was open → the run ends here.
    if (openStart !== null) {
      if (isClosing(p.status)) {
        episodes.push({
          episodeNo: episodes.length + 1,
          openedAt: openStart,
          closedAt: p.at,
          closingStatus: p.status,
        });
      }
      // else: flap (monitoring → developing/draft, no resolution) — drop the span (§4 lean ⑦).
      openStart = null;
    }
  }

  // Timeline ended while still monitoring → the current, open episode.
  if (openStart !== null) {
    episodes.push({
      episodeNo: episodes.length + 1,
      openedAt: openStart,
      closedAt: null,
      closingStatus: null,
    });
  }

  return episodes;
}
