import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import dns from 'dns';
import net from 'net';
import tls from 'tls';
import { once } from 'events';
import * as schema from './schema';

// Configure DNS to use Google DNS for better resolution
dns.setServers(['8.8.8.8', '8.8.4.4']);

// Get connection type preference (defaults to 'pooler' for better compatibility)
// Set USE_DIRECT_CONNECTION=true to use direct connection (requires IPv6)
const useDirectConnection = process.env.USE_DIRECT_CONNECTION === 'true';

// Get connection strings from environment
const directConnectionString = process.env.DATABASE_URL_DIRECT;
const poolerConnectionString = process.env.DATABASE_URL_POOLER;

// Select connection string based on preference
const connectionString = useDirectConnection ? directConnectionString : poolerConnectionString;

if (!connectionString) {
  const missing = useDirectConnection
    ? 'DATABASE_URL_DIRECT'
    : 'DATABASE_URL_POOLER';
  throw new Error(
    `${missing} must be set in .env.local. ` +
    `Get connection strings from Supabase Dashboard > Settings > Database > Connection string`
  );
}

// ---------------------------------------------------------------------------
// Dead-socket watchdog (incident 2026-07-07: pool starvation after overnight
// system suspension — the Supabase pooler silently drops connections while the
// machine sleeps, the sockets stay "busy" forever, and every API route queues
// behind them until a manual `launchctl kickstart`).
//
// Why a custom socket factory instead of the usual knobs:
//   - TCP keepalive (postgres.js default keep_alive=60) demonstrably did not
//     detect these dead peers.
//   - supavisor in transaction mode IGNORES statement_timeout sent as a
//     startup parameter (verified empirically 2026-07-08: SHOW returns the
//     role default of 2min regardless), and it is server-side anyway — it
//     cannot free a client slot whose socket is dead.
//   - postgres.js has no client-side per-query timeout, and max_lifetime /
//     idle_timeout only recycle connections that go idle.
//
// The factory dials TCP and performs the postgres STARTTLS upgrade itself
// (postgres.js skips socket.connect() and its own TLS path for custom
// sockets), then watches the TLS socket's plaintext byte counters: if a
// non-destroyed socket moves no bytes for WATCHDOG_STALL_MS it is destroyed,
// which makes postgres.js reject its in-flight queries (CONNECTION_CLOSED),
// release the slot, and reconnect. The staleness check deliberately uses wall
// clock time, so after a long suspension every surviving socket is instantly
// stale and gets culled on the first tick after wake.
//
// The stall threshold must stay ABOVE the pooler's server-side
// statement_timeout (2min): no legitimate statement can be silent longer than
// that, so anything quieter is a dead peer. Set DB_WATCHDOG_STALL_MS to tune,
// or 0 to disable.
// ---------------------------------------------------------------------------

const WATCHDOG_STALL_MS = process.env.DB_WATCHDOG_STALL_MS !== undefined
  ? Number(process.env.DB_WATCHDOG_STALL_MS)
  : 150_000;
const WATCHDOG_TICK_MS = Math.min(15_000, Math.max(1_000, Math.floor(WATCHDOG_STALL_MS / 4) || 15_000));
const HANDSHAKE_PHASE_TIMEOUT_MS = 10_000;

// Postgres wire protocol SSLRequest: int32 length (8) + int32 code (80877103)
const SSL_REQUEST = Buffer.from([0x00, 0x00, 0x00, 0x08, 0x04, 0xd2, 0x16, 0x2f]);

function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${what} timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

// postgres.js strips ALL listeners from the socket during teardown
// (closed()/terminate() call removeAllListeners()); a write completing after
// that emits 'error' with no listeners attached and crashes the process
// (observed as `write EBADF` when validating the watchdog). Keep a noop
// 'error' listener alive across removeAllListeners() calls.
function guardLateSocketErrors(socket: tls.TLSSocket): void {
  const noop = () => {};
  socket.on('error', noop);
  const original = socket.removeAllListeners.bind(socket);
  socket.removeAllListeners = ((event?: string | symbol) => {
    const result = original(event as Parameters<typeof original>[0]);
    if (event === undefined || event === 'error') socket.on('error', noop);
    return result;
  }) as typeof socket.removeAllListeners;
}

function armWatchdog(socket: tls.TLSSocket): void {
  if (!WATCHDOG_STALL_MS) return;
  let lastBytes = -1;
  let lastActivityAt = Date.now();
  const timer = setInterval(() => {
    if (socket.destroyed) {
      clearInterval(timer);
      return;
    }
    const bytes = socket.bytesRead + socket.bytesWritten;
    if (bytes !== lastBytes) {
      lastBytes = bytes;
      lastActivityAt = Date.now();
      return;
    }
    if (Date.now() - lastActivityAt >= WATCHDOG_STALL_MS) {
      clearInterval(timer);
      socket.destroy(new Error(
        `db socket watchdog: no traffic for ${Date.now() - lastActivityAt}ms — assuming dead pooler connection`
      ));
    }
  }, WATCHDOG_TICK_MS);
  timer.unref();
}

async function watchdogSocket(options: { host: string[]; port: number[] }): Promise<net.Socket> {
  const host = options.host[0];
  const port = options.port[0];
  const raw = new net.Socket();
  // Raw-socket errors surface via the TLS socket postgres.js listens on;
  // this listener only prevents unhandled-'error' crashes from the raw layer.
  raw.on('error', () => {});
  try {
    const connected = once(raw, 'connect');
    raw.connect(port, host);
    await withTimeout(connected, HANDSHAKE_PHASE_TIMEOUT_MS, 'db TCP connect');
    // Kernel-level keepalive on the real fd (postgres.js also calls
    // setKeepAlive, but on the TLS wrapper).
    raw.setKeepAlive(true, 60_000);
    raw.write(SSL_REQUEST);
    const [reply] = (await withTimeout(once(raw, 'data'), HANDSHAKE_PHASE_TIMEOUT_MS, 'db SSLRequest reply')) as [Buffer];
    if (reply[0] !== 0x53 /* 'S' */) {
      throw new Error(`db server refused TLS upgrade (reply byte ${reply[0]})`);
    }
    const socket = tls.connect({ socket: raw, servername: host, rejectUnauthorized: false });
    await withTimeout(once(socket, 'secureConnect'), HANDSHAKE_PHASE_TIMEOUT_MS, 'db TLS handshake');
    guardLateSocketErrors(socket);
    armWatchdog(socket);
    return socket;
  } catch (err) {
    raw.destroy();
    // Never throw from the factory (postgres.js would skip its reconnect
    // machinery): hand back a socket that dies through the normal error path
    // after postgres.js has attached its listeners.
    const dud = new net.Socket();
    setImmediate(() => dud.destroy(err instanceof Error ? err : new Error(String(err))));
    return dud;
  }
}

// `socket` is a supported postgres.js option missing from its type definitions
type PostgresOptionsWithSocket = postgres.Options<Record<string, postgres.PostgresType>> & {
  socket?: (options: { host: string[]; port: number[] }) => Promise<net.Socket>;
};

// Disable prefetch as it's not supported in serverless environments
// Connection pooling is handled by Supabase
const clientOptions: PostgresOptionsWithSocket = {
  prepare: false,
  max: 10, // Allow multiple connections to prevent blocking (pooler handles pooling)
  connect_timeout: 10, // Covers startup/auth after the socket factory resolves
  idle_timeout: 20, // Idle timeout in seconds
  max_lifetime: 60 * 30, // Max connection lifetime in seconds (30 minutes)
  keep_alive: 60, // TCP keepalive delay in seconds (postgres.js default, made explicit)
  // TLS is performed inside the socket factory (STARTTLS); this false also
  // overrides ?sslmode=require in the connection string so postgres.js does
  // not attempt a second upgrade.
  ssl: false,
  socket: watchdogSocket,
};

const client = postgres(connectionString, clientOptions);

export const db = drizzle(client, { schema });
