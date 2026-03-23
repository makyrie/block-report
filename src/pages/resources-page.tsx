import { useState, useEffect, useMemo } from 'react';
import { getLibraries, getRecCenters } from '../api/client';
import { useLanguage } from '../i18n/context';
import type { CommunityAnchor } from '../types';

function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url, 'https://placeholder.invalid');
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function ResourceCard({ resource }: { resource: CommunityAnchor }) {
  return (
    <div className="p-4 bg-white border border-gray-200 rounded-lg">
      <p className="font-medium text-gray-900">{resource.name}</p>
      {resource.address && (
        <p className="text-sm text-gray-500 mt-1">{resource.address}</p>
      )}
      {resource.phone && (
        <p className="text-sm text-gray-500 mt-1">
          <a href={`tel:${resource.phone}`} className="hover:text-blue-600">
            {resource.phone}
          </a>
        </p>
      )}
      {resource.website && isSafeUrl(resource.website) && (
        <p className="text-sm mt-1">
          <a
            href={resource.website}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            Visit website
          </a>
        </p>
      )}
      {resource.community && (
        <p className="text-xs text-gray-400 mt-1">{resource.community}</p>
      )}
    </div>
  );
}

export default function ResourcesPage() {
  const { t } = useLanguage();
  const [libraries, setLibraries] = useState<CommunityAnchor[]>([]);
  const [recCenters, setRecCenters] = useState<CommunityAnchor[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    Promise.all([getLibraries(), getRecCenters()])
      .then(([libs, recs]) => {
        setLibraries(libs);
        setRecCenters(recs);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const neighborhoods = useMemo(() => {
    const set = new Set<string>();
    for (const r of [...libraries, ...recCenters]) {
      if (r.community) set.add(r.community);
    }
    return Array.from(set).sort();
  }, [libraries, recCenters]);

  const filteredLibraries = filter
    ? libraries.filter((l) => l.community === filter)
    : libraries;
  const filteredRecCenters = filter
    ? recCenters.filter((r) => r.community === filter)
    : recCenters;

  return (
    <div id="main-content" className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          {t('resources.title') || 'Community Resources'}
        </h1>
        <p className="text-gray-600 mb-8">
          {t('resources.subtitle') ||
            'Libraries, recreation centers, and civic essentials across San Diego.'}
        </p>

        {/* Neighborhood filter */}
        {!loading && neighborhoods.length > 0 && (
          <div className="mb-8">
            <label htmlFor="neighborhood-filter" className="sr-only">
              Filter by neighborhood
            </label>
            <select
              id="neighborhood-filter"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">
                {t('resources.allNeighborhoods') || 'All neighborhoods'}
              </option>
              {neighborhoods.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        )}

        {loading ? (
          <p className="text-gray-500">Loading resources...</p>
        ) : (
          <div className="space-y-10">
            {/* Libraries */}
            <section>
              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                {t('resources.libraries') || 'Libraries'} ({filteredLibraries.length})
              </h2>
              {filteredLibraries.length === 0 ? (
                <p className="text-sm text-gray-500">
                  {t('resources.noResults') || 'No results for this neighborhood.'}
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {filteredLibraries.map((lib) => (
                    <ResourceCard key={lib.id} resource={lib} />
                  ))}
                </div>
              )}
            </section>

            {/* Recreation Centers */}
            <section>
              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                {t('resources.recCenters') || 'Recreation Centers'} ({filteredRecCenters.length})
              </h2>
              {filteredRecCenters.length === 0 ? (
                <p className="text-sm text-gray-500">
                  {t('resources.noResults') || 'No results for this neighborhood.'}
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {filteredRecCenters.map((rc) => (
                    <ResourceCard key={rc.id} resource={rc} />
                  ))}
                </div>
              )}
            </section>

            {/* Civic Essentials */}
            <section>
              <h2 className="text-xl font-semibold text-gray-800 mb-2">
                {t('resources.civicEssentials') || 'Civic Essentials'}
              </h2>
              <p className="text-gray-600 text-sm mb-6">
                {t('resources.civicIntro') ||
                  'Everything you need to engage with your city government.'}
              </p>

              <div className="space-y-6">
                {/* 311 / Get It Done */}
                <div className="bg-white border border-gray-200 rounded-lg p-5">
                  <h3 className="font-semibold text-gray-900 mb-2">
                    {t('resources.311Title') || 'Report an Issue: 311 / Get It Done'}
                  </h3>
                  <p className="text-sm text-gray-700 mb-3">
                    San Diego's 311 system (also called "Get It Done") lets you report potholes,
                    graffiti, illegal dumping, streetlight outages, and other neighborhood issues.
                    The city tracks every request and works to resolve it.
                  </p>
                  <ul className="text-sm text-gray-700 space-y-1 list-disc list-inside">
                    <li>
                      <strong>Phone:</strong>{' '}
                      <a href="tel:619-527-7500" className="text-blue-600 hover:underline">
                        619-527-7500
                      </a>{' '}
                      (or dial 311 from a San Diego phone)
                    </li>
                    <li>
                      <strong>App:</strong> Search "Get It Done SD" on{' '}
                      <a
                        href="https://apps.apple.com/us/app/get-it-done-sd/id1190425498"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        iOS
                      </a>{' '}
                      or{' '}
                      <a
                        href="https://play.google.com/store/apps/details?id=com.seeclickfix.sandiego.phone"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        Android
                      </a>
                    </li>
                    <li>
                      <strong>Web:</strong>{' '}
                      <a
                        href="https://www.sandiego.gov/get-it-done"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        sandiego.gov/get-it-done
                      </a>
                    </li>
                  </ul>
                </div>

                {/* Council District */}
                <div className="bg-white border border-gray-200 rounded-lg p-5">
                  <h3 className="font-semibold text-gray-900 mb-2">
                    {t('resources.councilTitle') || 'Find Your Council Representative'}
                  </h3>
                  <p className="text-sm text-gray-700 mb-3">
                    San Diego has 9 City Council districts. Your council member represents your
                    neighborhood at City Hall and votes on budgets, zoning, and local policy. You
                    can contact them with concerns.
                  </p>
                  <p className="text-sm text-gray-700">
                    <a
                      href="https://www.sandiego.gov/citycouncil"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      Find your council member at sandiego.gov/citycouncil
                    </a>
                  </p>
                </div>

                {/* Council Meetings */}
                <div className="bg-white border border-gray-200 rounded-lg p-5">
                  <h3 className="font-semibold text-gray-900 mb-2">
                    {t('resources.meetingsTitle') || 'Attend or Watch a Council Meeting'}
                  </h3>
                  <p className="text-sm text-gray-700 mb-3">
                    City Council meetings are open to the public. You can attend in person at City
                    Administration Building (202 C Street), watch live on the city's website, or
                    submit written comments in advance.
                  </p>
                  <ul className="text-sm text-gray-700 space-y-1 list-disc list-inside">
                    <li>
                      <a
                        href="https://www.sandiego.gov/city-clerk/officialdocs/council-agendas-minutes-videos"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        View agendas, minutes, and video
                      </a>
                    </li>
                    <li>
                      Public comment is typically allowed at the start of each meeting and on
                      individual agenda items.
                    </li>
                  </ul>
                </div>

                {/* Public Records */}
                <div className="bg-white border border-gray-200 rounded-lg p-5">
                  <h3 className="font-semibold text-gray-900 mb-2">
                    {t('resources.recordsTitle') || 'Make a Public Records Request'}
                  </h3>
                  <p className="text-sm text-gray-700 mb-3">
                    Under the California Public Records Act, you can request documents from the
                    city — budgets, contracts, emails, inspection reports, and more. San Diego uses
                    NextRequest to manage these.
                  </p>
                  <p className="text-sm text-gray-700">
                    <a
                      href="https://sandiego.nextrequest.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      Submit a request at sandiego.nextrequest.com
                    </a>
                  </p>
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
