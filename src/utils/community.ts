// Shared utility functions for citywide community features

// Sequential red-orange color ramp for access gap scores
export const ACCESS_GAP_COLORS = ['#fee5d9', '#fcae91', '#fb6a4a', '#de2d26', '#a50f15'] as const;

export const NO_DATA_COLOR = '#e5e7eb';

export function scoreToColor(score: number): string {
  if (score <= 20) return ACCESS_GAP_COLORS[0];
  if (score <= 40) return ACCESS_GAP_COLORS[1];
  if (score <= 60) return ACCESS_GAP_COLORS[2];
  if (score <= 80) return ACCESS_GAP_COLORS[3];
  return ACCESS_GAP_COLORS[4];
}

// Normalize strings for fuzzy matching (e.g. "City Heights" matches "Mid-City:City Heights")
export function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Convert UPPERCASE community name to title case for display
export function titleCase(name: string): string {
  return name
    .toLowerCase()
    .replace(/(^|\s|[-:])(\w)/g, (_, sep, char) => sep + char.toUpperCase());
}

// Escape HTML entities to prevent XSS in Leaflet tooltips
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
