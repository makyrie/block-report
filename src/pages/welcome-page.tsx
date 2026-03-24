import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { COMMUNITIES } from '../types/communities';
import { toSlug } from '../utils/slug';
import { useLanguage } from '../i18n/context';
import { SUPPORTED_LANGUAGES } from '../i18n/translations';
import { lookupZip } from '../data/zip-to-neighborhoods';

const QUESTION_TILES = [
  { icon: '\ud83d\udccb', qKey: 'tile.q1', descKey: 'tile.q1desc' },
  { icon: '\u23f1\ufe0f', qKey: 'tile.q2', descKey: 'tile.q2desc' },
  { icon: '\ud83c\udfdb\ufe0f', qKey: 'tile.q3', descKey: 'tile.q3desc' },
  { icon: '\ud83d\udda8\ufe0f', qKey: 'tile.q4', descKey: 'tile.q4desc' },
];

export default function WelcomePage() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState('');
  const [zip, setZip] = useState('');
  const [zipResults, setZipResults] = useState<string[] | null>(null);
  const { lang, setLang, t } = useLanguage();

  function goToNeighborhood(name: string) {
    if (name) navigate(`/neighborhood/${toSlug(name)}`);
  }

  function handleZipLookup() {
    const results = lookupZip(zip);
    if (results === null) return; // invalid format — input validation prevents this
    if (results.length === 1) {
      goToNeighborhood(results[0]);
    } else {
      setZipResults(results); // 0 = not found, 2+ = let user pick
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-50 flex flex-col">
      <main id="main-content" className="flex-1 px-4 py-8 max-w-2xl mx-auto w-full">

        {/* Language selector — visible within first 3 seconds */}
        <section aria-labelledby="lang-heading" className="mb-6">
          <h2 id="lang-heading" className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 text-center">
            {t('welcome.chooseLanguage')}
          </h2>
          <div className="flex flex-wrap justify-center gap-2" role="radiogroup" aria-label={t('welcome.chooseLanguage')}>
            {SUPPORTED_LANGUAGES.map((l) => (
              <button
                key={l.code}
                type="button"
                role="radio"
                aria-checked={lang === l.code}
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
        </section>

        {/* Hero */}
        <section aria-labelledby="hero-heading" className="text-center mb-8">
          <h1 id="hero-heading" className="text-2xl font-bold text-gray-900 mb-3 leading-snug">
            {t('welcome.heading')}
          </h1>
          <p className="text-gray-600 text-sm mb-6 max-w-md mx-auto">
            {t('welcome.subheading')}
          </p>

          {/* Neighborhood picker */}
          <div className="flex gap-2 max-w-sm mx-auto">
            <div className="flex-1">
              <label htmlFor="welcome-neighborhood-select" className="sr-only">
                {t('welcome.pickNeighborhood')}
              </label>
              <select
                id="welcome-neighborhood-select"
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">{t('welcome.pickNeighborhood')}</option>
                {COMMUNITIES.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => goToNeighborhood(selected)}
              disabled={!selected}
              className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 shrink-0"
            >
              {t('welcome.go')}
            </button>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3 max-w-sm mx-auto mt-4">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400">{t('welcome.orZip')}</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {/* Zip code lookup */}
          <div className="flex gap-2 max-w-sm mx-auto mt-4">
            <div className="flex-1">
              <label htmlFor="zip-input" className="sr-only">San Diego zip code</label>
              <input
                id="zip-input"
                type="text"
                inputMode="numeric"
                pattern="\d{5}"
                maxLength={5}
                placeholder="e.g. 92126"
                value={zip}
                onChange={(e) => {
                  setZip(e.target.value.replace(/\D/g, '').slice(0, 5));
                  setZipResults(null);
                }}
                onKeyDown={(e) => e.key === 'Enter' && zip.length === 5 && handleZipLookup()}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-describedby={zipResults !== null ? 'zip-results' : undefined}
              />
            </div>
            <button
              type="button"
              onClick={handleZipLookup}
              disabled={zip.length !== 5}
              className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 shrink-0"
            >
              {t('welcome.lookUp')}
            </button>
          </div>

          {/* Zip results */}
          {zipResults !== null && (
            <div id="zip-results" className="max-w-sm mx-auto mt-3" aria-live="polite">
              {zipResults.length === 0 ? (
                <p className="text-sm text-gray-500 text-center">
                  {t('welcome.noResults', { zip })}
                </p>
              ) : (
                <div>
                  <p className="text-xs text-gray-500 mb-2 text-center">
                    {t('welcome.zipCovers', { zip, count: String(zipResults.length) })}
                  </p>
                  <ul className="flex flex-col gap-1.5" role="list">
                    {zipResults.map((name) => (
                      <li key={name}>
                        <button
                          type="button"
                          onClick={() => goToNeighborhood(name)}
                          className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-800 hover:border-blue-400 hover:text-blue-700 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        >
                          {name}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Citywide comparison card */}
        <section aria-labelledby="citywide-heading" className="mb-4">
          <Link
            to="/citywide"
            className="block rounded-xl border-2 border-indigo-200 bg-indigo-50 p-5 hover:border-indigo-400 hover:bg-indigo-100 transition-colors group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <div className="flex items-start gap-4">
              <span className="text-3xl shrink-0" aria-hidden="true">{'\uD83D\uDDFA\uFE0F'}</span>
              <div>
                <h2 id="citywide-heading" className="text-base font-bold text-gray-900 mb-1 group-hover:text-indigo-800">
                  {t('citywide.cardTitle')}
                </h2>
                <p className="text-sm text-gray-600">
                  {t('citywide.cardDescription')}
                </p>
              </div>
            </div>
          </Link>
        </section>

        {/* Flyer shortcut card */}
        <section aria-labelledby="flyer-heading" className="mb-8">
          <Link
            to="/flyer"
            className="block rounded-xl border-2 border-blue-200 bg-blue-50 p-5 hover:border-blue-400 hover:bg-blue-100 transition-colors group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <div className="flex items-start gap-4">
              <span className="text-3xl shrink-0" aria-hidden="true">{'\uD83D\uDDA8\uFE0F'}</span>
              <div>
                <h2 id="flyer-heading" className="text-base font-bold text-gray-900 mb-1 group-hover:text-blue-800">
                  {t('flyer.cardTitle')}
                </h2>
                <p className="text-sm text-gray-600">
                  {t('flyer.cardDescription')}
                </p>
              </div>
            </div>
          </Link>
        </section>

        {/* Question tiles */}
        <section aria-labelledby="explore-heading" className="mb-10">
          <h2 id="explore-heading" className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            {t('welcome.explore')}
          </h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {QUESTION_TILES.map((tile) => (
              <li key={tile.qKey} className="rounded-xl border border-gray-200 bg-white p-4">
                <span className="text-xl mb-2 block" aria-hidden="true">{tile.icon}</span>
                <span className="font-medium text-gray-900 text-sm block mb-1">{t(tile.qKey)}</span>
                <span className="text-xs text-gray-500">{t(tile.descKey)}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* A-Z neighborhood list */}
        <section aria-labelledby="browse-heading">
          <h2 id="browse-heading" className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            {t('welcome.browseAll')}
          </h2>
          <nav aria-label="Neighborhood directory">
            <ul className="flex flex-wrap gap-2">
              {COMMUNITIES.map((name) => (
                <li key={name}>
                  <a
                    href={`/neighborhood/${toSlug(name)}`}
                    className="inline-block rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-700 hover:border-blue-400 hover:text-blue-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    {name}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </section>
      </main>

      <footer className="text-center text-xs text-gray-400 py-4 px-4">
        {t('footer.dataFrom')}{' '}
        <a href="https://data.sandiego.gov" className="underline hover:text-gray-600" target="_blank" rel="noreferrer">
          data.sandiego.gov
        </a>{' '}
        &amp; U.S. Census Bureau
      </footer>
    </div>
  );
}
