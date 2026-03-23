import { useState, useEffect, useCallback, useRef } from 'react';
import { generateReport as apiGenerateReport, getPreGeneratedReport } from '../api/client';
import type { CommunityAnchor, CommunityReport, NeighborhoodProfile } from '../types';

const DEFAULT_TRANSIT: NeighborhoodProfile['transit'] = {
  nearbyStopCount: 0, nearestStopDistance: 0, stopCount: 0, agencyCount: 0,
  agencies: [], transitScore: 0, cityAverage: 0, travelTimeToCityHall: null,
};

function buildDefaultAnchor(community: string): CommunityAnchor {
  return { id: '', name: community, type: 'library' as const, lat: 0, lng: 0, address: '', community };
}

function buildProfile(
  community: string,
  anchor: CommunityAnchor | null,
  metrics: NeighborhoodProfile['metrics'],
  transitScore: NeighborhoodProfile['transit'] | null,
  topLanguages: { language: string; percentage: number }[],
  accessGap: NeighborhoodProfile['accessGap'],
): NeighborhoodProfile {
  return {
    communityName: community,
    anchor: anchor ?? buildDefaultAnchor(community),
    metrics,
    transit: transitScore ?? DEFAULT_TRANSIT,
    demographics: { topLanguages },
    accessGap: accessGap ?? null,
  };
}

interface UseReportGenerationArgs {
  selectedCommunity: string | null;
  selectedAnchor: CommunityAnchor | null;
  metrics: NeighborhoodProfile['metrics'] | null;
  transitScore: NeighborhoodProfile['transit'] | null;
  topLanguages: { language: string; percentage: number }[];
  accessGap: NeighborhoodProfile['accessGap'];
  reportLang: string;
}

export function useReportGeneration({
  selectedCommunity,
  selectedAnchor,
  metrics,
  transitScore,
  topLanguages,
  accessGap,
  reportLang,
}: UseReportGenerationArgs) {
  const [report, setReport] = useState<CommunityReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  const generatingRef = useRef(false);
  const hasReportRef = useRef(false);

  // Clear report when community or language changes
  useEffect(() => {
    setReport(null);
    setReportError(null);
  }, [selectedCommunity, reportLang]);

  // Track whether we already have a report to avoid stale closure reads
  useEffect(() => { hasReportRef.current = report !== null; }, [report]);

  // Auto-fetch pre-generated report, falling back to on-demand generation
  useEffect(() => {
    if (!selectedCommunity) return;
    if (generatingRef.current) return;
    // Gate on metrics being available to avoid redundant API calls (#009)
    if (!metrics) return;

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

      if (hasReportRef.current) {
        setReportLoading(false);
        return;
      }

      generatingRef.current = true;

      const profile = buildProfile(selectedCommunity, selectedAnchor, metrics, transitScore, topLanguages, accessGap);

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

    return () => {
      cancelled = true;
      generatingRef.current = false;
    };
  // Intentionally omitting selectedAnchor, transitScore, topLanguages, accessGap —
  // report generation should only trigger on community/language/metrics changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCommunity, reportLang, metrics]);

  const handleGenerateReport = useCallback(async (language: string) => {
    if (!selectedCommunity || !metrics) return;

    const profile = buildProfile(selectedCommunity, selectedAnchor, metrics, transitScore, topLanguages, accessGap);

    setReportLoading(true);
    setReportError(null);
    try {
      const result = await apiGenerateReport(profile, language);
      setReport(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate report';
      setReportError(message);
    } finally {
      setReportLoading(false);
    }
  }, [selectedCommunity, selectedAnchor, metrics, topLanguages, transitScore, accessGap]);

  return { report, reportLoading, reportError, handleGenerateReport };
}
