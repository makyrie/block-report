// Anthropic Claude API client for report generation
// Report/flyer workstream owns this file

import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../logger.js';
import type { NeighborhoodProfile, CommunityReport, BlockMetrics, CommunityAnchor } from '../../src/types/index.js';

const MAX_RECURSION_DEPTH = 10;

/** Runtime validation for Claude tool_use response shape before type assertion */
export function validateReportShape(input: unknown): asserts input is Omit<import('../../src/types/index.js').CommunityReport, 'generatedAt'> {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Claude response is not an object');
  }
  const obj = input as Record<string, unknown>;
  if (typeof obj.neighborhoodName !== 'string') {
    throw new Error('Claude response missing neighborhoodName string');
  }
  if (typeof obj.summary !== 'string') {
    throw new Error('Claude response missing summary string');
  }
  if (!Array.isArray(obj.goodNews)) {
    throw new Error('Claude response missing goodNews array');
  }
  if (!Array.isArray(obj.topIssues)) {
    throw new Error('Claude response missing topIssues array');
  }
  if (!Array.isArray(obj.howToParticipate)) {
    throw new Error('Claude response missing howToParticipate array');
  }
  if (typeof obj.contactInfo !== 'object' || obj.contactInfo === null) {
    throw new Error('Claude response missing contactInfo object');
  }
}

/** Strip any string values longer than maxLen and remove control characters */
export function sanitizeStringFields(obj: unknown, maxLen = 500, depth = 0): unknown {
  if (depth > MAX_RECURSION_DEPTH) {
    throw new Error(`Object nesting too deep (max ${MAX_RECURSION_DEPTH} levels)`);
  }
  if (typeof obj === 'string') {
    return obj.slice(0, maxLen).replace(/[\x00-\x1f\x7f]/g, '');
  }
  if (Array.isArray(obj)) {
    return obj.slice(0, 50).map(item => sanitizeStringFields(item, maxLen, depth + 1));
  }
  if (obj !== null && typeof obj === 'object') {
    const sanitized: Record<string, unknown> = {};
    const keys = Object.keys(obj);
    if (keys.length > 100) {
      throw new Error('Object has too many keys (max 100)');
    }
    for (const key of keys) {
      sanitized[key] = sanitizeStringFields((obj as Record<string, unknown>)[key], maxLen, depth + 1);
    }
    return sanitized;
  }
  return obj;
}

/** Validate and sanitize a NeighborhoodProfile before embedding in a prompt */
export function sanitizeProfile(profile: NeighborhoodProfile): NeighborhoodProfile {
  if (typeof profile !== 'object' || profile === null) {
    throw new Error('profile must be an object');
  }
  return sanitizeStringFields(profile) as NeighborhoodProfile;
}

/** Validate and sanitize BlockMetrics before embedding in a prompt */
export function sanitizeBlockMetrics(metrics: BlockMetrics): BlockMetrics {
  if (typeof metrics !== 'object' || metrics === null) {
    throw new Error('blockMetrics must be an object');
  }
  if (typeof metrics.totalRequests !== 'number' || typeof metrics.radiusMiles !== 'number') {
    throw new Error('blockMetrics.totalRequests and radiusMiles must be numbers');
  }
  // Bounds-check numeric fields to prevent unreasonable values in prompts
  if (!Number.isFinite(metrics.totalRequests) || metrics.totalRequests < 0 || metrics.totalRequests > 1_000_000) {
    throw new Error('blockMetrics.totalRequests out of bounds');
  }
  if (!Number.isFinite(metrics.radiusMiles) || metrics.radiusMiles < 0 || metrics.radiusMiles > 100) {
    throw new Error('blockMetrics.radiusMiles out of bounds');
  }
  if (typeof metrics.resolutionRate === 'number' && (!Number.isFinite(metrics.resolutionRate) || metrics.resolutionRate < 0 || metrics.resolutionRate > 1)) {
    throw new Error('blockMetrics.resolutionRate out of bounds');
  }
  if (typeof metrics.openCount === 'number' && (!Number.isFinite(metrics.openCount) || metrics.openCount < 0 || metrics.openCount > 1_000_000)) {
    throw new Error('blockMetrics.openCount out of bounds');
  }
  if (typeof metrics.resolvedCount === 'number' && (!Number.isFinite(metrics.resolvedCount) || metrics.resolvedCount < 0 || metrics.resolvedCount > 1_000_000)) {
    throw new Error('blockMetrics.resolvedCount out of bounds');
  }
  if (metrics.avgDaysToResolve !== null && typeof metrics.avgDaysToResolve === 'number' && (!Number.isFinite(metrics.avgDaysToResolve) || metrics.avgDaysToResolve < 0 || metrics.avgDaysToResolve > 10_000)) {
    throw new Error('blockMetrics.avgDaysToResolve out of bounds');
  }
  return sanitizeStringFields(metrics) as BlockMetrics;
}

/** Validate and sanitize demographics before embedding in a prompt */
export function sanitizeDemographics(demographics: { topLanguages: { language: string; percentage: number }[] }): typeof demographics {
  if (typeof demographics !== 'object' || demographics === null) {
    throw new Error('demographics must be an object');
  }
  if (!Array.isArray(demographics.topLanguages)) {
    throw new Error('demographics.topLanguages must be an array');
  }
  return sanitizeStringFields(demographics) as typeof demographics;
}

/** Shared tool schema for both generateReport and generateBlockReport */
const REPORT_TOOL: Anthropic.Messages.Tool = {
  name: 'community_report',
  description: 'Output a structured community report for a San Diego neighborhood',
  input_schema: {
    type: 'object' as const,
    properties: {
      neighborhoodName: { type: 'string', description: 'Name of the neighborhood' },
      language: { type: 'string', description: 'Language the report is written in' },
      summary: { type: 'string', description: 'A 2-sentence welcome greeting that names the neighborhood' },
      goodNews: {
        type: 'array',
        items: { type: 'string' },
        description: '2-3 positive things happening based on the data',
      },
      topIssues: {
        type: 'array',
        items: { type: 'string' },
        description: 'Top 3 issues being reported via 311, framed constructively',
      },
      howToParticipate: {
        type: 'array',
        items: { type: 'string' },
        description: '3-4 concrete actions residents can take to get involved',
      },
      contactInfo: {
        type: 'object',
        properties: {
          councilDistrict: { type: 'string' },
          phone311: { type: 'string' },
          anchorLocation: { type: 'string', description: 'Nearest library or rec center with address' },
        },
        required: ['councilDistrict', 'phone311', 'anchorLocation'],
      },
    },
    required: ['neighborhoodName', 'language', 'summary', 'goodNews', 'topIssues', 'howToParticipate', 'contactInfo'],
  },
};

/** Extract and validate the report from a Claude tool_use response */
function parseReportResponse(message: Anthropic.Messages.Message): CommunityReport {
  const toolBlock = message.content.find((block) => block.type === 'tool_use');
  if (!toolBlock || toolBlock.type !== 'tool_use') {
    throw new Error('No tool use block in response');
  }

  validateReportShape(toolBlock.input);

  return {
    ...(toolBlock.input),
    generatedAt: new Date().toISOString(),
  };
}

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY is not set. Add it to your .env file.',
    );
  }
  _client = new Anthropic({ apiKey, timeout: 40_000 }); // 40s timeout — leaves 20s headroom for cold start within Vercel's 60s limit
  return _client;
}

export async function generateReport(
  profile: NeighborhoodProfile,
  language: string,
): Promise<CommunityReport> {
  // Validate communityName to prevent prompt injection
  if (
    typeof profile.communityName !== 'string' ||
    profile.communityName.trim().length === 0
  ) {
    throw new Error('communityName must be a non-empty string');
  }
  if (profile.communityName.length > 100) {
    throw new Error('communityName must be 100 characters or fewer');
  }

  // Sanitize language to prevent prompt injection
  const safeLang = language.slice(0, 50).replace(/[\x00-\x1f\x7f]/g, '');

  // Profile is already allowlisted and type-coerced by pickProfileFields in the
  // route layer. We use it directly here — no redundant sanitizeProfile pass.

  const client = getClient();

  const prompt = `You are generating a community report for the ${profile.communityName} neighborhood of San Diego. The report will be printed and posted in the community — at a library, rec center, laundromat, or wherever neighbors gather.

Write in ${safeLang}. Use clear, warm, accessible language at a 6th-grade reading level. Avoid jargon.

Here is the data for this neighborhood:
${JSON.stringify(profile)}

Generate a report with these sections:
1. **Welcome** — A 2-sentence greeting that names the neighborhood.
2. **Good News** — 2-3 positive things happening based on the data (resolved issues, investments, improvements).
3. **What Your Neighbors Are Reporting** — Top 3 issues being reported via 311, framed constructively (not as complaints, but as things the community is working on).
4. **How to Get Involved** — 3-4 concrete actions: how to file a 311 report, how to attend council meetings, how to contact their council representative, where to find more info.
5. **Nearby Resources** — List the closest libraries and rec centers with addresses, if available in the data.
6. **Transit Info** — How many transit stops and routes serve the area, and the estimated transit travel time to City Hall if available.

Keep the total report under 400 words. It should fit on one printed page.`;

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
      tools: [REPORT_TOOL],
      tool_choice: { type: 'tool', name: 'community_report' },
    });

    return parseReportResponse(message);
  } catch (error) {
    logger.error('Claude API call failed', {
      error: error instanceof Error ? error.message : String(error),
      community: profile.communityName,
    });
    throw error;
  }
}

export async function generateBlockReport(
  anchor: CommunityAnchor,
  blockMetrics: BlockMetrics,
  language: string,
  demographics?: { topLanguages: { language: string; percentage: number }[] },
): Promise<CommunityReport> {
  // Sanitize all user-supplied objects before embedding in prompt
  const safeAnchor = sanitizeStringFields(anchor, 200) as CommunityAnchor;
  const safeMetrics = sanitizeBlockMetrics(blockMetrics);
  const safeDemographics = demographics ? sanitizeDemographics(demographics) : undefined;

  // Sanitize language to prevent prompt injection
  const safeLang = language.slice(0, 50).replace(/[\x00-\x1f\x7f]/g, '');

  const client = getClient();

  const anchorLabel = safeAnchor.type === 'library' ? 'library' : 'recreation center';

  const prompt = `You are generating a block-level community report for the area around ${safeAnchor.name} (a ${anchorLabel}) in the ${safeAnchor.community} neighborhood of San Diego. The report covers a ${safeMetrics.radiusMiles}-mile radius around this location at ${safeAnchor.address}.

This report will be printed and posted at ${safeAnchor.name} for visitors and neighbors to read.

Write in ${safeLang}. Use clear, warm, accessible language at a 6th-grade reading level. Avoid jargon.

Here is the 311 service request data for this area:
${JSON.stringify(safeMetrics)}

${safeDemographics ? `Language demographics for the surrounding area:\n${JSON.stringify(safeDemographics)}` : ''}

Generate a report with these sections:
1. **Welcome** — A 2-sentence greeting that names ${safeAnchor.name} and the ${safeAnchor.community} neighborhood.
2. **Good News** — 2-3 positive things happening based on the data (resolved issues, high resolution rates, etc.).
3. **What Your Neighbors Are Reporting** — Top 3 issues being reported via 311 near ${safeAnchor.name}, framed constructively.
4. **How to Get Involved** — 3-4 concrete actions: how to file a 311 report, visit ${safeAnchor.name}, attend community events.
5. **This Location** — Reference ${safeAnchor.name} at ${safeAnchor.address} as the anchor community resource.

Keep the total report under 400 words. It should fit on one printed page.`;

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
      tools: [REPORT_TOOL],
      tool_choice: { type: 'tool', name: 'community_report' },
    });

    return parseReportResponse(message);
  } catch (error) {
    logger.error('Claude API call failed for block report', {
      error: error instanceof Error ? error.message : String(error),
      anchor: anchor.name,
      community: anchor.community,
    });
    throw error;
  }
}
