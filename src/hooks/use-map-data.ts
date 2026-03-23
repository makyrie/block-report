import { useState, useEffect } from 'react';
import { getLibraries, getRecCenters, getTransitStops, getNeighborhoodBoundaries } from '../api/client';
import type { CommunityAnchor, TransitStop } from '../types';
import type { FeatureCollection } from 'geojson';

export interface MapData {
  libraries: CommunityAnchor[];
  recCenters: CommunityAnchor[];
  transitStops: TransitStop[];
  neighborhoodBoundaries: FeatureCollection | null;
  error: string | null;
}

/** Fetch static map data (libraries, rec centers, transit stops, boundaries) on mount. */
export function useMapData(): MapData {
  const [libraries, setLibraries] = useState<CommunityAnchor[]>([]);
  const [recCenters, setRecCenters] = useState<CommunityAnchor[]>([]);
  const [transitStops, setTransitStops] = useState<TransitStop[]>([]);
  const [neighborhoodBoundaries, setNeighborhoodBoundaries] = useState<FeatureCollection | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    const onError = (err: unknown) => { if (!signal.aborted) { console.error(err); setError('Failed to load map data'); } };

    getLibraries(signal)
      .then((data) => { if (!signal.aborted) setLibraries(data); })
      .catch(onError);
    getRecCenters(signal)
      .then((data) => { if (!signal.aborted) setRecCenters(data); })
      .catch(onError);
    getNeighborhoodBoundaries()
      .then((data) => { if (!signal.aborted) setNeighborhoodBoundaries(data); })
      .catch(onError);
    getTransitStops()
      .then((data) => { if (!signal.aborted) setTransitStops(data); })
      .catch(onError);
    return () => { controller.abort(); };
  }, []);

  return { libraries, recCenters, transitStops, neighborhoodBoundaries, error };
}
