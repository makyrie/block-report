import { useState, useEffect } from 'react';
import { getBlockData } from '../api/client';
import type { BlockMetrics } from '../types';

export function useBlockData(pinnedLocation: { lat: number; lng: number } | null, blockRadius: number) {
  const [blockData, setBlockData] = useState<BlockMetrics | null>(null);
  const [blockLoading, setBlockLoading] = useState(false);

  useEffect(() => {
    if (!pinnedLocation) return;
    let cancelled = false;
    setBlockLoading(true);
    getBlockData(pinnedLocation.lat, pinnedLocation.lng, blockRadius)
      .then((data) => { if (!cancelled) setBlockData(data); })
      .catch((err) => { if (!cancelled) console.error('Failed to fetch block data', err); })
      .finally(() => { if (!cancelled) setBlockLoading(false); });
    return () => { cancelled = true; };
  }, [blockRadius, pinnedLocation]);

  return { blockData, setBlockData, blockLoading };
}
