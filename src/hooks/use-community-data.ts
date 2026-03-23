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

/** Fetch 311 metrics, demographics, transit score, and access gap for a community. */
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

    const controller = new AbortController();
    const { signal } = controller;

    setMetricsLoading(true);
    setMetrics(null);
    setTopLanguages([]);
    setTransitScore(null);
    setAccessGap(null);

    get311(selectedCommunity, signal)
      .then((data) => { if (!signal.aborted) setMetrics(data); })
      .catch((err) => { if (!signal.aborted) console.error('Failed to load 311 metrics', err); })
      .finally(() => { if (!signal.aborted) setMetricsLoading(false); });

    getTransitScore(selectedCommunity, signal)
      .then((data) => { if (!signal.aborted) setTransitScore(data); })
      .catch(() => { /* transit score may not be available */ });

    getAccessGap(selectedCommunity, signal)
      .then((data) => { if (!signal.aborted && data?.accessGapScore != null) setAccessGap(data); })
      .catch(() => { /* access gap score may not be available */ });

    getDemographics(selectedCommunity, signal)
      .then((data) => {
        if (!signal.aborted && data?.topLanguages) setTopLanguages(data.topLanguages);
      })
      .catch(() => { /* demographics may not be available for all communities */ });

    return () => { controller.abort(); };
  }, [selectedCommunity]);

  return { metrics, metricsLoading, topLanguages, transitScore, accessGap };
}
