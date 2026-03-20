import { validateCommunityName } from '../../services/communities.js';
import { logger } from '../../logger.js';

type ToolResult = {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
};

/**
 * Wraps a community-name-based tool handler with validation and error handling.
 * Validates the community name, returns a suggestion on mismatch, and catches/logs errors.
 */
export function withCommunityValidation(
  toolName: string,
  handler: (normalized: string) => Promise<ToolResult>,
): (args: { community_name: string }) => Promise<ToolResult> {
  return withErrorHandling<{ community_name: string }>(toolName, async ({ community_name }) => {
    const { valid, normalized, names } = await validateCommunityName(community_name);
    if (!valid) {
      return {
        content: [{
          type: 'text' as const,
          text: `No data found for community: "${community_name}". Use list_communities to see valid names. Did you mean one of: ${names.slice(0, 10).join(', ')}?`,
        }],
        isError: true,
      };
    }
    return await handler(normalized);
  });
}

/**
 * Validates an optional community name and returns the normalized value or an error ToolResult.
 * Returns { normalized: string | undefined } on success, or { error: ToolResult } on invalid input.
 */
export async function validateOptionalCommunity(
  communityName: string | undefined,
): Promise<{ normalized: string | undefined; error?: undefined } | { normalized?: undefined; error: ToolResult }> {
  if (!communityName) return { normalized: undefined };
  const { valid, normalized, names } = await validateCommunityName(communityName);
  if (!valid) {
    return {
      error: {
        content: [{
          type: 'text' as const,
          text: `No data found for community: "${communityName}". Use list_communities to see valid names. Did you mean one of: ${names.slice(0, 10).join(', ')}?`,
        }],
        isError: true,
      },
    };
  }
  return { normalized };
}

/**
 * Wraps a generic tool handler with error catching and logging.
 */
export function withErrorHandling<T extends Record<string, unknown>>(
  toolName: string,
  handler: (args: T) => Promise<ToolResult>,
): (args: T) => Promise<ToolResult> {
  return async (args) => {
    try {
      return await handler(args);
    } catch (err) {
      const message = (err as Error).message;
      logger.error(`MCP tool "${toolName}" failed`, { error: message });
      return {
        content: [{ type: 'text' as const, text: `Error: An internal error occurred. Please try again.` }],
        isError: true,
      };
    }
  };
}
