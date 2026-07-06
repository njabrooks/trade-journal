#!/usr/bin/env tsx
/**
 * check-cron-health — surface failing/stale launchd cron jobs at session start.
 *
 * The on-device cron wrappers (scripts/cron/*.sh) append one line per run to
 * logs/cron-status.tsv: `<ISO-8601 UTC>\t<job>\t<rc>`. This script reads that file
 * and reports (a) trailing consecutive-failure streaks and (b) jobs that haven't
 * run within their expected cadence — so an expired Claude CLI login or an
 * unloaded launchd plist surfaces in the next session, not a week later
 * (incident 2026-06-27→07-03: thesis-observe + maintenance failed daily on
 * "Not logged in" with nothing but log lines to show for it).
 *
 * Usage:
 *   npx tsx scripts/ops/check-cron-health.ts           # full per-job table
 *   npx tsx scripts/ops/check-cron-health.ts --nudge   # one line per problem job; silent when healthy
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { Socket } from 'net';

const STATUS_FILE = join(process.cwd(), 'logs', 'cron-status.tsv');

// IB Gateway API port (IBC-managed, local.ibc-gateway launchd job — docs/v2/21).
// Expected up Mon-Fri after the Monday 2FA tap; down on weekends is normal
// (IBKR weekly auth reset), so the probe only warns on weekdays.
const IB_GATEWAY_PORT = 4001;

function ibGatewayUp(): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = new Socket();
    const done = (up: boolean) => {
      sock.destroy();
      resolve(up);
    };
    sock.setTimeout(1500);
    sock.once('connect', () => done(true));
    sock.once('timeout', () => done(false));
    sock.once('error', () => done(false));
    sock.connect(IB_GATEWAY_PORT, '127.0.0.1');
  });
}

// Max hours between runs before a job counts as stale (≈2× cadence, weekend-tolerant).
const EXPECTED_INTERVAL_HOURS: Record<string, number> = {
  'thesis-observe': 48, // daily 07:00
  maintenance: 24, // twice daily 08:00/20:00
  'collect-signal-data': 48, // daily 06:30
  'options-scanner': 96, // weekdays 14:50
  'regime-scan': 96, // weekdays 07:40/15:10/21:10 (weekend-tolerant)
  'options-advisor-batch': 96, // weekdays 08:05
  'options-advisor-leap': 96, // weekdays 15:20
};

// Failure streak length that triggers a warning (1 flake is tolerated).
const STREAK_THRESHOLD = 2;

interface JobHealth {
  job: string;
  lastRun: Date;
  lastRc: number;
  lastSuccess: Date | null;
  trailingFailures: number;
  totalRuns: number;
}

function loadHealth(): JobHealth[] {
  if (!existsSync(STATUS_FILE)) return [];
  const byJob = new Map<string, { ts: Date; rc: number }[]>();
  for (const line of readFileSync(STATUS_FILE, 'utf8').split('\n')) {
    const [ts, job, rc] = line.trim().split('\t');
    if (!ts || !job || rc === undefined) continue;
    const date = new Date(ts);
    if (isNaN(date.getTime())) continue;
    if (!byJob.has(job)) byJob.set(job, []);
    byJob.get(job)!.push({ ts: date, rc: Number(rc) });
  }

  const health: JobHealth[] = [];
  for (const [job, runs] of byJob) {
    runs.sort((a, b) => a.ts.getTime() - b.ts.getTime());
    let trailingFailures = 0;
    for (let i = runs.length - 1; i >= 0 && runs[i].rc !== 0; i--) trailingFailures++;
    const lastSuccess = [...runs].reverse().find((r) => r.rc === 0)?.ts ?? null;
    const last = runs[runs.length - 1];
    health.push({
      job,
      lastRun: last.ts,
      lastRc: last.rc,
      lastSuccess,
      trailingFailures,
      totalRuns: runs.length,
    });
  }
  return health.sort((a, b) => b.trailingFailures - a.trailingFailures);
}

function problems(health: JobHealth[]): string[] {
  const now = Date.now();
  const out: string[] = [];
  for (const h of health) {
    if (h.trailingFailures >= STREAK_THRESHOLD) {
      const since = h.lastSuccess ? h.lastSuccess.toISOString().slice(0, 10) : 'never';
      out.push(
        `⚠ cron '${h.job}' has failed ${h.trailingFailures} consecutive runs (last success: ${since}, last rc=${h.lastRc}) — check logs/${h.job}.log` +
          (h.lastRc === 1 ? ' (rc=1 from a claude-driven job is often an expired CLI login: run `claude /login`)' : '')
      );
      continue;
    }
    const maxHours = EXPECTED_INTERVAL_HOURS[h.job];
    if (maxHours && now - h.lastRun.getTime() > maxHours * 3600_000) {
      const days = ((now - h.lastRun.getTime()) / 86400_000).toFixed(1);
      out.push(
        `⚠ cron '${h.job}' hasn't run in ${days} days (expected every ≤${maxHours}h) — is the launchd plist loaded?`
      );
    }
  }
  return out;
}

async function main() {
  const nudge = process.argv.includes('--nudge');
  const health = loadHealth();

  const day = new Date().getDay(); // local (Europe/London box)
  const isWeekday = day >= 1 && day <= 5;
  const gatewayWarning =
    isWeekday && !(await ibGatewayUp())
      ? `⚠ IB Gateway not reachable on :${IB_GATEWAY_PORT} — regime scans + advisor quotes degraded. Monday? approve the IBKR 2FA prompt on your phone; otherwise check \`launchctl list local.ibc-gateway\` + ~/ibc/logs/ibc-gateway.log`
      : null;

  if (nudge) {
    // Session-start signal: print only when something needs attention.
    for (const p of problems(health)) console.log(p);
    if (gatewayWarning) console.log(gatewayWarning);
    return;
  }

  if (health.length === 0) {
    console.log(`No cron status recorded yet (${STATUS_FILE} missing or empty).`);
  } else {
    console.log('Cron job health (from logs/cron-status.tsv):\n');
    for (const h of health) {
      const status = h.trailingFailures === 0 ? '✅' : h.trailingFailures >= STREAK_THRESHOLD ? '🔴' : '🟡';
      console.log(
        `${status} ${h.job.padEnd(20)} last run ${h.lastRun.toISOString()} (rc=${h.lastRc})  trailing failures: ${h.trailingFailures}  last success: ${h.lastSuccess ? h.lastSuccess.toISOString() : 'never'}  runs recorded: ${h.totalRuns}`
      );
    }
    const p = problems(health);
    if (p.length) console.log('\n' + p.join('\n'));
  }
  console.log(
    gatewayWarning ?? `${isWeekday ? '✅' : 'ℹ️'} IB Gateway :${IB_GATEWAY_PORT} ${isWeekday ? 'reachable' : 'not probed on weekends'}`
  );
}

main();
