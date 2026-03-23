/** Runtime validation for Claude tool_use response shape before type assertion.
 * Extracted from claude.ts to avoid circular dependency with report-cache.ts. */
export function validateReportShape(input: unknown): asserts input is {
  neighborhoodName: string;
  language: string;
  summary: string;
  goodNews: unknown[];
  topIssues: unknown[];
  howToParticipate: unknown[];
  contactInfo: object;
} {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Claude response is not an object');
  }
  const obj = input as Record<string, unknown>;
  if (typeof obj.neighborhoodName !== 'string') {
    throw new Error('Claude response missing neighborhoodName string');
  }
  if (typeof obj.summary !== 'string') {
    throw new Error('Claude response missing summary string');
  }
  if (!Array.isArray(obj.goodNews)) {
    throw new Error('Claude response missing goodNews array');
  }
  if (!Array.isArray(obj.topIssues)) {
    throw new Error('Claude response missing topIssues array');
  }
  if (!Array.isArray(obj.howToParticipate)) {
    throw new Error('Claude response missing howToParticipate array');
  }
  if (typeof obj.contactInfo !== 'object' || obj.contactInfo === null) {
    throw new Error('Claude response missing contactInfo object');
  }
  if (typeof obj.language !== 'string') {
    throw new Error('Claude response missing language string');
  }
}
