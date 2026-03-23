import type { BlockMetrics, NeighborhoodProfile } from '../types';

export interface ScaleComparison {
  key: string;
  vars: Record<string, string>;
  type: 'insight' | 'good-news' | 'concern';
}

/**
 * Generate comparison callouts between block-level and neighborhood-level 311
 * data. Returns i18n keys + interpolation vars for translatable display.
 */
export function generateComparisons(
  block: BlockMetrics,
  neighborhood: NeighborhoodProfile['metrics'],
  communityName: string,
): ScaleComparison[] {
  // Guard: no neighborhood data
  if (neighborhood.totalRequests311 === 0) return [];

  // No block reports at all
  if (block.totalRequests === 0) {
    return [{
      key: 'comparison.noReports',
      vars: { radius: String(block.radiusMiles) },
      type: 'insight',
    }];
  }

  const comparisons: ScaleComparison[] = [];

  // 1. Open count comparison
  const neighborhoodOpenCount = Math.max(0, neighborhood.totalRequests311 - neighborhood.resolvedCount);
  comparisons.push({
    key: 'comparison.openCount',
    vars: {
      blockOpen: String(block.openCount),
      community: communityName,
      neighborhoodOpen: neighborhoodOpenCount.toLocaleString(),
    },
    type: 'insight',
  });

  // Skip ratio-based comparisons if fewer than 5 block reports
  if (block.totalRequests >= 5) {
    // 2. Resolution rate comparison
    const blockRate = block.resolutionRate * 100;
    const neighborhoodRate = neighborhood.resolutionRate * 100;
    const rateDiff = Math.abs(blockRate - neighborhoodRate);

    if (rateDiff > 10) {
      const higher = blockRate > neighborhoodRate;
      comparisons.push({
        key: higher ? 'comparison.resolutionHigher' : 'comparison.resolutionLower',
        vars: {
          blockRate: String(Math.round(blockRate)),
          neighborhoodRate: String(Math.round(neighborhoodRate)),
          community: communityName,
        },
        type: higher ? 'good-news' : 'concern',
      });
    } else if (rateDiff <= 5) {
      comparisons.push({
        key: 'comparison.resolutionSimilar',
        vars: { community: communityName },
        type: 'insight',
      });
    }

    // 3. Response time comparison
    if (block.avgDaysToResolve != null && neighborhood.avgDaysToResolve != null) {
      const daysDiff = Math.abs(block.avgDaysToResolve - neighborhood.avgDaysToResolve);
      if (daysDiff > 2) {
        const faster = block.avgDaysToResolve < neighborhood.avgDaysToResolve;
        comparisons.push({
          key: faster ? 'comparison.responseFaster' : 'comparison.responseSlower',
          vars: {
            blockDays: String(Math.round(block.avgDaysToResolve)),
            neighborhoodDays: String(Math.round(neighborhood.avgDaysToResolve)),
            community: communityName,
          },
          type: faster ? 'good-news' : 'concern',
        });
      }
    }

    // 4. Top issue match
    if (block.topIssues.length > 0 && neighborhood.topIssues.length > 0) {
      const blockTop = block.topIssues[0].category;
      const neighborhoodTop = neighborhood.topIssues[0].category;
      if (blockTop === neighborhoodTop) {
        comparisons.push({
          key: 'comparison.sameTopIssue',
          vars: { issue: blockTop, community: communityName },
          type: 'insight',
        });
      } else {
        comparisons.push({
          key: 'comparison.differentTopIssue',
          vars: { blockIssue: blockTop, neighborhoodIssue: neighborhoodTop },
          type: 'insight',
        });
      }
    }
  }

  // Return up to 3 most relevant (open count always first, then pick best 2)
  return comparisons.slice(0, 3);
}
