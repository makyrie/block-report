/** Map an access-gap score (0–100) to a hex color string. */
export function scoreToColor(score: number | null): string {
  if (score === null) return '#d1d5db'; // gray-300 for missing data
  if (score < 20) return '#22c55e';  // green-500
  if (score < 40) return '#a3e635';  // lime-400
  if (score < 60) return '#facc15';  // yellow-400
  if (score < 80) return '#f97316';  // orange-500
  return '#ef4444';                   // red-500
}
