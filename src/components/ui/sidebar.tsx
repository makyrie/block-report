import type { NeighborhoodProfile, CommunityBrief } from '../../types';
import { BriefDisplay } from '../brief/brief-display';

interface SidebarProps {
  community: string | null;
  metrics: NeighborhoodProfile['metrics'] | null;
  loading: boolean;
  onGenerateBrief: () => void;
  brief: CommunityBrief | null;
  briefLoading: boolean;
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-8">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
    </div>
  );
}

export default function Sidebar({
  community,
  metrics,
  loading,
  onGenerateBrief,
  brief,
  briefLoading,
}: SidebarProps) {
  if (!community) {
    return (
      <div className="p-4 text-gray-500 text-sm">
        <p>
          Select a neighborhood from the dropdown above, or click a library or
          rec center marker on the map to view its community profile.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-4">
        <h2 className="text-lg font-semibold mb-2">{community}</h2>
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-lg font-semibold">{community}</h2>

      {metrics && (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded bg-gray-50 p-3">
              <p className="text-xs text-gray-500 uppercase tracking-wide">311 Requests</p>
              <p className="text-xl font-bold">{metrics.totalRequests311.toLocaleString()}</p>
            </div>
            <div className="rounded bg-gray-50 p-3">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Resolution Rate</p>
              <p className="text-xl font-bold">{(metrics.resolutionRate * 100).toFixed(1)}%</p>
            </div>
            <div className="col-span-2 rounded bg-gray-50 p-3">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Avg Days to Resolve</p>
              <p className="text-xl font-bold">{metrics.avgDaysToResolve.toFixed(1)}</p>
            </div>
          </div>

          {/* Top issues */}
          {metrics.topIssues.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Top Issues</h3>
              <ul className="space-y-1">
                {metrics.topIssues.map((issue) => (
                  <li
                    key={issue.category}
                    className="flex items-center justify-between rounded bg-gray-50 px-3 py-1.5 text-sm"
                  >
                    <span>{issue.category}</span>
                    <span className="font-mono text-xs text-gray-500">{issue.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Recently resolved */}
          {metrics.recentlyResolved.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Recently Resolved</h3>
              <ul className="space-y-1 text-sm text-gray-600">
                {metrics.recentlyResolved.map((item, i) => (
                  <li key={`${item.category}-${item.date}-${i}`} className="flex justify-between">
                    <span>{item.category}</span>
                    <span className="text-xs text-gray-400">{item.date}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Generate brief button */}
          <button
            type="button"
            onClick={onGenerateBrief}
            disabled={briefLoading}
            className="w-full rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {briefLoading ? 'Generating...' : 'Generate Brief'}
          </button>
        </>
      )}

      <BriefDisplay brief={brief} loading={briefLoading} />
    </div>
  );
}
