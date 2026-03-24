import { join } from 'node:path';

/** Centralized environment detection — single source of truth for serverless checks. */
export const isVercel = !!process.env.VERCEL;

/** Shared disk cache directory — /tmp on Vercel, project-local otherwise. */
export const DISK_CACHE_DIR = isVercel ? '/tmp/block-report-cache' : join(process.cwd(), 'server', 'cache');
