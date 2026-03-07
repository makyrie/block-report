// Anthropic Claude API client for brief generation
// Brief workstream owns this file

import Anthropic from '@anthropic-ai/sdk';
import type { NeighborhoodProfile, CommunityBrief } from '../../src/types/index.js';

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY is not set. Add it to your .env file.',
    );
  }
  return new Anthropic({ apiKey });
}

export async function generateBrief(
  profile: NeighborhoodProfile,
  language: string,
): Promise<CommunityBrief> {
  const client = getClient();

  const prompt = `You are generating a community brief for the ${profile.communityName} neighborhood of San Diego. The brief will be printed and posted in the community — at a library, rec center, laundromat, or wherever neighbors gather.

Write in ${language}. Use clear, warm, accessible language at a 6th-grade reading level. Avoid jargon.

Here is the data for this neighborhood:
${JSON.stringify(profile, null, 2)}

Generate a brief with these sections:
1. **Welcome** — A 2-sentence greeting that names the neighborhood.
2. **Good News** — 2-3 positive things happening based on the data (resolved issues, investments, improvements).
3. **What Your Neighbors Are Reporting** — Top 3 issues being reported via 311, framed constructively (not as complaints, but as things the community is working on).
4. **How to Get Involved** — 3-4 concrete actions: how to file a 311 report, how to attend council meetings, how to contact their council representative, where to find more info.
5. **Nearby Resources** — List the closest libraries and rec centers with addresses, if available in the data.
6. **Transit Info** — How many transit stops and routes serve the area.

Keep the total brief under 400 words. It should fit on one printed page.

IMPORTANT: Respond ONLY with valid JSON matching this exact structure:
{
  "neighborhoodName": "string",
  "language": "string",
  "summary": "string (the Welcome section)",
  "goodNews": ["string", "string"],
  "topIssues": ["string", "string", "string"],
  "howToParticipate": ["string", "string", "string"],
  "contactInfo": {
    "councilDistrict": "string",
    "phone311": "619-236-5311",
    "anchorLocation": "string (nearest library or rec center with address)"
  }
}`;

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = message.content.find((block) => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text content in Claude response');
    }

    const parsed = JSON.parse(textBlock.text) as Omit<CommunityBrief, 'generatedAt'>;

    const brief: CommunityBrief = {
      ...parsed,
      generatedAt: new Date().toISOString(),
    };

    return brief;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('Failed to parse JSON from Claude response');
    }
    throw error;
  }
}
