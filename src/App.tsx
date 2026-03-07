import { useState, useEffect, useCallback } from 'react';
import SanDiegoMap from './components/map/san-diego-map';
import NeighborhoodSelector from './components/ui/neighborhood-selector';
import Sidebar from './components/ui/sidebar';
import { getLibraries, getRecCenters, getTransitStops, get311, generateBrief } from './api/client';
import type { CommunityAnchor, CommunityBrief, NeighborhoodProfile } from './types';


interface TransitStop {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

function App() {
  const [libraries, setLibraries] = useState<CommunityAnchor[]>([]);
  const [recCenters, setRecCenters] = useState<CommunityAnchor[]>([]);
  const [transitStops, setTransitStops] = useState<TransitStop[]>([]);

  const [selectedCommunity, setSelectedCommunity] = useState<string | null>(null);
  const [selectedAnchor, setSelectedAnchor] = useState<CommunityAnchor | null>(null);
  const [metrics, setMetrics] = useState<NeighborhoodProfile['metrics'] | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);

  const [brief, setBrief] = useState<CommunityBrief | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);

  // Fetch map data on mount
  useEffect(() => {
    getLibraries().then(setLibraries).catch(console.error);
    getRecCenters().then(setRecCenters).catch(console.error);
    getTransitStops()
      .then((stops) => {
        // Normalize transit stop shape from the API
        const normalized: TransitStop[] = (stops as Record<string, unknown>[]).map((s) => ({
          id: String((s as Record<string, unknown>).id ?? (s as Record<string, unknown>).stop_uid ?? ''),
          name: String((s as Record<string, unknown>).name ?? (s as Record<string, unknown>).stop_name ?? ''),
          lat: Number((s as Record<string, unknown>).lat ?? (s as Record<string, unknown>).stop_lat ?? 0),
          lng: Number((s as Record<string, unknown>).lng ?? (s as Record<string, unknown>).stop_lon ?? 0),
        }));
        setTransitStops(normalized);
      })
      .catch(console.error);
  }, []);

  // Fetch 311 metrics when community changes
  useEffect(() => {
    if (!selectedCommunity) {
      setMetrics(null);
      setBrief(null);
      return;
    }

    setMetricsLoading(true);
    setMetrics(null);
    setBrief(null);

    get311(selectedCommunity)
      .then(setMetrics)
      .catch(console.error)
      .finally(() => setMetricsLoading(false));
  }, [selectedCommunity]);

  const handleCommunityChange = useCallback((community: string) => {
    setSelectedCommunity(community || null);
    setSelectedAnchor(null);
  }, []);

  const handleAnchorClick = useCallback((anchor: CommunityAnchor) => {
    setSelectedAnchor(anchor);
    setSelectedCommunity(anchor.community);
  }, []);

  const handleGenerateBrief = useCallback(async () => {
    if (!selectedCommunity || !metrics) return;

    const anchor = selectedAnchor ?? {
      id: '',
      name: selectedCommunity,
      type: 'library' as const,
      lat: 0,
      lng: 0,
      address: '',
      community: selectedCommunity,
    };

    const profile: NeighborhoodProfile = {
      communityName: selectedCommunity,
      anchor,
      metrics,
      transit: { nearbyStopCount: 0, nearestStopDistance: 0 },
      demographics: { topLanguages: [] },
    };

    setBriefLoading(true);
    setBriefError(null);
    try {
      const result = await generateBrief(profile, 'English');
      setBrief(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate brief';
      setBriefError(message);
    } finally {
      setBriefLoading(false);
    }
  }, [selectedCommunity, selectedAnchor, metrics]);

  return (
    <div className="flex h-screen print:block">
      {/* Sidebar */}
      <aside className="w-96 shrink-0 border-r border-gray-200 overflow-y-auto flex flex-col print:w-full print:border-none">
        <div className="p-4 border-b border-gray-100">
          <h1 className="text-xl font-bold mb-3">Block Report</h1>
          <NeighborhoodSelector
            value={selectedCommunity ?? ''}
            onChange={handleCommunityChange}
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          <Sidebar
            community={selectedCommunity}
            metrics={metrics}
            loading={metricsLoading}
            onGenerateBrief={handleGenerateBrief}
            brief={brief}
            briefLoading={briefLoading}
            briefError={briefError}
          />
        </div>
      </aside>

      {/* Map */}
      <main className="flex-1 print:hidden">
        <SanDiegoMap
          libraries={libraries}
          recCenters={recCenters}
          transitStops={transitStops}
          onAnchorClick={handleAnchorClick}
        />
      </main>
    </div>
  );
}

export default App;
