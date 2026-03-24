import type { Request, Response } from 'express';
import { validateCommunityName } from '../services/communities.js';

/**
 * Validates a community query parameter against the known community list.
 * Returns the normalized name on success, or null after sending a 400/404 response.
 */
export async function parseAndValidateCommunity(
  req: Request,
  res: Response,
  paramName = 'community',
): Promise<string | null> {
  const raw = req.query[paramName] as string | undefined;
  if (!raw) {
    res.status(400).json({ error: `${paramName} query parameter is required` });
    return null;
  }
  if (raw.length > 100 || raw.trim().length === 0) {
    res.status(400).json({ error: 'Invalid community name' });
    return null;
  }

  const { valid, normalized, names } = await validateCommunityName(raw);
  if (!valid) {
    res.status(404).json({
      error: `Unknown community: "${raw}". Did you mean one of: ${names.slice(0, 5).join(', ')}?`,
    });
    return null;
  }
  return normalized;
}
