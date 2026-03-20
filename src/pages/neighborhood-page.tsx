import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import SanDiegoMap from '../components/map/san-diego-map';
import NeighborhoodSelector from '../components/ui/neighborhood-selector';
import Sidebar from '../components/ui/sidebar';
import { FlyerLayout } from '../components/flyer/flyer-layout';
import { getLibraries, getRecCenters, getTransitStops, get311, get311Trends, getDemographics, getNeighborhoodBoundaries, getTransitScore, getAccessGap, getBlockData } from '../api/client';
import type { BlockMetrics, CommunityAnchor, CommunityTrends, NeighborhoodProfile, TransitStop } from '../types';
import type { FeatureCollection } from 'geojson';
import { useLanguage } from '../i18n/context';
import { SUPPORTED_LANGUAGES } from '../i18n/translations';
import { toSlug, fromSlug } from '../utils/slug';
import { useReport } from '../hooks/use-report';

export default function NeighborhoodPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { lang, setLang, t, reportLang } = useLanguage();
  const [mobileView, setMobileView] = useState<'map' | 'info'>('map');

  const [libraries, setLibraries] = useState<CommunityAnchor[]>([]);
  const [recCenters, setRecCenters] = useState<CommunityAnchor[]>([]);
  const [transitStops, setTransitStops] = useState<TransitStop[]>([]);
  const [neighborhoodBoundaries, setNeighborhoodBoundaries] = useState<FeatureCollection | null>(null);

  const [selectedCommunity, setSelectedCommunity] = useState<string | null>(
    slug ? fromSlug(slug) : null,
  );
  const [selectedAnchor, setSelectedAnchor] = useState<CommunityAnchor | null>(null);
  const [metrics, setMetrics] = useState<NeighborhoodProfile['metrics'] | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [topLanguages, setTopLanguages] = useState<{ language: string; percentage: number }[]>([]);

  const [transitScore, setTransitScore] = useState<NeighborhoodProfile['transit'] | null>(null);
  const [accessGap, setAccessGap] = useState<NeighborhoodProfile['accessGap']>(null);
  const [trends, setTrends] = useState<CommunityTrends | null>(null);
  const [trendsSettled, setTrendsSettled] = useState(false);
  const [pinnedLocation, setPinnedLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [blockData, setBlockData] = useState<BlockMetrics | null>(null);
  const [blockLoading, setBlockLoading] = useState(false);
  const [blockRadius, setBlockRadius] = useState(0.25);

  const [dataError, setDataError] = useState<string | null>(null);

  // Sync URL -> state when slug changes (e.g. browser back/forward)
  useEffect(() => {
    const communityFromUrl = slug ? fromSlug(slug) : null;
    if (communityFromUrl !== selectedCommunity) {
      setSelectedCommunity(communityFromUrl);
      setSelectedAnchor(null);
    }
  }, [slug]);

  // Fetch map data on mount
  useEffect(() => {
    getLibraries().then(setLibraries).catch((err) => { console.error(err); setDataError('Failed to load map data'); });
    getRecCenters().then(setRecCenters).catch(console.error);
    getNeighborhoodBoundaries().then(setNeighborhoodBoundaries).catch(console.error);
    getTransitStops()
      .then(setTransitStops)
      .catch(console.error);
  }, []);

  // Fetch 311 metrics and demographics when community changes
  useEffect(() => {
    if (!selectedCommunity) {
      setMetrics(null);
      setReport(null);
      setTopLanguages([]);
      setTransitScore(null);
      setAccessGap(null);
      setTrends(null);
      setTrendsSettled(false);
      return;
    }

    const controller = new AbortController();
    const { signal } = controller;

    setMetricsLoading(true);
    setMetrics(null);
    setTopLanguages([]);
    setTransitScore(null);
    setAccessGap(null);
    setTrends(null);
    setTrendsSettled(false);

    get311(selectedCommunity, signal)
      .then(setMetrics)
      .catch((err) => { if (!signal.aborted) console.error(err); })
      .finally(() => { if (!signal.aborted) setMetricsLoading(false); });

    getTransitScore(selectedCommunity, signal)
      .then(setTransitScore)
      .catch(() => { /* transit score may not be available */ });

    getAccessGap(selectedCommunity, signal)
      .then((data) => { if (!signal.aborted && data?.accessGapScore != null) setAccessGap(data); })
      .catch(() => { /* access gap score may not be available */ });

    get311Trends(selectedCommunity, signal)
      .then(setTrends)
      .catch(() => { /* trends may not be available for all communities */ })
      .finally(() => { if (!signal.aborted) setTrendsSettled(true); });

    getDemographics(selectedCommunity, signal)
      .then((data) => {
        if (!signal.aborted && data?.topLanguages) setTopLanguages(data.topLanguages);
      })
      .catch(() => {
        // Demographics may not be available for all communities
      });

    return () => { controller.abort(); };
  }, [selectedCommunity]);

  const { report, reportLoading, reportError, regenerate: handleGenerateReport } = useReport({
    community: selectedCommunity,
    reportLang,
    metrics,
    trends,
    trendsSettled,
    topLanguages,
    anchor: selectedAnchor,
    transitScore,
    accessGap,
  });

  const handleCommunityChange = useCallback(
    (community: string) => {
      if (community) {
        navigate(`/neighborhood/${toSlug(community)}`);
      } else {
        navigate('/');
      }
      setSelectedCommunity(community || null);
      setSelectedAnchor(null);
    },
    [navigate],
  );

  const handleAnchorClick = useCallback(
    (anchor: CommunityAnchor) => {
      setSelectedAnchor(anchor);
      setSelectedCommunity(anchor.community);
      navigate(`/neighborhood/${toSlug(anchor.community)}`);
    },
    [navigate],
  );

  const handleMapClick = useCallback(async (lat: number, lng: number) => {
    setPinnedLocation({ lat, lng });
    setBlockData(null);
    setBlockLoading(true);
    try {
      const data = await getBlockData(lat, lng, blockRadius);
      setBlockData(data);
    } catch (err) {
      console.error('Failed to fetch block data', err);
    } finally {
      setBlockLoading(false);
    }
  }, [blockRadius]);

  // Re-fetch block data when radius changes
  useEffect(() => {
    if (!pinnedLocation) return;
    setBlockLoading(true);
    getBlockData(pinnedLocation.lat, pinnedLocation.lng, blockRadius)
      .then(setBlockData)
      .catch((err) => console.error('Failed to fetch block data', err))
      .finally(() => setBlockLoading(false));
  }, [blockRadius, pinnedLocation]);

  return (
    <div className="flex flex-col h-full md:flex-row print:block">
      {dataError && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-sm text-red-700" role="alert">
          {dataError}
        </div>
      )}
      {/* Sidebar — full panel on desktop, shown on mobile only in 'info' tab */}
      <aside
        id="panel-info"
        aria-label="Neighborhood information"
        className={`
          flex flex-col flex-1 overflow-y-auto
          md:w-96 md:flex md:shrink-0 md:border-r md:border-gray-200
          print:w-full print:border-none
          ${mobileView === 'info' ? 'flex' : 'hidden md:flex'}
        `}
      >
        {/* Sidebar header with neighborhood selector + language buttons */}
        <div className="p-4 border-b border-gray-100 shrink-0">
          <div className="flex flex-wrap gap-1 mb-3">
            {SUPPORTED_LANGUAGES.map((l) => (
              <button
                key={l.code}
                type="button"
                onClick={() => setLang(l.code)}
                title={l.label}
                className={`px-2 py-1 text-xs rounded transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  lang === l.code
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-500 hover:text-blue-600 hover:bg-gray-100'
                }`}
              >
                {l.nativeLabel}
              </button>
            ))}
          </div>
          <NeighborhoodSelector
            value={selectedCommunity ?? ''}
            onChange={(c) => { handleCommunityChange(c); if (c) setMobileView('info'); }}
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          <Sidebar
            community={selectedCommunity}
            metrics={metrics}
            loading={metricsLoading}
            onGenerateReport={handleGenerateReport}
            report={report}
            reportLoading={reportLoading}
            reportError={reportError}
            topLanguages={topLanguages}
            transitScore={transitScore}
            accessGap={accessGap}
            trends={trends}
          />
        </div>
      </aside>

      {/* Map */}
      <main
        id="main-content"
        aria-label="Neighborhood map"
        className={`
          relative flex-1 print:hidden
          ${mobileView === 'map' ? 'block' : 'hidden md:block'}
        `}
      >
        {pinnedLocation && (
          <div className="absolute top-2 right-2 z-[1000] bg-white/95 backdrop-blur-sm rounded-lg shadow-md px-3 py-2">
            <p className="text-xs font-medium text-gray-600 mb-1.5">Block radius</p>
            <div className="flex gap-1">
              {([0.1, 0.25, 0.5, 1] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setBlockRadius(r)}
                  className={`px-2 py-1 text-xs rounded font-medium transition-colors ${
                    blockRadius === r
                      ? 'bg-orange-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {r} mi
                </button>
              ))}
            </div>
          </div>
        )}
        <SanDiegoMap
          libraries={libraries}
          recCenters={recCenters}
          transitStops={transitStops}
          neighborhoodBoundaries={neighborhoodBoundaries}
          selectedCommunity={selectedCommunity}
          onAnchorClick={(anchor) => { handleAnchorClick(anchor); setMobileView('info'); }}
          onMapClick={handleMapClick}
          pinnedLocation={pinnedLocation}
          blockData={blockData}
          blockLoading={blockLoading}
          blockRadius={blockRadius}
        />
      </main>

      {/* Mobile bottom tab bar */}
      <div
        role="tablist"
        aria-label="App views"
        className="md:hidden flex shrink-0 border-t border-gray-200 bg-white print:hidden"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mobileView === 'map'}
          aria-controls="main-content"
          onClick={() => setMobileView('map')}
          className={`flex-1 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${
            mobileView === 'map'
              ? 'text-blue-600 border-t-2 border-blue-600 -mt-px'
              : 'text-gray-500'
          }`}
        >
          {t('nav.map')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mobileView === 'info'}
          aria-controls="panel-info"
          onClick={() => setMobileView('info')}
          className={`flex-1 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${
            mobileView === 'info'
              ? 'text-blue-600 border-t-2 border-blue-600 -mt-px'
              : 'text-gray-500'
          }`}
        >
          {selectedCommunity ?? t('nav.info')}
        </button>
      </div>

      {/* Print-only flyer — rendered outside overflow containers so print.css can position it */}
      {report && (
        <FlyerLayout
          report={report}
          neighborhoodSlug={toSlug(report.neighborhoodName)}
          metrics={metrics}
          topLanguages={topLanguages}
          trends={trends}
        />
      )}
    </div>
  );
}
