import type { BlockMetrics, NeighborhoodProfile } from '../../types';
import { generateComparisons } from '../../utils/scale-comparisons';
import type { ScaleComparison } from '../../utils/scale-comparisons';

interface DualScaleViewProps {
  blockData: BlockMetrics;
  blockRadius: number;
  communityName: string;
  metrics: NeighborhoodProfile['metrics'];
}

function StatCard({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="flex-1 rounded-lg bg-orange-50 border border-orange-200 p-2.5 text-center min-w-0">
      <div className="text-xl font-bold text-orange-700">{value}</div>
      <div className="text-xs text-orange-600 truncate">{label}</div>
    </div>
  );
}

const calloutStyles: Record<ScaleComparison['type'], string> = {
  insight: 'bg-blue-50 border-blue-200 text-blue-800',
  'good-news': 'bg-green-50 border-green-200 text-green-800',
  concern: 'bg-amber-50 border-amber-200 text-amber-800',
};

const calloutDot: Record<ScaleComparison['type'], string> = {
  insight: 'bg-blue-400',
  'good-news': 'bg-green-400',
  concern: 'bg-amber-400',
};

export default function DualScaleView({ blockData, blockRadius, communityName, metrics }: DualScaleViewProps) {
  const comparisons = generateComparisons(blockData, metrics, communityName);

  return (
    <section aria-labelledby="dual-scale-heading" className="space-y-3">
      {/* Block-level header */}
      <div>
        <h2 id="dual-scale-heading" className="text-sm font-semibold text-orange-800">
          Around Your Pin
        </h2>
        <p className="text-xs text-orange-600">{blockRadius} mi radius</p>
      </div>

      {/* Stat cards */}
      {blockData.totalRequests === 0 ? (
        <p className="text-sm text-gray-500 italic">
          No reports found within {blockRadius} mi. Try a larger radius.
        </p>
      ) : (
        <>
          <div className="flex gap-2" role="group" aria-label="Block-level statistics">
            <StatCard value={blockData.openCount} label="Open" />
            <StatCard value={blockData.resolvedCount} label="Resolved" />
            <StatCard value={`${Math.round(blockData.resolutionRate * 100)}%`} label="Resolution" />
          </div>

          {/* Top issues (compact) */}
          {blockData.topIssues.length > 0 && (
            <p className="text-xs text-gray-600">
              <span className="font-medium text-gray-700">Top issues:</span>{' '}
              {blockData.topIssues.slice(0, 3).map((issue, i) => (
                <span key={issue.category}>
                  {issue.category} ({issue.count}){i < Math.min(blockData.topIssues.length, 3) - 1 ? ', ' : ''}
                </span>
              ))}
            </p>
          )}
        </>
      )}

      {/* Comparison callouts */}
      {comparisons.length > 0 && (
        <div className="space-y-2" role="region" aria-label="Block vs neighborhood comparisons">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Comparisons
          </h3>
          <ul className="space-y-1.5">
            {comparisons.map((comparison, i) => (
              <li
                key={i}
                className={`flex items-start gap-2 rounded-md border p-2 text-sm ${calloutStyles[comparison.type]}`}
              >
                <span
                  aria-hidden="true"
                  className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${calloutDot[comparison.type]}`}
                />
                <span>{comparison.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
