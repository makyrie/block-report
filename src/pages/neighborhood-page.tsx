import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import SanDiegoMap from '../components/map/san-diego-map';
import NeighborhoodSelector from '../components/ui/neighborhood-selector';
import Sidebar from '../components/ui/sidebar';
import { getLibraries, getRecCenters, getTransitStops, get311, getDemographics, generateBrief, getNeighborhoodBoundaries, getTransitScore } from '../api/client';
import type { CommunityAnchor, CommunityBrief, NeighborhoodProfile, TransitStop } from '../types';
import type { FeatureCollection } from 'geojson';
import { useLanguage } from '../i18n/context';
import { SUPPORTED_LANGUAGES } from '../i18n/translations';
import { toSlug, fromSlug } from '../utils/slug';

export default function NeighborhoodPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { lang, setLang, t } = useLanguage();
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
  const [dataError, setDataError] = useState<string | null>(null);

  const [brief, setBrief] = useState<CommunityBrief | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);

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
      setBrief(null);
      setTopLanguages([]);
      setTransitScore(null);
      return;
    }

    setMetricsLoading(true);
    setMetrics(null);
    setBrief(null);
    setTopLanguages([]);
    setTransitScore(null);

    get311(selectedCommunity)
      .then(setMetrics)
      .catch(console.error)
      .finally(() => setMetricsLoading(false));

    getTransitScore(selectedCommunity)
      .then(setTransitScore)
      .catch(() => { /* transit score may not be available */ });

    // Try to fetch demographics for language suggestion
    getDemographics(selectedCommunity)
      .then((data) => {
        if (data?.topLanguages) setTopLanguages(data.topLanguages);
      })
      .catch(() => {
        // Demographics may not be available for all communities
      });
  }, [selectedCommunity]);

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

  const handleGenerateBrief = useCallback(async (language: string) => {
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
      transit: transitScore ?? { nearbyStopCount: 0, nearestStopDistance: 0, stopCount: 0, agencyCount: 0, agencies: [], transitScore: 0, cityAverage: 0 },
      demographics: { topLanguages },
    };

    setBriefLoading(true);
    setBriefError(null);
    try {
      const result = await generateBrief(profile, language);
      setBrief(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate brief';
      setBriefError(message);
    } finally {
      setBriefLoading(false);
    }
  }, [selectedCommunity, selectedAnchor, metrics, topLanguages, transitScore]);

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
            onGenerateBrief={handleGenerateBrief}
            brief={brief}
            briefLoading={briefLoading}
            briefError={briefError}
            topLanguages={topLanguages}
            transitScore={transitScore}
          />
        </div>
      </aside>

      {/* Map */}
      <main
        id="main-content"
        aria-label="Neighborhood map"
        className={`
          flex-1 print:hidden
          ${mobileView === 'map' ? 'block' : 'hidden md:block'}
        `}
      >
        <SanDiegoMap
          libraries={libraries}
          recCenters={recCenters}
          transitStops={transitStops}
          neighborhoodBoundaries={neighborhoodBoundaries}
          selectedCommunity={selectedCommunity}
          onAnchorClick={(anchor) => { handleAnchorClick(anchor); setMobileView('info'); }}
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
    </div>
  );
}
