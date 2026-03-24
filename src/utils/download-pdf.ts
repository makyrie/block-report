import type { CommunityReport, NeighborhoodProfile } from '../types/index';

/**
 * Download a PDF of the community flyer via the backend PDF endpoint.
 *
 * Uses a short delay before revoking the object URL so that the browser
 * has time to start the download in Firefox / Safari.
 */
export async function downloadPdf(
  report: CommunityReport,
  slug: string,
  metrics?: NeighborhoodProfile['metrics'] | null,
  topLanguages?: { language: string; percentage: number }[],
): Promise<void> {
  const response = await fetch('/api/report/pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ report, metrics, topLanguages, neighborhoodSlug: slug }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || `PDF generation failed (${response.status})`);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `block-report-${slug}.pdf`;
  a.click();
  // Delay revocation so the browser can initiate the download (Firefox/Safari)
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
