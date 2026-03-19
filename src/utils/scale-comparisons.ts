import type { BlockMetrics, NeighborhoodProfile } from '../types';

export interface ScaleComparison {
  text: string;
  type: 'insight' | 'good-news' | 'concern';
}

/**
 * Generate plain-language comparison callouts between block-level and
 * neighborhood-level 311 data. Returns up to 3 most relevant comparisons.
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
      text: `No reports found near your pin within ${block.radiusMiles} mi. Try a larger radius.`,
      type: 'insight',
    }];
  }

  const comparisons: ScaleComparison[] = [];

  // 1. Open count comparison
  const neighborhoodOpenCount = Math.max(0, neighborhood.totalRequests311 - neighborhood.resolvedCount);
  comparisons.push({
    text: `Your block has ${block.openCount} open report${block.openCount !== 1 ? 's' : ''}. Across ${communityName}, there are ${neighborhoodOpenCount.toLocaleString()} unresolved issues.`,
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
        text: `Around your pin, ${Math.round(blockRate)}% of issues are resolved — ${direction} than the ${Math.round(neighborhoodRate)}% rate across ${communityName}.`,
        type: compType as ScaleComparison['type'],
      });
    } else if (rateDiff <= 5) {
      comparisons.push({
        text: `Your block's resolution rate mirrors the ${communityName} average.`,
        type: 'insight',
      });
    }

    // 3. Response time comparison
    if (block.avgDaysToResolve != null && neighborhood.avgDaysToResolve != null) {
      const daysDiff = Math.abs(block.avgDaysToResolve - neighborhood.avgDaysToResolve);
      if (daysDiff > 2) {
        const faster = block.avgDaysToResolve < neighborhood.avgDaysToResolve;
        comparisons.push({
          text: `Issues near you take about ${Math.round(block.avgDaysToResolve)} days to resolve — ${faster ? 'faster' : 'slower'} than the ${communityName} average of ${Math.round(neighborhood.avgDaysToResolve)} days.`,
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
          text: `"${blockTop}" is the top issue both near you and across ${communityName}.`,
          type: 'insight',
        });
      } else {
        comparisons.push({
          text: `Near you it's "${blockTop}", but neighborhood-wide the top issue is "${neighborhoodTop}".`,
          type: 'insight',
        });
      }
    }
  }

  // Return up to 3 most relevant (open count always first, then pick best 2)
  return comparisons.slice(0, 3);
}
