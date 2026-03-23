/** Centralized environment detection — single source of truth for serverless checks. */
export const isVercel = !!process.env.VERCEL;
export const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
