import { useState, useEffect, useCallback } from 'react';
import { generateReport as apiGenerateReport, getPreGeneratedReport } from '../api/client';
import type { CommunityReport, NeighborhoodProfile } from '../types';

export interface ReportState {
  report: CommunityReport | null;
  reportLoading: boolean;
  reportError: string | null;
  handleGenerateReport: (language: string) => Promise<void>;
}

/**
 * Manage report lifecycle: auto-fetch cached report, generate on explicit user action only.
 */
export function useReport(
  selectedCommunity: string | null,
  reportLang: string,
  buildProfile: () => NeighborhoodProfile | null,
): ReportState {
  const [report, setReport] = useState<CommunityReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  // Clear report when community or language changes
  useEffect(() => {
    setReport(null);
    setReportError(null);
  }, [selectedCommunity, reportLang]);

  // Auto-fetch pre-generated (cached) report only — never auto-generate via Claude API
  useEffect(() => {
    if (!selectedCommunity) return;

    let cancelled = false;
    setReportLoading(true);

    getPreGeneratedReport(selectedCommunity, reportLang)
      .then((cached) => {
        if (cancelled) return;
        if (cached) setReport(cached);
      })
      .catch((err) => { if (!cancelled) console.error('Failed to fetch pre-generated report', err); })
      .finally(() => {
        if (!cancelled) setReportLoading(false);
      });

    return () => { cancelled = true; };
  }, [selectedCommunity, reportLang]);

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
