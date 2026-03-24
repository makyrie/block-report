import { Pool, neonConfig } from '@neondatabase/serverless';
import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaClient } from '@prisma/client';
import ws from 'ws';

// WebSocket is required for Neon serverless driver in Node.js
neonConfig.webSocketConstructor = ws;

let _prisma: PrismaClient | null = null;

/**
 * Lazy-initialized Prisma client.
 * Does NOT crash at module load if DATABASE_URL is missing — allows local dev
 * without a database for frontend-only work.
 */
function getPrisma(): PrismaClient {
  if (_prisma) return _prisma;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL environment variable is required for database operations. ' +
      'Set it in .env or skip DB-dependent features.',
    );
  }

  const pool = new Pool({
    connectionString,
    max: parseInt(process.env.DB_POOL_MAX || '5', 10), // Configurable; default 5 handles concurrent queries within a single request
  });
  const adapter = new PrismaNeon(pool);
  _prisma = new PrismaClient({ adapter });
  return _prisma;
}

/**
 * Lazy-initializing proxy — resolves to the real PrismaClient on first property access.
 * After initialization, all subsequent accesses go directly to the cached client
 * (no repeated getPrisma() overhead). Importing this module no longer throws
 * if DATABASE_URL is unset.
 */
let _proxyClient: PrismaClient | null = null;
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop: string | symbol) {
    if (!_proxyClient) {
      try {
        _proxyClient = getPrisma();
      } catch (err) {
        // Don't cache a broken client — allow retry on next access
        _prisma = null;
        _proxyClient = null;
        throw err;
      }
    }
    return Reflect.get(_proxyClient, prop);
  },
});

/** Disconnect Prisma on process exit to release pooled connections (critical for serverless) */
async function disconnect() {
  if (_prisma) {
    await _prisma.$disconnect().catch(() => {});
    _prisma = null;
    _proxyClient = null;
  }
}

process.on('SIGTERM', disconnect);
process.on('SIGINT', disconnect);
process.on('beforeExit', disconnect);
