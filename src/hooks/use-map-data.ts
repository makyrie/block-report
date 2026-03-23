import { useState, useEffect } from 'react';
import { getLibraries, getRecCenters, getNeighborhoodBoundaries } from '../api/client';
import type { CommunityAnchor } from '../types';
import type { FeatureCollection } from 'geojson';

export interface MapData {
  libraries: CommunityAnchor[];
  recCenters: CommunityAnchor[];
  neighborhoodBoundaries: FeatureCollection | null;
  dataError: string | null;
}

export function useMapData(): MapData {
  const [libraries, setLibraries] = useState<CommunityAnchor[]>([]);
  const [recCenters, setRecCenters] = useState<CommunityAnchor[]>([]);
  const [neighborhoodBoundaries, setNeighborhoodBoundaries] = useState<FeatureCollection | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    getLibraries(controller.signal).then((data) => { if (!cancelled) setLibraries(data); }).catch((err) => { if (!cancelled && err?.name !== 'AbortError') { console.error(err); setDataError('Failed to load map data'); } });
    getRecCenters(controller.signal).then((data) => { if (!cancelled) setRecCenters(data); }).catch((err) => { if (!cancelled && err?.name !== 'AbortError') { console.error(err); setDataError('Failed to load map data'); } });
    getNeighborhoodBoundaries().then((data) => { if (!cancelled) setNeighborhoodBoundaries(data); }).catch((err) => { if (!cancelled) { console.error(err); setDataError('Failed to load map data'); } });

    return () => { cancelled = true; controller.abort(); };
  }, []);

  return { libraries, recCenters, neighborhoodBoundaries, dataError };
}
