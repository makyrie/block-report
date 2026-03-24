import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import SanDiegoMap from '../components/map/san-diego-map';
import NeighborhoodSelector from '../components/ui/neighborhood-selector';
import Sidebar from '../components/ui/sidebar';
import { FlyerLayout } from '../components/flyer/flyer-layout';
import { PrintFlyerFab } from '../components/flyer/print-flyer-fab';
import { get311Trends, getPermits, getCitywideGaps, generateAddressBlockReport } from '../api/client';
import type { CommunityAnchor, CommunityReport, CommunityTrends, Permit } from '../types';
import { useLanguage } from '../i18n/context';
import { SUPPORTED_LANGUAGES } from '../i18n/translations';
import { toSlug, fromSlug } from '../utils/slug';
import { findCommunityAtPoint } from '../utils/point-in-polygon';
import { useMapData } from '../hooks/use-map-data';
import { useCommunityData } from '../hooks/use-community-data';
import { useBlockData } from '../hooks/use-block-data';
import { useReport } from '../hooks/use-report';
import { norm } from '../utils/community';

export default function NeighborhoodPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { lang, setLang, t, reportLang } = useLanguage();
  const [mobileView, setMobileView] = useState<'map' | 'info'>('map');

  const { libraries, recCenters, neighborhoodBoundaries, dataError } = useMapData();
  const [permits, setPermits] = useState<Permit[]>([]);

  // --- Community selection ---
  const [selectedCommunity, setSelectedCommunity] = useState<string | null>(
    slug ? fromSlug(slug) : null,
  );
  const [selectedAnchor, setSelectedAnchor] = useState<CommunityAnchor | null>(null);

  const { metrics, metricsLoading, topLanguages, transitScore, accessGap } = useCommunityData(selectedCommunity);
  const { pinnedLocation, setPinnedLocation, blockData, setBlockData, blockLoading, blockRadius, setBlockRadius } = useBlockData();

  // Fetch trends data
  const [trends, setTrends] = useState<CommunityTrends | null>(null);
  const [trendsSettled, setTrendsSettled] = useState(false);

  useEffect(() => {
    if (!selectedCommunity) {
      setTrends(null);
      setTrendsSettled(false);
      return;
    }

    const controller = new AbortController();
    setTrends(null);
    setTrendsSettled(false);

    get311Trends(selectedCommunity, controller.signal)
      .then(setTrends)
      .catch(() => { /* trends may not be available for all communities */ })
      .finally(() => { if (!controller.signal.aborted) setTrendsSettled(true); });

    return () => { controller.abort(); };
  }, [selectedCommunity]);

  const [accessGapScores, setAccessGapScores] = useState<Map<string, number>>(new Map());
  const [showChoropleth, setShowChoropleth] = useState(false);

  // Ref to avoid stale closure in the slug-sync effect below
  const selectedCommunityRef = useRef(selectedCommunity);
  selectedCommunityRef.current = selectedCommunity;

  // Block-level report state
  const [blockReport, setBlockReport] = useState<CommunityReport | null>(null);
  const [blockReportLoading, setBlockReportLoading] = useState(false);
  const [blockReportError, setBlockReportError] = useState<string | null>(null);
  const blockReportGeneratingRef = useRef(false);

  // Sync URL -> state when slug changes (e.g. browser back/forward)
  useEffect(() => {
    const communityFromUrl = slug ? fromSlug(slug) : null;
    if (communityFromUrl !== selectedCommunityRef.current) {
      setSelectedCommunity(communityFromUrl);
      setSelectedAnchor(null);
    }
  }, [slug]);

  // Fetch permits filtered by selected community
  useEffect(() => {
    if (!selectedCommunity) {
      setPermits([]);
      return;
    }
    const controller = new AbortController();
    getPermits(selectedCommunity, { signal: controller.signal })
      .then(setPermits)
      .catch((err: unknown) => { if (err instanceof Error && err.name !== 'AbortError') console.error(err); });
    return () => controller.abort();
  }, [selectedCommunity]);

  // Fetch access gap scores for choropleth on mount
  useEffect(() => {
    getCitywideGaps()
      .then(({ ranking }) => {
        const scoreMap = new Map<string, number>();
        for (const r of ranking) {
          scoreMap.set(norm(r.community), r.accessGapScore);
        }
        setAccessGapScores(scoreMap);
      })
      .catch(console.error);
  }, []);

  const { report, reportLoading, reportError, handleGenerateReport } = useReport({
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

  // --- Event handlers ---
  const handleCommunityChange = useCallback(
    (community: string) => {
      if (community) {
        navigate(`/neighborhood/${toSlug(community)}`);
      } else {
        navigate('/');
      }
      setSelectedCommunity(community || null);
      setSelectedAnchor(null);
      setPinnedLocation(null);
      setBlockData(null);
    },
    [navigate, setPinnedLocation, setBlockData],
  );

  const handleAnchorClick = useCallback(
    (anchor: CommunityAnchor) => {
      setSelectedAnchor(anchor);
      setSelectedCommunity(anchor.community);
      setMobileView('info');
      navigate(`/neighborhood/${toSlug(anchor.community)}`);
      setMobileView('info');
    },
    [navigate],
  );

  const handleMapClick = useCallback((lat: number, lng: number) => {
    setPinnedLocation({ lat, lng });
    setBlockData(null);
    setBlockReport(null);
    setBlockReportError(null);

    if (neighborhoodBoundaries) {
      const detected = findCommunityAtPoint(lat, lng, neighborhoodBoundaries);
      if (detected && detected !== selectedCommunity) {
        setSelectedAnchor(null);
        navigate(`/neighborhood/${toSlug(detected)}`);
      }
    }
  }, [neighborhoodBoundaries, selectedCommunity, navigate, setPinnedLocation, setBlockData]);

  const handleAnchorClickMobile = useCallback(
    (anchor: CommunityAnchor) => { handleAnchorClick(anchor); setMobileView('info'); },
    [handleAnchorClick],
  );

  const handleToggleChoropleth = useCallback(
    () => setShowChoropleth(prev => !prev),
    [],
  );

  const handleGenerateBlockReport = useCallback(async () => {
    if (!pinnedLocation || !blockData || blockReportGeneratingRef.current) return;
    blockReportGeneratingRef.current = true;

    const address = blockData.nearestAddress || `${pinnedLocation.lat.toFixed(4)}, ${pinnedLocation.lng.toFixed(4)}`;
    const community = blockData.communityName || selectedCommunity || 'San Diego';

    setBlockReportLoading(true);
    setBlockReportError(null);
    try {
      const result = await generateAddressBlockReport(
        address,
        pinnedLocation.lat,
        pinnedLocation.lng,
        community,
        blockRadius,
        reportLang,
        metrics ? { resolutionRate: metrics.resolutionRate, totalRequests: metrics.totalRequests311 } : null,
      );
      setBlockReport(result);
    } catch (err) {
      setBlockReportError(err instanceof Error ? err.message : 'Failed to generate block report');
    } finally {
      blockReportGeneratingRef.current = false;
      setBlockReportLoading(false);
    }
  }, [pinnedLocation, blockData, blockRadius, selectedCommunity, reportLang, metrics]);

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
        {/* Back to citywide link */}
        <div className="px-4 pt-3 pb-0 shrink-0">
          <Link
            to="/citywide"
            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            {t('citywide.backToCitywide')}
          </Link>
        </div>

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
            blockData={blockData}
            blockRadius={blockRadius}
            blockLoading={blockLoading}
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
            {blockData && !blockLoading && (
              <button
                type="button"
                onClick={handleGenerateBlockReport}
                disabled={blockReportLoading}
                className="mt-2 w-full rounded bg-orange-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {blockReportLoading ? 'Generating...' : 'Generate Block Report'}
              </button>
            )}
            {blockData?.truncated && (
              <p className="mt-1 text-xs text-amber-600">Data was capped at 5,000 records. Results may be incomplete for this radius.</p>
            )}
            {blockReportError && (
              <p className="mt-1 text-xs text-red-600">{blockReportError}</p>
            )}
          </div>
        )}
        <SanDiegoMap
          libraries={libraries}
          recCenters={recCenters}
          permits={permits}
          neighborhoodBoundaries={neighborhoodBoundaries}
          selectedCommunity={selectedCommunity}
          onAnchorClick={handleAnchorClickMobile}
          onMapClick={handleMapClick}
          pinnedLocation={pinnedLocation}
          blockData={blockData}
          blockLoading={blockLoading}
          blockRadius={blockRadius}
          accessGapScores={accessGapScores}
          showChoropleth={showChoropleth}
          onToggleChoropleth={handleToggleChoropleth}
          onCommunitySelect={handleCommunityChange}
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

      {/* Floating print-flyer action button */}
      <PrintFlyerFab visible={report !== null && !reportLoading} />

      {/* Print-only flyer — rendered outside overflow containers so print.css can position it */}
      {(blockReport || report) && (
        <FlyerLayout
          report={blockReport || report!}
          neighborhoodSlug={toSlug((blockReport || report!).neighborhoodName)}
          metrics={blockReport ? undefined : metrics}
          topLanguages={blockReport ? undefined : topLanguages}
          trends={blockReport ? undefined : trends}
          isBlockLevel={!!blockReport}
          blockAddress={blockReport && blockData ? (blockData.nearestAddress || undefined) : undefined}
          blockMetrics={blockReport ? blockData || undefined : undefined}
        />
      )}
    </div>
  );
}
