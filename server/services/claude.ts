// Anthropic Claude API client for report generation
// Report/flyer workstream owns this file

import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../logger.js';
import type { NeighborhoodProfile, CommunityReport, BlockMetrics, CommunityAnchor } from '../../src/types/index.js';

/**
 * Validate that Claude's tool_use output contains all required CommunityReport fields
 * with correct types. Throws a descriptive error if validation fails.
 */
function validateReportInput(input: unknown): Omit<CommunityReport, 'generatedAt'> {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Claude returned non-object tool input');
  }

  const obj = input as Record<string, unknown>;

  // Required string fields
  for (const field of ['neighborhoodName', 'language', 'summary'] as const) {
    if (typeof obj[field] !== 'string' || (obj[field] as string).trim().length === 0) {
      throw new Error(`Claude response missing or invalid field: ${field}`);
    }
  }

  // Required string-array fields
  for (const field of ['goodNews', 'topIssues', 'howToParticipate'] as const) {
    if (!Array.isArray(obj[field]) || (obj[field] as unknown[]).length === 0) {
      throw new Error(`Claude response missing or empty array field: ${field}`);
    }
    if (!(obj[field] as unknown[]).every((item) => typeof item === 'string')) {
      throw new Error(`Claude response field ${field} contains non-string items`);
    }
  }

  // Required contactInfo object
  const ci = obj.contactInfo;
  if (typeof ci !== 'object' || ci === null) {
    throw new Error('Claude response missing contactInfo object');
  }
  const contact = ci as Record<string, unknown>;
  for (const field of ['councilDistrict', 'phone311', 'anchorLocation'] as const) {
    if (typeof contact[field] !== 'string') {
      throw new Error(`Claude response contactInfo missing field: ${field}`);
    }
  }

  return input as Omit<CommunityReport, 'generatedAt'>;
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
  _client = new Anthropic({ apiKey });
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
  // Strip newlines and control characters (use local copy to avoid mutating the argument)
  const communityName = profile.communityName.replace(/[\x00-\x1f\x7f]/g, '');

  const client = getClient();

  const trendContext = profile.trends?.summary
    ? `\n311 Trend: Resolution rate is ${profile.trends.summary.direction} ` +
      `(${Math.round(profile.trends.summary.previousResolutionRate * 100)}% → ` +
      `${Math.round(profile.trends.summary.currentResolutionRate * 100)}%). ` +
      `Request volume changed ${profile.trends.summary.volumeChange}% vs prior period.`
    : '';

  // Omit raw monthly trend data from the profile sent to Claude to save tokens
  const { trends: _trends, ...profileWithoutTrends } = profile;

  const prompt = `You are generating a community report for the ${communityName} neighborhood of San Diego. The report will be printed and posted in the community — at a library, rec center, laundromat, or wherever neighbors gather.

Write in ${language}. Use clear, warm, accessible language at a 6th-grade reading level. Avoid jargon.

Here is the data for this neighborhood:
${JSON.stringify(profileWithoutTrends, null, 2)}${trendContext}

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
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
      tools: [reportTool],
      tool_choice: { type: 'tool', name: 'community_report' },
    });

    const toolBlock = message.content.find((block) => block.type === 'tool_use');
    if (!toolBlock || toolBlock.type !== 'tool_use') {
      throw new Error('No tool use block in response');
    }

    const validated = validateReportInput(toolBlock.input);
    const report: CommunityReport = {
      ...validated,
      generatedAt: new Date().toISOString(),
    };

    return report;
  } catch (error) {
    logger.error('Claude API call failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      community: communityName,
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
  const client = getClient();

  // Strip control characters from anchor fields (defense-in-depth, mirrors generateReport)
  const anchorName = (anchor.name || '').replace(/[\x00-\x1f\x7f]/g, '');
  const anchorCommunity = (anchor.community || '').replace(/[\x00-\x1f\x7f]/g, '');
  const anchorAddress = (anchor.address || '').replace(/[\x00-\x1f\x7f]/g, '');

  const anchorLabel = anchor.type === 'library' ? 'library' : 'recreation center';

  const prompt = `You are generating a block-level community report for the area around ${anchorName} (a ${anchorLabel}) in the ${anchorCommunity} neighborhood of San Diego. The report covers a ${blockMetrics.radiusMiles}-mile radius around this location at ${anchorAddress}.

This report will be printed and posted at ${anchorName} for visitors and neighbors to read.

Write in ${language}. Use clear, warm, accessible language at a 6th-grade reading level. Avoid jargon.

Here is the 311 service request data for this area:
${JSON.stringify(blockMetrics, null, 2)}

${demographics ? `Language demographics for the surrounding area:\n${JSON.stringify(demographics, null, 2)}` : ''}

Generate a report with these sections:
1. **Welcome** — A 2-sentence greeting that names ${anchorName} and the ${anchorCommunity} neighborhood.
2. **Good News** — 2-3 positive things happening based on the data (resolved issues, high resolution rates, etc.).
3. **What Your Neighbors Are Reporting** — Top 3 issues being reported via 311 near ${anchorName}, framed constructively.
4. **How to Get Involved** — 3-4 concrete actions: how to file a 311 report, visit ${anchorName}, attend community events.
5. **This Location** — Reference ${anchorName} at ${anchorAddress} as the anchor community resource.

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
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
      tools: [reportTool],
      tool_choice: { type: 'tool', name: 'community_report' },
    });

    const toolBlock = message.content.find((block) => block.type === 'tool_use');
    if (!toolBlock || toolBlock.type !== 'tool_use') {
      throw new Error('No tool use block in response');
    }

    const validated = validateReportInput(toolBlock.input);
    const report: CommunityReport = {
      ...validated,
      generatedAt: new Date().toISOString(),
    };

    return report;
  } catch (error) {
    logger.error('Claude API call failed for block report', {
      error: error instanceof Error ? error.message : String(error),
      anchor: anchorName,
      community: anchorCommunity,
    });
    throw error;
  }
}
