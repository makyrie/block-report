import type { BlockMetrics, NeighborhoodProfile } from '../types';

export interface ScaleComparison {
  text: string;
  type: 'insight' | 'good-news' | 'concern';
}

type TranslateFn = (key: string, vars?: Record<string, string>) => string;

/**
 * Generate plain-language comparison callouts between block-level and
 * neighborhood-level 311 data. Returns up to 3 most relevant comparisons.
 */
export function generateComparisons(
  block: BlockMetrics,
  neighborhood: NeighborhoodProfile['metrics'],
  communityName: string,
  t: TranslateFn,
): ScaleComparison[] {
  // Guard: no neighborhood data
  if (neighborhood.totalRequests311 === 0) return [];

  // No block reports at all
  if (block.totalRequests === 0) {
    return [{
      text: t('dualScale.noReports', { radius: String(block.radiusMiles) }),
      type: 'insight',
    }];
  }

  const comparisons: ScaleComparison[] = [];

  // 1. Open count comparison
  const neighborhoodOpenCount = Math.max(0, neighborhood.totalRequests311 - neighborhood.resolvedCount);
  comparisons.push({
    text: t('dualScale.cmpOpen', {
      blockOpen: String(block.openCount),
      community: communityName,
      neighborhoodOpen: neighborhoodOpenCount.toLocaleString(),
    }),
    type: 'insight',
  });

  // Skip ratio-based comparisons if fewer than 5 block reports
  if (block.totalRequests >= 5) {
    // 2. Resolution rate comparison
    const blockRate = block.resolutionRate * 100;
    const neighborhoodRate = neighborhood.resolutionRate * 100;
    const rateDiff = Math.abs(blockRate - neighborhoodRate);

    if (rateDiff > 10) {
      const direction = blockRate > neighborhoodRate ? 'higher' : 'lower';
      const compType = blockRate > neighborhoodRate ? 'good-news' : 'concern';
      comparisons.push({
        text: t('dualScale.cmpResolution', {
          blockRate: String(Math.round(blockRate)),
          direction: t(`dualScale.${direction}`),
          neighborhoodRate: String(Math.round(neighborhoodRate)),
          community: communityName,
        }),
        type: compType as ScaleComparison['type'],
      });
    } else if (rateDiff <= 5) {
      comparisons.push({
        text: t('dualScale.cmpResolutionSame', { community: communityName }),
        type: 'insight',
      });
    }

    // 3. Response time comparison
    if (block.avgDaysToResolve != null && neighborhood.avgDaysToResolve != null) {
      const daysDiff = Math.abs(block.avgDaysToResolve - neighborhood.avgDaysToResolve);
      if (daysDiff > 2) {
        const faster = block.avgDaysToResolve < neighborhood.avgDaysToResolve;
        comparisons.push({
          text: t('dualScale.cmpResponseTime', {
            blockDays: String(Math.round(block.avgDaysToResolve)),
            speed: t(faster ? 'dualScale.faster' : 'dualScale.slower'),
            community: communityName,
            neighborhoodDays: String(Math.round(neighborhood.avgDaysToResolve)),
          }),
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
          text: t('dualScale.cmpTopIssueSame', { issue: blockTop, community: communityName }),
          type: 'insight',
        });
      } else {
        comparisons.push({
          text: t('dualScale.cmpTopIssueDiff', { blockIssue: blockTop, neighborhoodIssue: neighborhoodTop }),
          type: 'insight',
        });
      }
    }
  }

  // Return up to 3 most relevant (open count always first, then pick best 2)
  return comparisons.slice(0, 3);
}
