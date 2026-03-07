import { useState } from 'react';
import type { NeighborhoodProfile, CommunityBrief } from '../../types';
import { BriefDisplay } from '../brief/brief-display';

interface SidebarProps {
  community: string | null;
  metrics: NeighborhoodProfile['metrics'] | null;
  loading: boolean;
  onGenerateBrief: () => void;
  brief: CommunityBrief | null;
  briefLoading: boolean;
  briefError: string | null;
}

function LoadingSpinner({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="flex items-center justify-center py-8">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

function Badge({ children, color }: { children: string; color: 'green' | 'yellow' | 'orange' | 'red' }) {
  const colors = {
    green: 'bg-green-100 text-green-800',
    yellow: 'bg-yellow-100 text-yellow-800',
    orange: 'bg-orange-100 text-orange-800',
    red: 'bg-red-100 text-red-800',
  };
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[color]}`}>
      {children}
    </span>
  );
}

function resolutionBadge(rate: number) {
  if (rate >= 0.75) return <Badge color="green">Most issues resolved</Badge>;
  if (rate >= 0.5)  return <Badge color="yellow">About half resolved</Badge>;
  return <Badge color="red">Many issues still open</Badge>;
}

function responseBadge(days: number) {
  if (days <= 7)  return <Badge color="green">Usually fixed in under a week</Badge>;
  if (days <= 21) return <Badge color="yellow">Typically takes a few weeks</Badge>;
  return <Badge color="orange">Can take over a month</Badge>;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

export default function Sidebar({
  community,
  metrics,
  loading,
  onGenerateBrief,
  brief,
  briefLoading,
  briefError,
}: SidebarProps) {
  const [showDetails, setShowDetails] = useState(false);

  if (!community) {
    return (
      <div className="p-4 text-gray-500 text-sm">
        <p>
          Select a neighborhood from the dropdown above, or click a library or
          rec center marker on the map to see what's happening there.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-4">
        <h2 className="text-lg font-semibold mb-2">{community}</h2>
        <LoadingSpinner label={`Loading data for ${community}`} />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-5" aria-live="polite" aria-atomic="false">
      <h2 className="text-lg font-semibold">{community}</h2>

      {metrics && (
        <>
          {/* Narrative summary */}
          <section aria-labelledby="summary-heading">
            <h3 id="summary-heading" className="sr-only">Neighborhood summary</h3>
            <p className="text-sm text-gray-700 mb-3">
              Neighbors filed{' '}
              <strong>{metrics.totalRequests311.toLocaleString()} service requests</strong>{' '}
              in the past year.
            </p>
            <div className="flex flex-wrap gap-2">
              {resolutionBadge(metrics.resolutionRate)}
              {responseBadge(metrics.avgDaysToResolve)}
            </div>

            {/* Progressive disclosure — raw numbers */}
            <button
              type="button"
              onClick={() => setShowDetails((v) => !v)}
              aria-expanded={showDetails}
              className="mt-2 text-xs text-blue-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
            >
              {showDetails ? 'Hide details' : 'Show data details'}
            </button>

            {showDetails && (
              <dl className="mt-2 rounded-lg bg-gray-50 p-3 text-xs space-y-1.5">
                <div className="flex justify-between">
                  <dt className="text-gray-500">Total requests</dt>
                  <dd className="font-mono font-medium">{metrics.totalRequests311.toLocaleString()}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Resolution rate</dt>
                  <dd className="font-mono font-medium">{(metrics.resolutionRate * 100).toFixed(1)}%</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Avg. days to resolve</dt>
                  <dd className="font-mono font-medium">{metrics.avgDaysToResolve.toFixed(1)}</dd>
                </div>
              </dl>
            )}
          </section>

          {/* Top issues — visual bars, no raw counts by default */}
          {metrics.topIssues.length > 0 && (
            <section aria-labelledby="issues-heading">
              <h3 id="issues-heading" className="text-sm font-medium text-gray-700 mb-2">
                What neighbors are reporting
              </h3>
              <ul className="space-y-2.5">
                {(() => {
                  const maxCount = metrics.topIssues[0].count;
                  return metrics.topIssues.slice(0, 6).map((issue) => (
                    <li key={issue.category}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-gray-700">{issue.category}</span>
                        {showDetails && (
                          <span className="text-xs text-gray-500 font-mono tabular-nums">{issue.count}</span>
                        )}
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full" role="presentation">
                        <div
                          className="h-1.5 bg-blue-400 rounded-full"
                          style={{ width: `${(issue.count / maxCount) * 100}%` }}
                        />
                      </div>
                    </li>
                  ));
                })()}
              </ul>
            </section>
          )}

          {/* Recently resolved */}
          {metrics.recentlyResolved.length > 0 && (
            <section aria-labelledby="resolved-heading">
              <h3 id="resolved-heading" className="text-sm font-medium text-gray-700 mb-2">
                Recently fixed
              </h3>
              <ul className="space-y-1 text-sm text-gray-600">
                {metrics.recentlyResolved.map((item, i) => (
                  <li key={`${item.category}-${item.date}-${i}`} className="flex justify-between gap-2">
                    <span className="truncate">{item.category}</span>
                    <span className="text-xs text-gray-500 shrink-0">{formatDate(item.date)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Generate brief */}
          <button
            type="button"
            onClick={onGenerateBrief}
            disabled={briefLoading}
            aria-busy={briefLoading}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            {briefLoading ? 'Generating…' : 'Generate printable brief'}
          </button>
        </>
      )}

      {briefError && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700" role="alert">
          {briefError}
        </div>
      )}

      <BriefDisplay brief={brief} loading={briefLoading} />
    </div>
  );
}
