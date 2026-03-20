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
export function getPrisma(): PrismaClient {
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
    max: 5, // Bound pool size — prevents connection exhaustion in serverless
  });
  const adapter = new PrismaNeon(pool);
  _prisma = new PrismaClient({ adapter });
  return _prisma;
}

/**
 * For backwards compatibility — a proxy that lazy-initializes on first property access.
 * Importing this module no longer throws if DATABASE_URL is unset.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop: string | symbol) {
    return Reflect.get(getPrisma(), prop);
  },
});
