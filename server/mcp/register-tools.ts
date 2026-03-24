import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerCommunityTools } from './tools/communities.js';
import { registerMetricsTools } from './tools/metrics.js';
import { registerProfileTools } from './tools/profile.js';
import { registerGapAnalysisTools } from './tools/gap-analysis.js';
import { registerLocationTools } from './tools/locations.js';
import { registerDemographicsTools } from './tools/demographics.js';
import { registerTransitTools } from './tools/transit.js';
import { registerBlockTools } from './tools/block.js';

export function registerAllTools(server: McpServer): void {
  registerCommunityTools(server);
  registerMetricsTools(server);
  registerProfileTools(server);
  registerGapAnalysisTools(server);
  registerLocationTools(server);
  registerDemographicsTools(server);
  registerTransitTools(server);
  registerBlockTools(server);
}
