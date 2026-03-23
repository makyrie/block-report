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
    getLibraries().then(setLibraries).catch((err) => { console.error(err); setDataError('Failed to load map data'); });
    getRecCenters().then(setRecCenters).catch((err) => { console.error(err); setDataError('Failed to load recreation center data'); });
    getNeighborhoodBoundaries().then(setNeighborhoodBoundaries).catch((err) => { console.error(err); setDataError('Failed to load boundary data'); });
    getTransitStops().then(setTransitStops).catch((err) => { console.error(err); setDataError('Failed to load transit data'); });
  }, []);

  return { libraries, recCenters, transitStops, neighborhoodBoundaries, dataError };
}
