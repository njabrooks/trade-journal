import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { resolve } from 'path';

export const maxDuration = 60; // Allow up to 60s for API fetch + computation

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  const ticker = params.get('ticker');
  const direction = params.get('direction');
  const targetBase = params.get('targetBase');
  const targetHigh = params.get('targetHigh');
  const horizonMonths = params.get('horizonMonths');
  const horizonRange = params.get('horizonRange') || '2';
  const downsideFloor = params.get('downsideFloor');

  if (!ticker || !direction || !targetBase || !targetHigh || !horizonMonths || !downsideFloor) {
    return NextResponse.json(
      { error: 'Missing required parameters: ticker, direction, targetBase, targetHigh, horizonMonths, downsideFloor' },
      { status: 400 }
    );
  }

  const scriptPath = resolve(process.cwd(), 'scripts/vol-curve-analyze.ts');
  const args = [
    scriptPath,
    '--ticker', ticker.toUpperCase(),
    '--direction', direction,
    '--target-base', targetBase,
    '--target-high', targetHigh,
    '--horizon-months', horizonMonths,
    '--horizon-range', horizonRange,
    '--downside-floor', downsideFloor,
  ];

  try {
    const result = await new Promise<string>((resolve, reject) => {
      execFile('npx', ['tsx', ...args], {
        cwd: process.cwd(),
        timeout: 55000,
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env },
      }, (error, stdout, stderr) => {
        if (error) {
          console.error('[vol-curve] Script error:', stderr);
          reject(new Error(stderr || error.message));
          return;
        }
        resolve(stdout);
      });
    });

    // Filter out dotenv noise from stdout
    const jsonLines = result.split('\n').filter(
      line => !line.startsWith('[dotenv')
    ).join('\n');

    const data = JSON.parse(jsonLines);
    return NextResponse.json(data);
  } catch (error) {
    console.error('[vol-curve] Error:', error);
    return NextResponse.json(
      {
        error: 'Analysis failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
