// Anthropic Claude API client for report generation
// Report/flyer workstream owns this file

import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../logger.js';
import type { NeighborhoodProfile, CommunityReport, BlockMetrics, CommunityAnchor } from '../../src/types/index.js';

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
  // Strip newlines and control characters
  profile.communityName = profile.communityName.replace(/[\x00-\x1f\x7f]/g, '');

  const client = getClient();

  const prompt = `You are generating a community report for the ${profile.communityName} neighborhood of San Diego. The report will be printed and posted in the community — at a library, rec center, laundromat, or wherever neighbors gather.

Write in ${language}. Use clear, warm, accessible language at a 6th-grade reading level. Avoid jargon.

Here is the data for this neighborhood:
${JSON.stringify(profile, null, 2)}

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
): Promise<CommunityReport> {
  const client = getClient();

  const anchorLabel = anchor.type === 'library' ? 'library' : 'recreation center';

  const prompt = `You are generating a block-level community report for the area around ${anchor.name} (a ${anchorLabel}) in the ${anchor.community} neighborhood of San Diego. The report covers a ${blockMetrics.radiusMiles}-mile radius around this location at ${anchor.address}.

This report will be printed and posted at ${anchor.name} for visitors and neighbors to read.

Write in ${language}. Use clear, warm, accessible language at a 6th-grade reading level. Avoid jargon.

Here is the 311 service request data for this area:
${JSON.stringify(blockMetrics, null, 2)}

${demographics ? `Language demographics for the surrounding area:\n${JSON.stringify(demographics, null, 2)}` : ''}

Generate a report with these sections:
1. **Welcome** — A 2-sentence greeting that names ${anchor.name} and the ${anchor.community} neighborhood.
2. **Good News** — 2-3 positive things happening based on the data (resolved issues, high resolution rates, etc.).
3. **What Your Neighbors Are Reporting** — Top 3 issues being reported via 311 near ${anchor.name}, framed constructively.
4. **How to Get Involved** — 3-4 concrete actions: how to file a 311 report, visit ${anchor.name}, attend community events.
5. **This Location** — Reference ${anchor.name} at ${anchor.address} as the anchor community resource.

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
