/**
 * Manual scanner re-run.
 *
 * Recomputes regime metrics + writes a new vol_scan_ticker_snapshots row set
 * using whatever chain data is currently in options_chain_snapshots. Does NOT
 * re-fetch from Massive — for that, use the Claude conversation to run
 * `npx tsx scripts/ingest-radar-back-months.ts` first.
 *
 * Typical latency: ~30s. Spawns `npx tsx scripts/scan-cheap-options.ts` as a
 * child process and waits for completion.
 */

import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { resolve as pathResolve } from 'path';

export const maxDuration = 120;

export async function POST() {
  const scriptPath = pathResolve(process.cwd(), 'scripts/scan-cheap-options.ts');

  try {
    const stdout = await new Promise<string>((resolveP, rejectP) => {
      execFile(
        'npx',
        ['tsx', scriptPath],
        {
          cwd: process.cwd(),
          timeout: 110_000,
          maxBuffer: 10 * 1024 * 1024,
          env: { ...process.env },
        },
        (error, out, err) => {
          if (error) {
            console.error('[scanner-rerun] script error:', err);
            rejectP(new Error(err || error.message));
            return;
          }
          resolveP(out);
        }
      );
    });

    // The script logs its summary line near the end; extract last line for response.
    const lines = stdout.split('\n').filter((l) => l.trim());
    const summary = lines[lines.length - 1] ?? '';

    return NextResponse.json({
      success: true,
      summary,
      message: 'Scanner re-run complete. Refresh the page to see updated metrics.',
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Scanner re-run failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
