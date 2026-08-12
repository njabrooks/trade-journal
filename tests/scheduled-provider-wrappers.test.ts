import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = process.cwd();
const temporaryDirectories: string[] = [];

type ScheduledJob = {
  id: string;
  wrapper: string;
  selector: string;
  args: string[];
  logName: string;
  lockName: string;
  statusName: string;
  invocationEnv: string;
  timeoutEnv: string;
  disabledEnv: string;
  claudeEnv: string;
  rollbackEnv: string;
  skipEnv: string;
  governedNeedle: string;
  legacyNeedle: string;
  selectorEnv?: (directory: string) => Record<string, string>;
};

const jobs: ScheduledJob[] = [
  {
    id: 'maintenance',
    wrapper: 'scripts/cron/maintenance.sh',
    selector: 'scripts/cron/maintenance-invocation.sh',
    args: [],
    logName: 'maintenance.log',
    lockName: '.maintenance.lock',
    statusName: 'maintenance',
    invocationEnv: 'TJ_MAINTENANCE_INVOCATION_BIN',
    timeoutEnv: 'TJ_MAINTENANCE_TIMEOUT_SECONDS',
    disabledEnv: 'TJ_MAINTENANCE_DISABLED',
    claudeEnv: 'TJ_MAINTENANCE_CLAUDE_BIN',
    rollbackEnv: 'TJ_MAINTENANCE_ROLLBACK_MARKER',
    skipEnv: 'TJ_MAINTENANCE_SKIP_ENV',
    governedNeedle: 'capabilities/belief-maintenance/adapters/claude.md',
    legacyNeedle: '-p /maintenance --model opus',
  },
  {
    id: 'thesis-observe',
    wrapper: 'scripts/cron/thesis-observe.sh',
    selector: 'scripts/cron/thesis-observe-invocation.sh',
    args: [],
    logName: 'thesis-observe.log',
    lockName: '.thesis-observe.lock',
    statusName: 'thesis-observe',
    invocationEnv: 'TJ_THESIS_OBSERVE_INVOCATION_BIN',
    timeoutEnv: 'TJ_THESIS_OBSERVE_TIMEOUT_SECONDS',
    disabledEnv: 'TJ_THESIS_OBSERVE_DISABLED',
    claudeEnv: 'TJ_THESIS_OBSERVE_CLAUDE_BIN',
    rollbackEnv: 'TJ_THESIS_OBSERVE_ROLLBACK_MARKER',
    skipEnv: 'TJ_THESIS_OBSERVE_SKIP_ENV',
    governedNeedle: 'capabilities/thesis-observation/adapters/claude.md',
    legacyNeedle: '-p /thesis-observe --model opus',
  },
  {
    id: 'options-advisor-batch',
    wrapper: 'scripts/cron/options-advisor-run.sh',
    selector: 'scripts/cron/options-advisor-invocation.sh',
    args: ['batch'],
    logName: 'options-advisor-batch.log',
    lockName: '.options-advisor-batch.lock',
    statusName: 'options-advisor-batch',
    invocationEnv: 'TJ_OPTIONS_ADVISOR_INVOCATION_BIN',
    timeoutEnv: 'TJ_OPTIONS_ADVISOR_TIMEOUT_SECONDS',
    disabledEnv: 'TJ_OPTIONS_ADVISOR_BATCH_DISABLED',
    claudeEnv: 'TJ_OPTIONS_ADVISOR_CLAUDE_BIN',
    rollbackEnv: 'TJ_OPTIONS_ADVISOR_ROLLBACK_MARKER',
    skipEnv: 'TJ_OPTIONS_ADVISOR_SKIP_ENV',
    governedNeedle: 'capabilities/portfolio-options-advice/adapters/claude.md',
    legacyNeedle: '-p /options-advisor Scheduled morning batch run.',
  },
  {
    id: 'options-advisor-leap',
    wrapper: 'scripts/cron/options-advisor-run.sh',
    selector: 'scripts/cron/options-advisor-invocation.sh',
    args: ['leap'],
    logName: 'options-advisor-leap.log',
    lockName: '.options-advisor-leap.lock',
    statusName: 'options-advisor-leap',
    invocationEnv: 'TJ_OPTIONS_ADVISOR_INVOCATION_BIN',
    timeoutEnv: 'TJ_OPTIONS_ADVISOR_TIMEOUT_SECONDS',
    disabledEnv: 'TJ_OPTIONS_ADVISOR_LEAP_DISABLED',
    claudeEnv: 'TJ_OPTIONS_ADVISOR_CLAUDE_BIN',
    rollbackEnv: 'TJ_OPTIONS_ADVISOR_ROLLBACK_MARKER',
    skipEnv: 'TJ_OPTIONS_ADVISOR_SKIP_ENV',
    governedNeedle: 'capabilities/portfolio-options-advice/adapters/claude.md',
    legacyNeedle: '-p /options-advisor Scheduled leap_entry run.',
    selectorEnv: createEligibleLeapEnvironment,
  },
  {
    id: 'morning-brief',
    wrapper: 'scripts/cron/morning-brief.sh',
    selector: 'scripts/cron/morning-brief-invocation.sh',
    args: [],
    logName: 'morning-brief.log',
    lockName: '.morning-brief.lock',
    statusName: 'morning-brief',
    invocationEnv: 'TJ_MORNING_BRIEF_INVOCATION_BIN',
    timeoutEnv: 'TJ_MORNING_BRIEF_TIMEOUT_SECONDS',
    disabledEnv: 'TJ_MORNING_BRIEF_DISABLED',
    claudeEnv: 'TJ_MORNING_BRIEF_CLAUDE_BIN',
    rollbackEnv: 'TJ_MORNING_BRIEF_ROLLBACK_MARKER',
    skipEnv: 'TJ_MORNING_BRIEF_SKIP_ENV',
    governedNeedle: 'capabilities/morning-attention-brief/adapters/claude.md',
    legacyNeedle: '-p /morning-brief --model opus',
    selectorEnv: createMorningBriefEnvironment,
  },
];

function makeExecutable(path: string, body: string): string {
  writeFileSync(path, `#!/usr/bin/env bash\nset -euo pipefail\n${body}\n`);
  chmodSync(path, 0o755);
  return path;
}

function createEligibleLeapEnvironment(directory: string): Record<string, string> {
  const date = makeExecutable(
    join(directory, 'date'),
    'case "$*" in *%u*) echo 5;; *) echo 1000;; esac',
  );
  const nc = makeExecutable(join(directory, 'nc'), 'exit 0');
  const engine = makeExecutable(
    join(directory, 'leap-engine'),
    `printf '%s\\n' '{"scenario":"leap_entry","candidates":[],"skipped":[]}'`,
  );
  return {
    TJ_OPTIONS_ADVISOR_DATE_BIN: date,
    TJ_OPTIONS_ADVISOR_NC_BIN: nc,
    TJ_OPTIONS_ADVISOR_LEAP_ENGINE_BIN: engine,
  };
}

function createMorningBriefEnvironment(directory: string): Record<string, string> {
  return {
    TJ_MORNING_BRIEF_DATE_BIN: makeExecutable(join(directory, 'date'), 'echo 2026-08-12'),
  };
}

function createHarness(job: ScheduledJob) {
  const directory = mkdtempSync(join(tmpdir(), `scheduled-${job.id}-`));
  temporaryDirectories.push(directory);
  const calls = join(directory, 'provider-calls.log');
  const childPid = join(directory, 'child.pid');
  const childTerminated = join(directory, 'child-terminated');
  const notifications = join(directory, 'notifications.log');
  const invocation = makeExecutable(
    join(directory, 'provider-double'),
    `printf '%s\\n' "invoked:$*" >> "${calls}"
case "\${TJ_TEST_PROVIDER_BEHAVIOR:-success}" in
  success) printf '%s\\n' '{"success":true,"writes":["fixture"]}' ;;
  empty) printf '%s\\n' '{"success":true,"writes":[],"recommendations":[],"attention":[]}' ;;
  refusal) echo 'provider refusal: controlled unavailable input' >&2; exit 69 ;;
  failure) echo 'provider failure: controlled non-zero' >&2; exit 7 ;;
  timeout)
    (trap 'printf terminated > "${childTerminated}"; exit 0' TERM; while :; do sleep 1; done) &
    child=$!
    printf '%s' "$child" > "${childPid}"
    wait "$child"
    ;;
esac`,
  );
  const notification = makeExecutable(
    join(directory, 'notification-double'),
    `printf '%s\\n' "$*" >> "${notifications}"`,
  );
  const rollbackMarker = join(directory, 'use-legacy');

  const baseEnv: NodeJS.ProcessEnv = {
    PATH: process.env.PATH ?? '/usr/bin:/bin',
    HOME: process.env.HOME ?? tmpdir(),
    TMPDIR: process.env.TMPDIR ?? tmpdir(),
    LANG: process.env.LANG ?? 'C',
    NODE_ENV: 'test',
    TJ_ROOT: repoRoot,
    TJ_CRON_LOG_DIR: directory,
    TJ_CRON_NOTIFICATION_BIN: notification,
    [job.invocationEnv]: invocation,
    [job.timeoutEnv]: '5',
    [job.rollbackEnv]: rollbackMarker,
    [job.skipEnv]: '1',
    ...(job.selectorEnv?.(directory) ?? {}),
  };

  return {
    directory,
    calls,
    childPid,
    childTerminated,
    notifications,
    invocation,
    rollbackMarker,
    env: baseEnv,
    run(extraEnv: Record<string, string> = {}) {
      return spawnSync('/bin/bash', [resolve(repoRoot, job.wrapper), ...job.args], {
        cwd: repoRoot,
        encoding: 'utf8',
        timeout: 15_000,
        env: { ...baseEnv, ...extraEnv } as NodeJS.ProcessEnv,
      });
    },
    log() {
      return readFileSync(join(directory, job.logName), 'utf8');
    },
    status() {
      return readFileSync(join(directory, 'cron-status.tsv'), 'utf8');
    },
  };
}

function selectorPath(job: ScheduledJob): string {
  return resolve(repoRoot, job.selector);
}

function realSelectorWithProviderDouble(
  job: ScheduledJob,
  harness: ReturnType<typeof createHarness>,
): Record<string, string> {
  return {
    [job.invocationEnv]: selectorPath(job),
    [job.claudeEnv]: harness.invocation,
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('scheduled provider wrappers at their process boundaries', () => {
  for (const job of jobs) {
    describe(job.id, () => {
      it('skips an active lock and recovers a stale lock', () => {
        const active = createHarness(job);
        writeFileSync(join(active.directory, job.lockName), 'active');

        expect(active.run().status).toBe(0);
        expect(active.log()).toContain('Previous run still in progress');
        expect(existsSync(active.calls)).toBe(false);

        const staleTime = new Date(Date.now() - 2 * 60 * 60 * 1000);
        utimesSync(join(active.directory, job.lockName), staleTime, staleTime);
        expect(active.run().status).toBe(0);
        expect(active.log()).toContain('Stale lock found');
        expect(readFileSync(active.calls, 'utf8')).toContain('invoked:');
        expect(existsSync(join(active.directory, job.lockName))).toBe(false);
      });

      it('records success and empty results without notifying', () => {
        const success = createHarness(job);
        expect(
          success.run({
            TJ_TEST_PROVIDER_BEHAVIOR: 'success',
            ...realSelectorWithProviderDouble(job, success),
          }).status,
        ).toBe(0);
        expect(success.log()).toContain('"writes":["fixture"]');
        expect(success.log()).toContain('complete');
        expect(success.status()).toMatch(new RegExp(`\\t${job.statusName}\\t0\\n$`));
        expect(existsSync(success.notifications)).toBe(false);

        const empty = createHarness(job);
        expect(
          empty.run({
            TJ_TEST_PROVIDER_BEHAVIOR: 'empty',
            ...realSelectorWithProviderDouble(job, empty),
          }).status,
        ).toBe(0);
        expect(empty.log()).toContain('"writes":[]');
        expect(empty.log()).toContain('complete');
        expect(empty.status()).toMatch(new RegExp(`\\t${job.statusName}\\t0\\n$`));
        expect(existsSync(empty.notifications)).toBe(false);
      });

      it('records provider refusal and failure while preserving the wrapper zero-exit policy', () => {
        for (const [behavior, providerStatus] of [
          ['refusal', 69],
          ['failure', 7],
        ] as const) {
          const harness = createHarness(job);
          const result = harness.run({
            TJ_TEST_PROVIDER_BEHAVIOR: behavior,
            ...realSelectorWithProviderDouble(job, harness),
          });
          expect(result.status).toBe(0);
          expect(harness.log()).toContain(`${behavior === 'refusal' ? 'provider refusal' : 'provider failure'}:`);
          expect(harness.log()).toContain(`exited non-zero (rc=${providerStatus})`);
          expect(harness.status()).toMatch(new RegExp(`\\t${job.statusName}\\t${providerStatus}\\n$`));
          expect(readFileSync(harness.notifications, 'utf8')).toContain(`failed (rc=${providerStatus})`);
        }
      });

      it('times out the provider process group and terminates its child', () => {
        const harness = createHarness(job);
        const result = harness.run({
          TJ_TEST_PROVIDER_BEHAVIOR: 'timeout',
          [job.timeoutEnv]: '1',
          ...realSelectorWithProviderDouble(job, harness),
        });

        expect(result.status).toBe(0);
        expect(harness.log()).toContain('TIMED OUT after 1s');
        expect(harness.status()).toMatch(new RegExp(`\\t${job.statusName}\\t124\\n$`));
        expect(readFileSync(harness.notifications, 'utf8')).toContain('failed (rc=124)');
        expect(readFileSync(harness.childTerminated, 'utf8')).toBe('terminated');
        const pid = Number(readFileSync(harness.childPid, 'utf8'));
        expect(() => process.kill(pid, 0)).toThrow();
      });

      it('honors the wrapper off-switch without invoking the provider', () => {
        const harness = createHarness(job);
        const result = harness.run({ [job.disabledEnv]: '1' });

        expect(result.status).toBe(0);
        expect(harness.log()).toContain('disabled by wrapper off-switch; skipping');
        expect(harness.status()).toMatch(new RegExp(`\\t${job.statusName}\\t0\\n$`));
        expect(existsSync(harness.calls)).toBe(false);
      });

      it('selects governed execution and rolls back immediately in both directions', () => {
        const harness = createHarness(job);
        const claude = makeExecutable(join(harness.directory, 'claude-double'), `printf '%s\\n' "$*"`);
        const selectorEnv = {
          [job.invocationEnv]: selectorPath(job),
          [job.claudeEnv]: claude,
        };

        expect(harness.run(selectorEnv).status).toBe(0);
        expect(harness.log()).toContain(job.governedNeedle);

        writeFileSync(harness.rollbackMarker, 'rollback');
        expect(harness.run(selectorEnv).status).toBe(0);
        expect(harness.log()).toContain(job.legacyNeedle);

        unlinkSync(harness.rollbackMarker);
        expect(harness.run(selectorEnv).status).toBe(0);
        const finalLog = harness.log();
        expect(finalLog.lastIndexOf(job.governedNeedle)).toBeGreaterThan(finalLog.lastIndexOf(job.legacyNeedle));
      });
    });
  }

  it('keeps batch and LEAP locks mode-specific', () => {
    const batch = jobs.find((job) => job.id === 'options-advisor-batch')!;
    const leap = jobs.find((job) => job.id === 'options-advisor-leap')!;
    const harness = createHarness(leap);
    writeFileSync(join(harness.directory, batch.lockName), 'active batch lock');

    expect(harness.run().status).toBe(0);
    expect(readFileSync(harness.calls, 'utf8')).toContain('invoked:leap live');
    expect(harness.log()).toContain('options-advisor-leap complete');
  });
});
