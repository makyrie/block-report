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

    setMetricsLoading(true);
    setMetrics(null);
    setTopLanguages([]);
    setTransitScore(null);
    setAccessGap(null);

    get311(selectedCommunity)
      .then(setMetrics)
      .catch(console.error)
      .finally(() => setMetricsLoading(false));

    getTransitScore(selectedCommunity)
      .then(setTransitScore)
      .catch(() => { /* transit score may not be available */ });

    getAccessGap(selectedCommunity)
      .then((data) => { if (data?.accessGapScore != null) setAccessGap(data); })
      .catch(() => { /* access gap score may not be available */ });

    getDemographics(selectedCommunity)
      .then((data) => {
        if (data?.topLanguages) setTopLanguages(data.topLanguages);
      })
      .catch(() => {
        // Demographics may not be available for all communities
      });
  }, [selectedCommunity]);

  return { metrics, metricsLoading, topLanguages, transitScore, accessGap };
}
