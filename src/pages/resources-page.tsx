import { useState, useEffect } from 'react';
import { getLibraries, getRecCenters } from '../api/client';
import type { CommunityAnchor } from '../types';

export default function ResourcesPage() {
  const [libraries, setLibraries] = useState<CommunityAnchor[]>([]);
  const [recCenters, setRecCenters] = useState<CommunityAnchor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getLibraries(), getRecCenters()])
      .then(([libs, recs]) => {
        setLibraries(libs);
        setRecCenters(recs);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div id="main-content" className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Community Resources</h1>
        <p className="text-gray-600 mb-8">
          Libraries, recreation centers, and civic essentials across San Diego.
        </p>

        {loading ? (
          <p className="text-gray-500">Loading resources...</p>
        ) : (
          <div className="space-y-10">
            <section>
              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                Libraries ({libraries.length})
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {libraries.map((lib) => (
                  <div key={lib.id} className="p-4 bg-white border border-gray-200 rounded-lg">
                    <p className="font-medium text-gray-900">{lib.name}</p>
                    {lib.address && <p className="text-sm text-gray-500 mt-1">{lib.address}</p>}
                    {lib.community && (
                      <p className="text-xs text-gray-400 mt-1">{lib.community}</p>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                Recreation Centers ({recCenters.length})
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {recCenters.map((rc) => (
                  <div key={rc.id} className="p-4 bg-white border border-gray-200 rounded-lg">
                    <p className="font-medium text-gray-900">{rc.name}</p>
                    {rc.address && <p className="text-sm text-gray-500 mt-1">{rc.address}</p>}
                    {rc.community && (
                      <p className="text-xs text-gray-400 mt-1">{rc.community}</p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
