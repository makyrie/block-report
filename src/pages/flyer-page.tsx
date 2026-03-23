import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { COMMUNITIES } from '../components/ui/neighborhood-selector';
import { FlyerLayout } from '../components/flyer/flyer-layout';
import { useLanguage } from '../i18n/context';
import { SUPPORTED_LANGUAGES } from '../i18n/translations';
import { toSlug, fromSlug } from '../utils/slug';
import { get311, getDemographics, getPreGeneratedReport, generateReport } from '../api/client';
import type { CommunityReport, NeighborhoodProfile } from '../types';
import { DEFAULT_TRANSIT } from '../types';

export default function FlyerPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { lang, setLang, t, reportLang } = useLanguage();

  const community = slug ? fromSlug(slug) : null;

  const [metrics, setMetrics] = useState<NeighborhoodProfile['metrics'] | null>(null);
  const [topLanguages, setTopLanguages] = useState<{ language: string; percentage: number }[]>([]);
  const [report, setReport] = useState<CommunityReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch metrics and demographics when community is set
  useEffect(() => {
    if (!community) return;
    const controller = new AbortController();
    const { signal } = controller;
    setMetrics(null);
    setTopLanguages([]);
    get311(community, signal)
      .then(setMetrics)
      .catch((e) => { if (!signal.aborted) console.error(e); });
    getDemographics(community, signal)
      .then((data) => { if (!signal.aborted && data?.topLanguages) setTopLanguages(data.topLanguages); })
      .catch(() => {});
    return () => { controller.abort(); };
  }, [community]);

  // Auto-fetch report when community and language are ready
  useEffect(() => {
    if (!community) return;

    let cancelled = false;
    setReport(null);
    setError(null);
    setLoading(true);

    (async () => {
      // Try pre-generated first
      const cached = await getPreGeneratedReport(community, reportLang);
      if (cancelled) return;

      if (cached) {
        setReport(cached);
        setLoading(false);
        return;
      }

      // Fall back to on-demand generation if metrics are ready
      if (!metrics) {
        setLoading(false);
        return;
      }

      const profile: NeighborhoodProfile = {
        communityName: community,
        anchor: { id: '', name: community, type: 'library', lat: 0, lng: 0, address: '', community },
        metrics,
        transit: DEFAULT_TRANSIT,
        demographics: { topLanguages },
        accessGap: null,
      };

      try {
        const result = await generateReport(profile, reportLang);
        if (!cancelled) setReport(result);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to generate report');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [community, reportLang, metrics]);

  function handlePrint() {
    window.print();
  }

  // Step 1: No community selected — show picker
  if (!community) {
    return (
      <div className="h-full overflow-y-auto bg-gray-50 flex flex-col">
        <main id="main-content" className="flex-1 px-4 py-8 max-w-lg mx-auto w-full">
          <div className="text-center mb-8">
            <div className="text-4xl mb-3" aria-hidden="true">{'\uD83D\uDDA8\uFE0F'}</div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              {t('flyer.pageTitle')}
            </h1>
            <p className="text-gray-600 text-sm">
              {t('flyer.pageSubtitle')}
            </p>
          </div>

          {/* Language selector */}
          <div className="mb-6">
            <p className="text-sm font-medium text-gray-700 mb-2 text-center">{t('welcome.chooseLanguage')}</p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUPPORTED_LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => setLang(l.code)}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                    lang === l.code
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-white border border-gray-300 text-gray-700 hover:border-blue-400 hover:text-blue-700'
                  }`}
                >
                  {l.nativeLabel}
                </button>
              ))}
            </div>
          </div>

          {/* Neighborhood picker */}
          <div className="mb-6">
            <label htmlFor="flyer-neighborhood" className="block text-sm font-medium text-gray-700 mb-2 text-center">
              {t('welcome.pickNeighborhood')}
            </label>
            <select
              id="flyer-neighborhood"
              onChange={(e) => { if (e.target.value) navigate(`/flyer/${toSlug(e.target.value)}`); }}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-3 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              defaultValue=""
            >
              <option value="">{t('welcome.pickNeighborhood')}</option>
              {COMMUNITIES.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>

          <div className="text-center">
            <Link to="/" className="text-sm text-blue-600 hover:text-blue-800 underline">
              {t('flyer.backToHome')}
            </Link>
          </div>
        </main>
      </div>
    );
  }

  // Step 2: Community selected — show flyer preview
  return (
    <div className="h-full overflow-y-auto bg-gray-50 flex flex-col print:bg-white print:overflow-visible">
      <main id="main-content" className="flex-1 px-4 py-6 max-w-3xl mx-auto w-full print:p-0 print:max-w-none">
        {/* Header — hidden when printing */}
        <div className="print:hidden mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl font-bold text-gray-900">{community}</h1>
              <p className="text-sm text-gray-500">{t('flyer.previewDescription')}</p>
            </div>
            <div className="flex gap-2">
              <Link
                to={`/neighborhood/${slug}`}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                {t('flyer.seeFullReport')}
              </Link>
              <button
                type="button"
                onClick={handlePrint}
                disabled={!report}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {t('flyer.print')}
              </button>
            </div>
          </div>

          {/* Language selector */}
          <div className="flex flex-wrap gap-2 mb-4">
            {SUPPORTED_LANGUAGES.map((l) => (
              <button
                key={l.code}
                type="button"
                onClick={() => setLang(l.code)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  lang === l.code
                    ? 'bg-blue-600 text-white'
                    : 'bg-white border border-gray-300 text-gray-600 hover:border-blue-400'
                }`}
              >
                {l.nativeLabel}
              </button>
            ))}
          </div>

          {/* Change neighborhood */}
          <select
            value={community}
            onChange={(e) => { if (e.target.value) navigate(`/flyer/${toSlug(e.target.value)}`); }}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {COMMUNITIES.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>

        {/* Flyer content */}
        {loading && (
          <div className="text-center py-12 print:hidden">
            <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-3" />
            <p className="text-sm text-gray-500">{t('report.generating')}</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700 print:hidden">
            {error}
          </div>
        )}

        {report && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 print:shadow-none print:border-none print:rounded-none">
            <div className="p-8 print:p-0">
              <FlyerLayout
                report={report}
                neighborhoodSlug={slug!}
                metrics={metrics}
                topLanguages={topLanguages}
                inline
              />
            </div>
          </div>
        )}

        {/* Bottom actions — hidden when printing */}
        {report && (
          <div className="print:hidden mt-6 flex items-center justify-between">
            <Link to="/" className="text-sm text-blue-600 hover:text-blue-800 underline">
              {t('flyer.backToHome')}
            </Link>
            <button
              type="button"
              onClick={handlePrint}
              className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              {t('flyer.print')}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
