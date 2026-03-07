import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { COMMUNITIES } from '../components/ui/neighborhood-selector';
import { toSlug } from '../utils/slug';

const QUESTION_TILES = [
  {
    icon: '📋',
    question: 'What are people reporting near me?',
    description: 'See the top 311 service requests in your neighborhood — from potholes to graffiti.',
    sample: 'Mira Mesa',
  },
  {
    icon: '⏱️',
    question: 'How fast does the city respond?',
    description: 'Find out the average days to resolve issues and the resolution rate in your area.',
    sample: 'North Park',
  },
  {
    icon: '🏛️',
    question: 'What resources are nearby?',
    description: 'Discover libraries, rec centers, and transit stops close to your neighborhood.',
    sample: 'City Heights',
  },
  {
    icon: '🖨️',
    question: 'Get a printable community brief',
    description: 'Generate a one-page brief in plain language — ready to post at a library or laundromat.',
    sample: 'Barrio Logan',
  },
];

export default function WelcomePage() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState('');

  function goToNeighborhood(name: string) {
    if (name) navigate(`/neighborhood/${toSlug(name)}`);
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-50 flex flex-col">
      <main id="main-content" className="flex-1 px-4 py-8 max-w-2xl mx-auto w-full">

        {/* Hero */}
        <section aria-labelledby="hero-heading" className="text-center mb-8">
          <h2 id="hero-heading" className="text-2xl font-bold text-gray-900 mb-3 leading-snug">
            What's happening in your<br className="hidden sm:inline" /> San Diego neighborhood?
          </h2>
          <p className="text-gray-600 text-sm mb-6 max-w-md mx-auto">
            Block Report turns city open data into plain-language community profiles —
            and printable briefs you can share where neighbors gather.
          </p>

          {/* Neighborhood picker */}
          <div className="flex gap-2 max-w-sm mx-auto">
            <div className="flex-1">
              <label htmlFor="welcome-neighborhood-select" className="sr-only">
                Select a neighborhood
              </label>
              <select
                id="welcome-neighborhood-select"
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Pick a neighborhood...</option>
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
              Go
            </button>
          </div>
        </section>

        {/* Question tiles */}
        <section aria-labelledby="explore-heading" className="mb-10">
          <h2 id="explore-heading" className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            What you can discover
          </h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3" role="list">
            {QUESTION_TILES.map((tile) => (
              <li key={tile.question}>
                <button
                  type="button"
                  onClick={() => goToNeighborhood(tile.sample)}
                  className="w-full text-left rounded-xl border border-gray-200 bg-white p-4 hover:border-blue-300 hover:shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <span className="text-xl mb-2 block" aria-hidden="true">{tile.icon}</span>
                  <span className="font-medium text-gray-900 text-sm block mb-1">{tile.question}</span>
                  <span className="text-xs text-gray-500">{tile.description}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* A-Z neighborhood list */}
        <section aria-labelledby="browse-heading">
          <h2 id="browse-heading" className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Browse all neighborhoods
          </h2>
          <nav aria-label="Neighborhood directory">
            <ul className="flex flex-wrap gap-2" role="list">
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
        Data from{' '}
        <a href="https://data.sandiego.gov" className="underline hover:text-gray-600" target="_blank" rel="noreferrer">
          data.sandiego.gov
        </a>{' '}
        &amp; U.S. Census Bureau
      </footer>
    </div>
  );
}
