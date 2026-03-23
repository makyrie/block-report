import { useState, useEffect, useCallback, useRef } from 'react';
import { generateReport as apiGenerateReport, getPreGeneratedReport } from '../api/client';
import type { CommunityReport, NeighborhoodProfile } from '../types';

export interface ReportState {
  report: CommunityReport | null;
  reportLoading: boolean;
  reportError: string | null;
  handleGenerateReport: (language: string) => Promise<void>;
}

/**
 * Manage report lifecycle: auto-fetch cached report, fall back to on-demand generation.
 */
export function useReport(
  selectedCommunity: string | null,
  reportLang: string,
  buildProfile: () => NeighborhoodProfile | null,
  metrics: NeighborhoodProfile['metrics'] | null,
): ReportState {
  const [report, setReport] = useState<CommunityReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const generatingRef = useRef(false);

  // Clear report when community or language changes
  useEffect(() => {
    setReport(null);
    setReportError(null);
  }, [selectedCommunity, reportLang]);

  // Auto-fetch pre-generated report, falling back to on-demand generation
  useEffect(() => {
    if (!selectedCommunity) return;
    if (generatingRef.current) return;

    let cancelled = false;
    setReportLoading(true);

    (async () => {
      const cached = await getPreGeneratedReport(selectedCommunity, reportLang);
      if (cancelled) return;

      if (cached) {
        setReport(cached);
        setReportLoading(false);
        return;
      }

      if (!metrics) {
        setReportLoading(false);
        return;
      }

      if (report) {
        setReportLoading(false);
        return;
      }

      generatingRef.current = true;
      const profile = buildProfile()!;

      try {
        const result = await apiGenerateReport(profile, reportLang);
        if (!cancelled) setReport(result);
      } catch (err) {
        if (!cancelled) setReportError(err instanceof Error ? err.message : 'Failed to generate report');
      } finally {
        generatingRef.current = false;
        if (!cancelled) setReportLoading(false);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCommunity, reportLang, metrics]);

  const handleGenerateReport = useCallback(async (language: string) => {
    const profile = buildProfile();
    if (!profile) return;

    setReportLoading(true);
    setReportError(null);
    try {
      const result = await apiGenerateReport(profile, language);
      setReport(result);
    } catch (err) {
      setReportError(err instanceof Error ? err.message : 'Failed to generate report');
    } finally {
      setReportLoading(false);
    }
  }, [buildProfile]);

  return { report, reportLoading, reportError, handleGenerateReport };
}
