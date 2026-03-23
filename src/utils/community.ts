// Frontend community utilities — re-exports shared normalization and adds
// frontend-specific display helpers.

export { norm, titleCase } from '../../types/community';

// Sequential red-orange color ramp for access gap scores
export const ACCESS_GAP_COLORS = ['#fee5d9', '#fcae91', '#fb6a4a', '#de2d26', '#a50f15'] as const;

export const NO_DATA_COLOR = '#e5e7eb';

export function scoreToColor(score: number): string {
  if (Number.isNaN(score)) return NO_DATA_COLOR;
  if (score <= 20) return ACCESS_GAP_COLORS[0];
  if (score <= 40) return ACCESS_GAP_COLORS[1];
  if (score <= 60) return ACCESS_GAP_COLORS[2];
  if (score <= 80) return ACCESS_GAP_COLORS[3];
  return ACCESS_GAP_COLORS[4];
}

// Allowlist of valid factor keys from the access gap scoring system
export const VALID_FACTORS = new Set(['factor.lowEngagement', 'factor.lowTransit', 'factor.highNonEnglish']);

// Escape HTML entities to prevent XSS in Leaflet tooltips
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
