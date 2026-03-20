import type { Request, Response } from 'express';
import { COMMUNITIES } from '../../src/types/communities.js';

/** Lowercase set of all valid community names for O(1) allowlist checks. */
export const COMMUNITIES_LOWER = new Set(COMMUNITIES.map(c => c.toLowerCase()));

/** Map of language display names to ISO-ish codes used in filenames and lookups. */
export const LANGUAGE_CODES: Record<string, string> = {
  English: 'en',
  Spanish: 'es',
  Chinese: 'zh',
  Vietnamese: 'vi',
  Tagalog: 'tl',
  Korean: 'ko',
  Arabic: 'ar',
  'French/Haitian/Cajun': 'fr',
  'German/West Germanic': 'de',
  'Russian/Polish/Slavic': 'ru',
};

/** Set of valid language display names (keys of LANGUAGE_CODES). */
export const VALID_LANGUAGES = new Set(Object.keys(LANGUAGE_CODES));

/** Set of valid language short codes (values of LANGUAGE_CODES). */
export const VALID_LANGUAGE_CODES = new Set(Object.values(LANGUAGE_CODES));

/**
 * Validate and sanitize the community query parameter.
 * Returns the cleaned community name, or null if an error response was sent.
 */
export function validateCommunity(req: Request, res: Response): string | null {
  const community = req.query.community as string | undefined;
  if (!community) {
    res.status(400).json({ error: 'community query parameter is required' });
    return null;
  }
  // Strip SQL wildcard characters
  const cleaned = community.replace(/[%_]/g, '');
  if (cleaned.length > 100 || cleaned.length === 0) {
    res.status(400).json({ error: 'Invalid community name' });
    return null;
  }
  if (!COMMUNITIES_LOWER.has(cleaned.toLowerCase())) {
    res.status(400).json({ error: 'Unknown community name' });
    return null;
  }
  return cleaned;
}
