import { useState, useEffect } from 'react';
import { getLibraries, getRecCenters, getTransitStops, getNeighborhoodBoundaries } from '../api/client';
import type { CommunityAnchor, TransitStop } from '../types';
import type { FeatureCollection } from 'geojson';

export function useNeighborhoodData() {
  const [libraries, setLibraries] = useState<CommunityAnchor[]>([]);
  const [recCenters, setRecCenters] = useState<CommunityAnchor[]>([]);
  const [transitStops, setTransitStops] = useState<TransitStop[]>([]);
  const [neighborhoodBoundaries, setNeighborhoodBoundaries] = useState<FeatureCollection | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    getLibraries(signal).then(setLibraries).catch((err) => { if (!signal.aborted) { console.error(err); setDataError('Failed to load map data'); } });
    getRecCenters(signal).then(setRecCenters).catch((err) => { if (!signal.aborted) { console.error(err); setDataError('Failed to load recreation center data'); } });
    getNeighborhoodBoundaries().then(setNeighborhoodBoundaries).catch((err) => { if (!signal.aborted) { console.error(err); setDataError('Failed to load boundary data'); } });
    getTransitStops(signal).then(setTransitStops).catch((err) => { if (!signal.aborted) { console.error(err); setDataError('Failed to load transit data'); } });

    return () => controller.abort();
  }, []);

  return { libraries, recCenters, transitStops, neighborhoodBoundaries, dataError };
}
