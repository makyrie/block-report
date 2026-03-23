import { useState, useEffect } from 'react';
import { getBlockData } from '../api/client';
import type { BlockMetrics } from '../types';

export function useBlockData(pinnedLocation: { lat: number; lng: number } | null, blockRadius: number) {
  const [blockData, setBlockData] = useState<BlockMetrics | null>(null);
  const [blockLoading, setBlockLoading] = useState(false);

  useEffect(() => {
    if (!pinnedLocation) return;
    const controller = new AbortController();
    setBlockLoading(true);
    getBlockData(pinnedLocation.lat, pinnedLocation.lng, blockRadius, controller.signal)
      .then((data) => { if (!controller.signal.aborted) setBlockData(data); })
      .catch((err) => { if (!controller.signal.aborted) console.error('Failed to fetch block data', err); })
      .finally(() => { if (!controller.signal.aborted) setBlockLoading(false); });
    return () => { controller.abort(); };
  }, [blockRadius, pinnedLocation]);

  return { blockData, setBlockData, blockLoading };
}
