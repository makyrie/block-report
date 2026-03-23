import { useState, useEffect } from 'react';
import { getBlockData } from '../api/client';
import type { BlockMetrics } from '../types';

export interface BlockDataState {
  pinnedLocation: { lat: number; lng: number } | null;
  setPinnedLocation: (loc: { lat: number; lng: number } | null) => void;
  blockData: BlockMetrics | null;
  setBlockData: (data: BlockMetrics | null) => void;
  blockLoading: boolean;
  blockRadius: number;
  setBlockRadius: (r: number) => void;
}

export function useBlockData(): BlockDataState {
  const [pinnedLocation, setPinnedLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [blockData, setBlockData] = useState<BlockMetrics | null>(null);
  const [blockLoading, setBlockLoading] = useState(false);
  const [blockRadius, setBlockRadius] = useState(0.25);

  useEffect(() => {
    if (!pinnedLocation) return;
    setBlockLoading(true);
    getBlockData(pinnedLocation.lat, pinnedLocation.lng, blockRadius)
      .then(setBlockData)
      .catch((err) => console.error('Failed to fetch block data', err))
      .finally(() => setBlockLoading(false));
  }, [blockRadius, pinnedLocation]);

  return { pinnedLocation, setPinnedLocation, blockData, setBlockData, blockLoading, blockRadius, setBlockRadius };
}
