// Anthropic Claude API client for report generation
// Report/flyer workstream owns this file

import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../logger.js';
import type { NeighborhoodProfile, CommunityReport, BlockMetrics, CommunityAnchor } from '../../src/types/index.js';

const MAX_RECURSION_DEPTH = 10;

/** Strip any string values longer than maxLen and remove control characters */
function sanitizeStringFields(obj: unknown, maxLen = 500, depth = 0): unknown {
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
function sanitizeProfile(profile: NeighborhoodProfile): NeighborhoodProfile {
  if (typeof profile !== 'object' || profile === null) {
    throw new Error('profile must be an object');
  }
  return sanitizeStringFields(profile) as NeighborhoodProfile;
}

/** Validate and sanitize BlockMetrics before embedding in a prompt */
function sanitizeBlockMetrics(metrics: BlockMetrics): BlockMetrics {
  if (typeof metrics !== 'object' || metrics === null) {
    throw new Error('blockMetrics must be an object');
  }
  if (typeof metrics.totalRequests !== 'number' || typeof metrics.radiusMiles !== 'number') {
    throw new Error('blockMetrics.totalRequests and radiusMiles must be numbers');
  }
  return sanitizeStringFields(metrics) as BlockMetrics;
}

/** Validate and sanitize demographics before embedding in a prompt */
function sanitizeDemographics(demographics: { topLanguages: { language: string; percentage: number }[] }): typeof demographics {
  if (typeof demographics !== 'object' || demographics === null) {
    throw new Error('demographics must be an object');
  }
  if (!Array.isArray(demographics.topLanguages)) {
    throw new Error('demographics.topLanguages must be an array');
  }
  return sanitizeStringFields(demographics) as typeof demographics;
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
  signal?: AbortSignal,
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

  // Sanitize entire profile to prevent prompt injection via nested fields
  const safeProfile = sanitizeProfile(profile);

  const client = getClient();

  const prompt = `You are generating a community report for the ${safeProfile.communityName} neighborhood of San Diego. The report will be printed and posted in the community — at a library, rec center, laundromat, or wherever neighbors gather.

Write in ${safeLang}. Use clear, warm, accessible language at a 6th-grade reading level. Avoid jargon.

Here is the data for this neighborhood:
${JSON.stringify(safeProfile)}

Generate a report with these sections:
1. **Welcome** — A 2-sentence greeting that names the neighborhood.
2. **Good News** — 2-3 positive things happening based on the data (resolved issues, investments, improvements).
3. **What Your Neighbors Are Reporting** — Top 3 issues being reported via 311, framed constructively (not as complaints, but as things the community is working on).
4. **How to Get Involved** — 3-4 concrete actions: how to file a 311 report, how to attend council meetings, how to contact their council representative, where to find more info.
5. **Nearby Resources** — List the closest libraries and rec centers with addresses, if available in the data.
6. **Transit Info** — How many transit stops and routes serve the area, and the estimated transit travel time to City Hall if available.

Keep the total report under 400 words. It should fit on one printed page.`;

  const reportTool: Anthropic.Messages.Tool = {
    name: 'community_report',
    description: 'Output a structured community report for a San Diego neighborhood',
    input_schema: {
      type: 'object' as const,
      properties: {
        neighborhoodName: { type: 'string', description: 'Name of the neighborhood' },
        language: { type: 'string', description: 'Language the brief is written in' },
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

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
      tools: [reportTool],
      tool_choice: { type: 'tool', name: 'community_report' },
    }, { signal });

    const toolBlock = message.content.find((block) => block.type === 'tool_use');
    if (!toolBlock || toolBlock.type !== 'tool_use') {
      throw new Error('No tool use block in response');
    }

    const report: CommunityReport = {
      ...(toolBlock.input as Omit<CommunityReport, 'generatedAt'>),
      generatedAt: new Date().toISOString(),
    };

    return report;
  } catch (error) {
    logger.error('Claude API call failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
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
  signal?: AbortSignal,
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

  const reportTool: Anthropic.Messages.Tool = {
    name: 'community_report',
    description: 'Output a structured block-level community report centered on a civic anchor location',
    input_schema: {
      type: 'object' as const,
      properties: {
        neighborhoodName: { type: 'string', description: 'Name of the anchor location and neighborhood' },
        language: { type: 'string', description: 'Language the report is written in' },
        summary: { type: 'string', description: 'A 2-sentence welcome greeting naming the anchor location' },
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
            anchorLocation: { type: 'string', description: 'The anchor location name and address' },
          },
          required: ['councilDistrict', 'phone311', 'anchorLocation'],
        },
      },
      required: ['neighborhoodName', 'language', 'summary', 'goodNews', 'topIssues', 'howToParticipate', 'contactInfo'],
    },
  };

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
      tools: [reportTool],
      tool_choice: { type: 'tool', name: 'community_report' },
    }, { signal });

    const toolBlock = message.content.find((block) => block.type === 'tool_use');
    if (!toolBlock || toolBlock.type !== 'tool_use') {
      throw new Error('No tool use block in response');
    }

    const report: CommunityReport = {
      ...(toolBlock.input as Omit<CommunityReport, 'generatedAt'>),
      generatedAt: new Date().toISOString(),
    };

    return report;
  } catch (error) {
    logger.error('Claude API call failed for block report', {
      error: error instanceof Error ? error.message : String(error),
      anchor: anchor.name,
      community: anchor.community,
    });
    throw error;
  }
}
