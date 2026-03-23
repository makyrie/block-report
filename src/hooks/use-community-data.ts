import { useState, useEffect } from 'react';
import { get311, getDemographics, getTransitScore, getAccessGap } from '../api/client';
import type { NeighborhoodProfile } from '../types';

export interface CommunityData {
  metrics: NeighborhoodProfile['metrics'] | null;
  metricsLoading: boolean;
  topLanguages: { language: string; percentage: number }[];
  transitScore: NeighborhoodProfile['transit'] | null;
  accessGap: NeighborhoodProfile['accessGap'];
}

export function useCommunityData(selectedCommunity: string | null): CommunityData {
  const [metrics, setMetrics] = useState<NeighborhoodProfile['metrics'] | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [topLanguages, setTopLanguages] = useState<{ language: string; percentage: number }[]>([]);
  const [transitScore, setTransitScore] = useState<NeighborhoodProfile['transit'] | null>(null);
  const [accessGap, setAccessGap] = useState<NeighborhoodProfile['accessGap']>(null);

  useEffect(() => {
    if (!selectedCommunity) {
      setMetrics(null);
      setTopLanguages([]);
      setTransitScore(null);
      setAccessGap(null);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    setMetricsLoading(true);
    setMetrics(null);
    setTopLanguages([]);
    setTransitScore(null);
    setAccessGap(null);

    get311(selectedCommunity, controller.signal)
      .then((data) => { if (!cancelled) setMetrics(data); })
      .catch((err) => { if (!cancelled && err?.name !== 'AbortError') console.error(err); })
      .finally(() => { if (!cancelled) setMetricsLoading(false); });

    getTransitScore(selectedCommunity, controller.signal)
      .then((data) => { if (!cancelled) setTransitScore(data); })
      .catch((err) => { if (!cancelled && err?.name !== 'AbortError') console.error('Transit score fetch failed:', err); });

    getAccessGap(selectedCommunity, controller.signal)
      .then((data) => { if (!cancelled && data?.accessGapScore != null) setAccessGap(data); })
      .catch((err) => { if (!cancelled && err?.name !== 'AbortError') console.error('Access gap fetch failed:', err); });

    getDemographics(selectedCommunity, controller.signal)
      .then((data) => {
        if (!cancelled && data?.topLanguages) setTopLanguages(data.topLanguages);
      })
      .catch((err) => {
        if (!cancelled && err?.name !== 'AbortError') console.error('Demographics fetch failed:', err);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [selectedCommunity]);

  return { metrics, metricsLoading, topLanguages, transitScore, accessGap };
}
