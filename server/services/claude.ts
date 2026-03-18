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

// Shared tool schema — used by all report generation functions
function makeReportTool(description: string, fieldOverrides?: Record<string, { description: string }>): Anthropic.Messages.Tool {
  const overrides = fieldOverrides ?? {};
  return {
    name: 'community_report',
    description,
    input_schema: {
      type: 'object' as const,
      properties: {
        neighborhoodName: { type: 'string', description: overrides.neighborhoodName?.description ?? 'Name of the neighborhood' },
        language: { type: 'string', description: overrides.language?.description ?? 'Language the report is written in' },
        summary: { type: 'string', description: overrides.summary?.description ?? 'A 2-sentence welcome greeting' },
        goodNews: {
          type: 'array',
          items: { type: 'string' },
          description: overrides.goodNews?.description ?? '2-3 positive things happening based on the data',
        },
        topIssues: {
          type: 'array',
          items: { type: 'string' },
          description: overrides.topIssues?.description ?? 'Top 3 issues being reported via 311, framed constructively',
        },
        howToParticipate: {
          type: 'array',
          items: { type: 'string' },
          description: overrides.howToParticipate?.description ?? '3-4 concrete actions residents can take to get involved',
        },
        contactInfo: {
          type: 'object',
          properties: {
            councilDistrict: { type: 'string' },
            phone311: { type: 'string' },
            anchorLocation: { type: 'string', description: overrides.anchorLocation?.description ?? 'Nearest library or rec center with address' },
          },
          required: ['councilDistrict', 'phone311', 'anchorLocation'],
        },
      },
      required: ['neighborhoodName', 'language', 'summary', 'goodNews', 'topIssues', 'howToParticipate', 'contactInfo'],
    },
  };
}

/** Validate that Claude's tool_use response matches CommunityReport shape */
function validateReportShape(input: unknown): input is Omit<CommunityReport, 'generatedAt'> {
  if (typeof input !== 'object' || input === null) return false;
  const obj = input as Record<string, unknown>;
  return (
    typeof obj.neighborhoodName === 'string' &&
    typeof obj.language === 'string' &&
    typeof obj.summary === 'string' &&
    Array.isArray(obj.goodNews) &&
    Array.isArray(obj.topIssues) &&
    Array.isArray(obj.howToParticipate) &&
    typeof obj.contactInfo === 'object' &&
    obj.contactInfo !== null &&
    typeof (obj.contactInfo as Record<string, unknown>).councilDistrict === 'string' &&
    typeof (obj.contactInfo as Record<string, unknown>).phone311 === 'string' &&
    typeof (obj.contactInfo as Record<string, unknown>).anchorLocation === 'string'
  );
}

// Shared Claude API call + response extraction
async function callClaudeForReport(prompt: string, tool: Anthropic.Messages.Tool, logContext: Record<string, string>): Promise<CommunityReport> {
  const client = getClient();
  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
      tools: [tool],
      tool_choice: { type: 'tool', name: 'community_report' },
    });

    const toolBlock = message.content.find((block) => block.type === 'tool_use');
    if (!toolBlock || toolBlock.type !== 'tool_use') {
      throw new Error('No tool use block in response');
    }

    if (!validateReportShape(toolBlock.input)) {
      logger.error('Claude response does not match expected report structure', {
        keys: Object.keys(toolBlock.input as object),
        ...logContext,
      });
      throw new Error('Claude response does not match expected report structure');
    }

    return {
      ...toolBlock.input,
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    logger.error('Claude API call failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      ...logContext,
    });
    throw error;
  }
}

function sanitizeProfile(profile: NeighborhoodProfile): NeighborhoodProfile {
  const s = (v: unknown, max: number) => sanitizeString(v, max);
  const num = (v: unknown, min = 0, max = Infinity) => Math.min(max, Math.max(min, Number(v) || 0));

  return {
    communityName: sanitizePromptValue(profile.communityName, 100) || 'Unknown',
    anchor: {
      id: s(profile.anchor.id, 50),
      name: sanitizePromptValue(profile.anchor.name, 100),
      type: profile.anchor.type === 'library' ? 'library' : 'rec_center',
      lat: num(profile.anchor.lat, -90, 90),
      lng: num(profile.anchor.lng, -180, 180),
      address: s(profile.anchor.address, 200),
      phone: profile.anchor.phone ? s(profile.anchor.phone, 20) : undefined,
      website: profile.anchor.website ? s(profile.anchor.website, 200) : undefined,
      community: s(profile.anchor.community, 100),
    },
    metrics: {
      totalRequests311: num(profile.metrics.totalRequests311),
      resolvedCount: num(profile.metrics.resolvedCount),
      resolutionRate: num(profile.metrics.resolutionRate, 0, 1),
      avgDaysToResolve: num(profile.metrics.avgDaysToResolve),
      topIssues: (Array.isArray(profile.metrics.topIssues) ? profile.metrics.topIssues : []).slice(0, 10).map((i) => ({
        category: s(i.category, 100),
        count: Math.max(0, Math.floor(Number(i.count) || 0)),
      })),
      recentlyResolved: (Array.isArray(profile.metrics.recentlyResolved) ? profile.metrics.recentlyResolved : []).slice(0, 10).map((r) => ({
        category: s(r.category, 100),
        date: s(r.date, 30),
      })),
      population: num(profile.metrics.population),
      requestsPer1000Residents: profile.metrics.requestsPer1000Residents != null ? num(profile.metrics.requestsPer1000Residents) : null,
      goodNews: (Array.isArray(profile.metrics.goodNews) ? profile.metrics.goodNews : []).slice(0, 10).map((g) => s(g, 300)),
    },
    transit: {
      nearbyStopCount: num(profile.transit.nearbyStopCount),
      nearestStopDistance: num(profile.transit.nearestStopDistance),
      stopCount: num(profile.transit.stopCount),
      agencyCount: num(profile.transit.agencyCount),
      agencies: (Array.isArray(profile.transit.agencies) ? profile.transit.agencies : []).slice(0, 10).map((a) => s(a, 100)),
      transitScore: num(profile.transit.transitScore),
      cityAverage: num(profile.transit.cityAverage),
      travelTimeToCityHall: profile.transit.travelTimeToCityHall != null ? num(profile.transit.travelTimeToCityHall) : null,
    },
    demographics: {
      topLanguages: sanitizeTopLanguages(profile.demographics?.topLanguages),
    },
    accessGap: profile.accessGap ? {
      accessGapScore: num(profile.accessGap.accessGapScore),
      signals: {
        lowEngagement: profile.accessGap.signals.lowEngagement != null ? num(profile.accessGap.signals.lowEngagement) : null,
        lowTransit: profile.accessGap.signals.lowTransit != null ? num(profile.accessGap.signals.lowTransit) : null,
        highNonEnglish: profile.accessGap.signals.highNonEnglish != null ? num(profile.accessGap.signals.highNonEnglish) : null,
      },
      rank: num(profile.accessGap.rank),
      totalCommunities: num(profile.accessGap.totalCommunities),
    } : null,
  };
}

function sanitizeTopLanguages(langs: unknown): { language: string; percentage: number }[] {
  if (!Array.isArray(langs)) return [];
  return langs.slice(0, 20).map((l) => ({
    language: sanitizeString(l?.language, 50).replace(/[^a-zA-Z /()-]/g, '') || 'Unknown',
    percentage: Math.min(100, Math.max(0, Number(l?.percentage) || 0)),
  }));
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
  // Sanitize all fields
  profile = sanitizeProfile(profile);

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

  const tool = makeReportTool(
    'Output a structured community report for a San Diego neighborhood',
    { summary: { description: 'A 2-sentence welcome greeting that names the neighborhood' } },
  );

  return callClaudeForReport(prompt, tool, { community: profile.communityName });
}

export async function generateBlockReport(
  anchor: CommunityAnchor,
  blockMetrics: BlockMetrics,
  language: string,
  demographics?: { topLanguages: { language: string; percentage: number }[] },
): Promise<CommunityReport> {
  // Sanitize anchor fields to prevent prompt injection (strict for prompt-interpolated values)
  const anchorName = sanitizePromptValue(anchor.name, 100) || 'Unknown Location';
  const anchorCommunity = sanitizePromptValue(anchor.community, 100) || 'San Diego';
  const anchorAddress = sanitizePromptValue(anchor.address, 200) || 'address unavailable';
  const anchorLabel = anchor.type === 'library' ? 'library' : 'recreation center';
  // Sanitize blockMetrics and demographics
  blockMetrics = sanitizeBlockMetrics(blockMetrics);
  const sanitizedDemographics = demographics ? { topLanguages: sanitizeTopLanguages(demographics.topLanguages) } : undefined;

  const prompt = `You are generating a block-level community report for the area around ${anchorName} (a ${anchorLabel}) in the ${anchorCommunity} neighborhood of San Diego. The report covers a ${blockMetrics.radiusMiles}-mile radius around this location at ${anchorAddress}.

This report will be printed and posted at ${anchorName} for visitors and neighbors to read.

Write in ${language}. Use clear, warm, accessible language at a 6th-grade reading level. Avoid jargon.

Here is the 311 service request data for this area:
${JSON.stringify(blockMetrics, null, 2)}

${sanitizedDemographics ? `Language demographics for the surrounding area:\n${JSON.stringify(sanitizedDemographics, null, 2)}` : ''}

Generate a report with these sections:
1. **Welcome** — A 2-sentence greeting that names ${anchorName} and the ${anchorCommunity} neighborhood.
2. **Good News** — 2-3 positive things happening based on the data (resolved issues, high resolution rates, etc.).
3. **What Your Neighbors Are Reporting** — Top 3 issues being reported via 311 near ${anchorName}, framed constructively.
4. **How to Get Involved** — 3-4 concrete actions: how to file a 311 report, visit ${anchorName}, attend community events.
5. **This Location** — Reference ${anchorName} at ${anchorAddress} as the anchor community resource.

Keep the total report under 400 words. It should fit on one printed page.`;

  const tool = makeReportTool(
    'Output a structured block-level community report centered on a civic anchor location',
    {
      neighborhoodName: { description: 'Name of the anchor location and neighborhood' },
      summary: { description: 'A 2-sentence welcome greeting naming the anchor location' },
      anchorLocation: { description: 'The anchor location name and address' },
    },
  );

  return callClaudeForReport(prompt, tool, { anchor: anchorName, community: anchorCommunity });
}

export function sanitizeString(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return '';
  // Strip control characters and common prompt-injection delimiters
  return value
    .replace(/[\x00-\x1f\x7f]/g, '')
    .replace(/[<>{}[\]]/g, '')
    .slice(0, maxLen);
}

/** Stricter sanitizer for values interpolated directly into Claude prompts (addresses, community names). */
export function sanitizePromptValue(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return '';
  // Allow only alphanumeric, spaces, commas, periods, hyphens, slashes, #, apostrophes, parentheses
  return value
    .replace(/[\x00-\x1f\x7f]/g, '')
    .replace(/[^a-zA-Z0-9\s,.\-/#'()áéíóúñüÁÉÍÓÚÑÜ]/g, '')
    .slice(0, maxLen);
}

export function sanitizeBlockMetrics(raw: BlockMetrics): BlockMetrics {
  return {
    totalRequests: Math.max(0, Math.floor(Number(raw.totalRequests) || 0)),
    openCount: Math.max(0, Math.floor(Number(raw.openCount) || 0)),
    resolvedCount: Math.max(0, Math.floor(Number(raw.resolvedCount) || 0)),
    resolutionRate: Math.min(1, Math.max(0, Number(raw.resolutionRate) || 0)),
    avgDaysToResolve: raw.avgDaysToResolve != null ? Math.max(0, Number(raw.avgDaysToResolve) || 0) : null,
    topIssues: (Array.isArray(raw.topIssues) ? raw.topIssues : []).slice(0, 10).map((i) => ({
      category: sanitizeString(i.category, 100),
      count: Math.max(0, Math.floor(Number(i.count) || 0)),
    })),
    radiusMiles: Math.min(2, Math.max(0.1, Number(raw.radiusMiles) || 0.25)),
    nearbyOpenIssues: (Array.isArray(raw.nearbyOpenIssues) ? raw.nearbyOpenIssues : []).slice(0, 10).map((issue) => ({
      serviceRequestId: sanitizeString(issue.serviceRequestId, 50),
      serviceName: sanitizeString(issue.serviceName, 100),
      serviceNameDetail: issue.serviceNameDetail ? sanitizeString(issue.serviceNameDetail, 200) : undefined,
      streetAddress: issue.streetAddress ? sanitizeString(issue.streetAddress, 200) : undefined,
      dateRequested: sanitizeString(issue.dateRequested, 30),
      daysOpen: Math.max(0, Math.floor(Number(issue.daysOpen) || 0)),
      distanceMiles: Math.max(0, Number(issue.distanceMiles) || 0),
    })),
    nearbyResources: (Array.isArray(raw.nearbyResources) ? raw.nearbyResources : []).slice(0, 10).map((r) => ({
      name: sanitizeString(r.name, 100),
      type: r.type === 'library' ? 'library' as const : 'rec_center' as const,
      address: sanitizeString(r.address, 200),
      distanceMiles: Math.max(0, Number(r.distanceMiles) || 0),
      phone: r.phone ? sanitizeString(r.phone, 20) : undefined,
      website: r.website ? sanitizeString(r.website, 200) : undefined,
    })),
    nearestAddress: raw.nearestAddress ? sanitizeString(raw.nearestAddress, 200) : null,
    communityName: raw.communityName ? sanitizeString(raw.communityName, 100) : null,
  };
}

export async function generateAddressBlockReport(
  address: string,
  lat: number,
  lng: number,
  communityName: string,
  blockMetrics: BlockMetrics,
  communityMetrics: { resolutionRate: number; totalRequests: number } | null,
  language: string,
): Promise<CommunityReport> {
  // Sanitize inputs
  if (typeof address !== 'string' || address.trim().length === 0) {
    throw new Error('address must be a non-empty string');
  }
  if (address.length > 200) {
    throw new Error('address must be 200 characters or fewer');
  }
  if (typeof communityName !== 'string' || communityName.trim().length === 0) {
    throw new Error('communityName must be a non-empty string');
  }
  if (communityName.length > 100) {
    throw new Error('communityName must be 100 characters or fewer');
  }
  // Strip injection payloads — allow only address-safe characters
  address = sanitizePromptValue(address, 200);
  communityName = sanitizePromptValue(communityName, 100);
  // Sanitize blockMetrics to prevent prompt injection via string fields
  blockMetrics = sanitizeBlockMetrics(blockMetrics);
  // Sanitize communityMetrics
  if (communityMetrics) {
    communityMetrics = {
      resolutionRate: Math.min(1, Math.max(0, Number(communityMetrics.resolutionRate) || 0)),
      totalRequests: Math.max(0, Math.floor(Number(communityMetrics.totalRequests) || 0)),
    };
  }

  // Format nearby open issues for the prompt
  const openIssuesList = (blockMetrics.nearbyOpenIssues ?? [])
    .map((issue) => {
      const location = issue.streetAddress ? ` at ${issue.streetAddress}` : ' nearby';
      const detail = issue.serviceNameDetail ? ` (${issue.serviceNameDetail})` : '';
      return `- ${issue.serviceName}${detail}${location} — reported ${issue.daysOpen} days ago`;
    })
    .join('\n');

  // Format nearby resources for the prompt
  const resourcesList = (blockMetrics.nearbyResources ?? [])
    .map((r) => {
      const typeLabel = r.type === 'library' ? 'Library' : 'Rec Center';
      return `- ${r.name} (${typeLabel}) — ${r.distanceMiles.toFixed(2)} miles away, ${r.address}`;
    })
    .join('\n');

  // Community-level comparison context
  const communityContext = communityMetrics
    ? `\nNeighborhood-level context for comparison:\nAcross ${communityName} as a whole, the city has received ${communityMetrics.totalRequests.toLocaleString()} total 311 reports with a ${Math.round(communityMetrics.resolutionRate * 100)}% resolution rate.`
    : '';

  const prompt = `You are generating a block-level community brief for the area within ${blockMetrics.radiusMiles} miles of ${address} in the ${communityName} neighborhood of San Diego.

This brief is hyperlocal — it should feel like a report about the user's immediate surroundings, not a broad neighborhood summary. The headline should reference the specific address.

Write in ${language}. Use clear, warm, accessible language at a 6th-grade reading level. Avoid jargon.

Here is the 311 service request data for this block:
- Total requests: ${blockMetrics.totalRequests}
- Open: ${blockMetrics.openCount}
- Resolved: ${blockMetrics.resolvedCount}
- Resolution rate: ${Math.round(blockMetrics.resolutionRate * 100)}%
- Average days to resolve: ${blockMetrics.avgDaysToResolve ?? 'N/A'}

Top issues:
${blockMetrics.topIssues.map((i) => `- ${i.category}: ${i.count}`).join('\n')}

${openIssuesList ? `Specific open issues nearby:\n${openIssuesList}` : 'Few open issues reported near this block.'}

${resourcesList ? `Nearest civic resources:\n${resourcesList}` : ''}
${communityContext}

Generate a report with these sections:
1. **Welcome** — A 2-sentence greeting that references the area around ${address} in ${communityName}. Make it feel personal — "Your Block Report."
2. **Good News** — 2-3 positive things happening based on the data (resolved issues, high resolution rates, quick response times, etc.).
3. **What's Happening Near You** — Reference 3-5 specific open issues nearby with street addresses or descriptions if available. If fewer than 3, note that few issues are reported near the block (which is good news).
4. **How to Get Involved** — 3-4 concrete actions: how to file a 311 report mentioning nearest cross streets, visit nearby resources, attend community events.
5. **Nearby Resources** — List the closest libraries and rec centers with distances and addresses.

Keep the total report under 400 words. It should fit on one printed page.`;

  const tool = makeReportTool(
    'Output a structured block-level community report for a specific address',
    {
      neighborhoodName: { description: 'Formatted as "Around {address}, {communityName}"' },
      summary: { description: 'A 2-sentence welcome greeting referencing the specific address' },
      topIssues: { description: '3-5 specific open issues nearby with street addresses, or note that few issues are reported' },
      anchorLocation: { description: 'Nearest library or rec center with address and distance' },
    },
  );

  return callClaudeForReport(prompt, tool, { address, community: communityName });
}
