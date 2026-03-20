/** Centralized environment detection — single source of truth for serverless checks. */
export const isVercel = !!process.env.VERCEL;
