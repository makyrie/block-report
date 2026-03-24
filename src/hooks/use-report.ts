import { useState, useEffect, useRef, useCallback } from 'react';
import { getPreGeneratedReport, generateReport } from '../api/client';
import { buildNeighborhoodProfile } from '../utils/build-profile';
import type { CommunityAnchor, CommunityReport, CommunityTrends, NeighborhoodProfile } from '../types';

interface UseReportOptions {
  community: string | null;
  reportLang: string;
  metrics: NeighborhoodProfile['metrics'] | null;
  trends: CommunityTrends | null;
  /** True once the trends fetch has settled (resolved or rejected). */
  trendsSettled: boolean;
  topLanguages?: { language: string; percentage: number }[];
  anchor?: CommunityAnchor | null;
  transitScore?: NeighborhoodProfile['transit'] | null;
  accessGap?: NeighborhoodProfile['accessGap'];
}

interface UseReportResult {
  report: CommunityReport | null;
  reportLoading: boolean;
  reportError: string | null;
  handleGenerateReport: (language: string) => Promise<void>;
}

/**
 * Shared hook for fetching/generating community reports.
 *
 * Fixes:
 * - Waits for both metrics AND trends to settle before generating on-demand
 *   (prevents generating with incomplete data).
 * - Uses a ref for the report check to avoid stale closure reads.
 * - Deduplicates logic previously copied between neighborhood-page and flyer-page.
 */
export function useReport({
  community,
  reportLang,
  metrics,
  trends,
  trendsSettled,
  topLanguages = [],
  anchor = null,
  transitScore = null,
  accessGap = null,
}: UseReportOptions): UseReportResult {
  const [report, setReport] = useState<CommunityReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  const generatingRef = useRef(false);
  // Use a ref so the effect can check current report without adding it to deps
  const reportRef = useRef(report);
  reportRef.current = report;

  // Clear report when community or language changes
  useEffect(() => {
    setReport(null);
    setReportError(null);
  }, [community, reportLang]);

  // Auto-fetch pre-generated report, falling back to on-demand generation
  useEffect(() => {
    if (!community) return;
    if (generatingRef.current) return;

    let cancelled = false;
    setReportLoading(true);

    (async () => {
      // Step 1: Try to load pre-generated report
      const cached = await getPreGeneratedReport(community, reportLang);
      if (cancelled) return;

      if (cached) {
        setReport(cached);
        setReportLoading(false);
        return;
      }

      // Step 2: Wait for both metrics AND trends to settle before generating
      if (!metrics || !trendsSettled) {
        // Data hasn't loaded yet; this effect will re-run when it does
        setReportLoading(false);
        return;
      }

      // Already have a report — don't regenerate on data updates
      if (reportRef.current) {
        setReportLoading(false);
        return;
      }

      generatingRef.current = true;

      const profile = buildNeighborhoodProfile({
        communityName: community,
        anchor,
        metrics,
        transitScore,
        topLanguages,
        trends,
        accessGap,
      });

      try {
        const result = await generateReport(profile, reportLang);
        if (!cancelled) setReport(result);
      } catch (err) {
        if (!cancelled) setReportError(err instanceof Error ? err.message : 'Failed to generate report');
      } finally {
        generatingRef.current = false;
        if (!cancelled) setReportLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [community, reportLang, metrics, trends, trendsSettled, anchor, transitScore, topLanguages, accessGap]);

  const handleGenerateReport = useCallback(async (language: string) => {
    if (!community || !metrics) return;

    const profile = buildNeighborhoodProfile({
      communityName: community,
      anchor,
      metrics,
      transitScore,
      topLanguages,
      trends,
      accessGap,
    });

    setReportLoading(true);
    setReportError(null);
    try {
      const result = await generateReport(profile, language);
      setReport(result);
    } catch (err) {
      setReportError(err instanceof Error ? err.message : 'Failed to generate report');
    } finally {
      setReportLoading(false);
    }
  }, [community, anchor, metrics, topLanguages, transitScore, accessGap, trends]);

  return { report, reportLoading, reportError, handleGenerateReport };
}
