import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { FeatureCollection } from 'geojson';
import { getCitywideGaps, getNeighborhoodBoundaries } from '../api/client';
import type { CitywideCommunity } from '../types';
import { toSlug } from '../utils/slug';
import { useLanguage } from '../i18n/context';
import { titleCase } from '../utils/community';
import CitywideChoropleth from '../components/map/citywide-choropleth';
import CitywideRanking from '../components/ui/citywide-ranking';
import CitywideSummary from '../components/ui/citywide-summary';

export default function CitywidePage() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [mobileView, setMobileView] = useState<'map' | 'list'>('map');

  const [ranking, setRanking] = useState<CitywideCommunity[]>([]);
  const [summary, setSummary] = useState<{ total: number; withGaps: number } | null>(null);
  const [boundaries, setBoundaries] = useState<FeatureCollection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [hoveredCommunity, setHoveredCommunity] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(() => {
    // Abort any in-flight request (prevents stale state updates)
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const signal = controller.signal;

    setLoading(true);
    setError(false);

    Promise.all([getCitywideGaps(signal), getNeighborhoodBoundaries(signal)])
      .then(([gapData, boundaryData]) => {
        if (signal.aborted) return;
        setRanking(gapData.ranking);
        setSummary(gapData.summary);
        setBoundaries(boundaryData);
      })
      .catch((err) => {
        if (signal.aborted) return;
        console.error('Failed to load citywide data', err);
        setError(true);
      })
      .finally(() => {
        if (!signal.aborted) setLoading(false);
      });
  }, []);

  useEffect(() => {
    fetchData();
    return () => abortRef.current?.abort();
  }, [fetchData]);

  const handleClickCommunity = useCallback(
    (community: string) => {
      navigate(`/neighborhood/${toSlug(titleCase(community))}`);
    },
    [navigate],
  );

  // Loading state
  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <div className="text-center" role="status" aria-live="polite">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3" />
          <p className="text-sm text-gray-600">{t('citywide.loading')}</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-sm text-red-600 mb-3">{t('citywide.error')}</p>
          <button
            type="button"
            onClick={() => fetchData()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            {t('citywide.retry')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Summary bar */}
      {summary && <CitywideSummary total={summary.total} withGaps={summary.withGaps} />}

      {/* Main content: map + list */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Map */}
        <div
          role="tabpanel"
          id="tabpanel-map"
          aria-labelledby="tab-map"
          className={`flex-1 min-h-0 ${mobileView === 'map' ? 'block' : 'hidden md:block'}`}
        >
          {boundaries ? (
            <CitywideChoropleth
              boundaries={boundaries}
              ranking={ranking}
              hoveredCommunity={hoveredCommunity}
              onHoverCommunity={setHoveredCommunity}
              onClickCommunity={handleClickCommunity}
            />
          ) : (
            <div className="h-full flex items-center justify-center bg-gray-100">
              <p className="text-sm text-gray-500">{t('citywide.noScore')}</p>
            </div>
          )}
        </div>

        {/* Ranked list */}
        <div
          role="tabpanel"
          id="tabpanel-list"
          aria-labelledby="tab-list"
          className={`md:w-96 md:shrink-0 md:border-l md:border-gray-200 overflow-hidden ${
            mobileView === 'list' ? 'flex-1' : 'hidden md:block'
          }`}
        >
          <CitywideRanking
            ranking={ranking}
            hoveredCommunity={hoveredCommunity}
            onHoverCommunity={setHoveredCommunity}
            onClickCommunity={handleClickCommunity}
          />
        </div>
      </div>

      {/* Mobile bottom tab bar */}
      <div
        role="tablist"
        aria-label="Citywide views"
        className="md:hidden flex shrink-0 border-t border-gray-200 bg-white"
      >
        <button
          type="button"
          role="tab"
          id="tab-map"
          aria-selected={mobileView === 'map'}
          aria-controls="tabpanel-map"
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
          id="tab-list"
          aria-selected={mobileView === 'list'}
          aria-controls="tabpanel-list"
          onClick={() => setMobileView('list')}
          className={`flex-1 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${
            mobileView === 'list'
              ? 'text-blue-600 border-t-2 border-blue-600 -mt-px'
              : 'text-gray-500'
          }`}
        >
          {t('citywide.rank')}
        </button>
      </div>
    </div>
  );
}
