import type { Block311Report, BlockMetrics, CommunityAnchor, Permit } from '../../types';

// ── Shared type badge ────────────────────────────────────────────────────────

type TypeConfig = {
  dot: string;   // Tailwind bg color — must match legend
  label: string;
  text: string;  // text color for label
};

const TYPE_CONFIG: Record<'library' | 'rec_center' | 'transit' | 'permit', TypeConfig> = {
  library:    { dot: 'bg-blue-500',  label: 'Library',      text: 'text-blue-700'  },
  rec_center: { dot: 'bg-green-500', label: 'Rec Center',   text: 'text-green-700' },
  transit:    { dot: 'bg-violet-600', label: 'Transit Stop', text: 'text-violet-700' },
  permit:     { dot: 'bg-amber-500', label: 'Permit',       text: 'text-amber-700' },
};

function TypeBadge({ type }: { type: keyof typeof TYPE_CONFIG }) {
  const { dot, label, text } = TYPE_CONFIG[type];
  return (
    <div className="flex items-center gap-1.5 mb-2">
      <span aria-hidden="true" className={`w-2.5 h-2.5 rounded-full shrink-0 ${dot}`} />
      <span className={`text-xs font-semibold uppercase tracking-wide ${text}`}>{label}</span>
    </div>
  );
}

// ── Popup components ─────────────────────────────────────────────────────────

export function AnchorPopupContent({ anchor }: { anchor: CommunityAnchor }) {
  const type = anchor.type === 'library' ? 'library' : 'rec_center';
  return (
    <div className="min-w-[200px] max-w-[260px]">
      <TypeBadge type={type} />
      <p className="font-semibold text-gray-900 text-sm leading-snug mb-1.5">{anchor.name}</p>
      {anchor.address && (
        <p className="text-xs text-gray-600 flex items-start gap-1 mb-1">
          <span aria-hidden="true" className="mt-px shrink-0">📍</span>
          <span>{anchor.address}</span>
        </p>
      )}
      {anchor.community && (
        <p className="text-xs text-gray-500 mb-1">
          <span className="font-medium">Neighborhood:</span> {anchor.community}
        </p>
      )}
      {anchor.phone && (
        <p className="text-xs mt-1">
          <a
            href={`tel:${anchor.phone.replace(/[^\d+\-() ]/g, '')}`}
            className="text-blue-600 hover:underline"
            aria-label={`Call ${anchor.name} at ${anchor.phone}`}
          >
            📞 {anchor.phone}
          </a>
        </p>
      )}
      {anchor.website && /^https?:\/\//i.test(anchor.website) && (
        <p className="text-xs mt-0.5">
          <a
            href={anchor.website}
            target="_blank"
            rel="noreferrer"
            className="text-blue-600 hover:underline"
            aria-label={`Visit ${anchor.name} website (opens in new tab)`}
          >
            🌐 Website ↗
          </a>
        </p>
      )}
    </div>
  );
}

export function TransitPopupContent({ name }: { name: string }) {
  return (
    <div className="min-w-[160px] max-w-[240px]">
      <TypeBadge type="transit" />
      <p className="font-semibold text-gray-900 text-sm leading-snug">{name}</p>
    </div>
  );
}

export function PermitPopupContent({ permit }: { permit: Permit }) {
  return (
    <div className="min-w-[200px] max-w-[260px]">
      <TypeBadge type="permit" />
      {permit.permit_type && (
        <p className="font-semibold text-gray-900 text-sm leading-snug mb-1">{permit.permit_type}</p>
      )}
      {permit.description && (
        <p className="text-xs text-gray-600 mb-1.5 line-clamp-3">{permit.description}</p>
      )}
      {permit.street_address && (
        <p className="text-xs text-gray-600 flex items-start gap-1 mb-1">
          <span aria-hidden="true" className="mt-px shrink-0">📍</span>
          <span>{permit.street_address}</span>
        </p>
      )}
      {permit.date_issued && (
        <p className="text-xs text-gray-500">
          Issued: {new Date(permit.date_issued).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </p>
      )}
      {permit.status && (
        <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
          {permit.status}
        </span>
      )}
    </div>
  );
}

export function BlockPopupContent({
  loading,
  data,
}: {
  loading: boolean;
  data: BlockMetrics | null;
}) {
  if (loading) {
    return (
      <div className="min-w-[200px] flex items-center gap-2 py-2">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-orange-500 shrink-0" />
        <span className="text-sm text-gray-600">Loading block data…</span>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="min-w-[200px] text-sm text-gray-500 py-1">No data available.</div>
    );
  }
  const resRate = data.totalReports > 0 ? data.resolutionRate : 0;
  const resColor = resRate >= 0.75 ? 'text-green-700' : resRate >= 0.5 ? 'text-yellow-700' : 'text-red-700';

  return (
    <div className="min-w-[220px] max-w-[300px]">
      <div className="flex items-center gap-1.5 mb-2">
        <span aria-hidden="true" className="w-2.5 h-2.5 rounded-full shrink-0 bg-orange-500" />
        <span className="text-xs font-semibold uppercase tracking-wide text-orange-700">
          Your Block · {data.radiusMiles} mi radius
        </span>
      </div>
      <div className="flex gap-3 mb-2">
        <div className="text-center">
          <p className="text-xl font-bold text-gray-900">{data.openCount}</p>
          <p className="text-xs text-gray-500">open</p>
        </div>
        <div className="text-center">
          <p className="text-xl font-bold text-gray-900">{data.resolvedCount}</p>
          <p className="text-xs text-gray-500">resolved</p>
        </div>
        {data.referredCount > 0 && (
          <div className="text-center">
            <p className="text-xl font-bold text-gray-900">{data.referredCount}</p>
            <p className="text-xs text-gray-500">referred</p>
          </div>
        )}
        <div className="text-center">
          <p className="text-xl font-bold text-gray-900">{data.totalReports}</p>
          <p className="text-xs text-gray-500">total</p>
        </div>
      </div>
      <div className="flex gap-3 text-xs mb-3">
        <span className={`font-medium ${resColor}`}>
          {(resRate * 100).toFixed(0)}% resolved
        </span>
        {data.avgDaysToResolve != null && (
          <span className="text-gray-500">
            ~{data.avgDaysToResolve} days avg
          </span>
        )}
      </div>
      {data.topIssues.length > 0 && (
        <div className="mb-2">
          <p className="text-xs font-medium text-gray-700 mb-1">Top issues nearby</p>
          <ul className="space-y-1">
            {data.topIssues.slice(0, 4).map((issue) => (
              <li key={issue.category} className="text-xs text-gray-600 flex justify-between gap-2">
                <span className="truncate">{issue.category}</span>
                <span className="shrink-0 text-gray-400 font-mono">{issue.count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {data.recentlyResolved.length > 0 && (
        <div className="mb-2">
          <p className="text-xs font-medium text-gray-700 mb-1">Recently resolved</p>
          <ul className="space-y-0.5">
            {data.recentlyResolved.map((r, i) => (
              <li key={`${r.category}-${r.date}-${i}`} className="text-xs text-gray-600 flex justify-between gap-2">
                <span className="truncate">{r.category}</span>
                <span className="shrink-0 text-gray-400">
                  {new Date(r.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {data.totalReports > 0 && (
        <p className="text-xs text-gray-400 italic mb-1">Click markers to see individual reports</p>
      )}
      <button
        type="button"
        onClick={() => window.print()}
        className="w-full mt-1 rounded bg-orange-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-600"
      >
        Print flyer for this area
      </button>
    </div>
  );
}

// ── 311 report status colors ─────────────────────────────────────────────────

export const STATUS_COLORS = {
  open: '#ef4444',
  resolved: '#22c55e',
  referred: '#9ca3af',
} as const;

const STATUS_DETAILS: Record<'open' | 'resolved' | 'referred', { color: string; label: string }> = {
  open: { color: STATUS_COLORS.open, label: 'Open' },
  resolved: { color: STATUS_COLORS.resolved, label: 'Resolved' },
  referred: { color: STATUS_COLORS.referred, label: 'Referred' },
};

export function reportStatus(statusCategory: 'open' | 'resolved' | 'referred'): { color: string; label: string } {
  return STATUS_DETAILS[statusCategory];
}

export function ReportPopupContent({ report }: { report: Block311Report }) {
  const { color, label } = reportStatus(report.statusCategory);
  const dateStr = report.dateRequested
    ? new Date(report.dateRequested).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'Unknown';
  const closedStr = report.dateClosed
    ? new Date(report.dateClosed).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <div className="min-w-[180px] max-w-[260px]">
      <div className="flex items-center gap-1.5 mb-1.5">
        <span
          aria-hidden="true"
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ backgroundColor: color }}
        />
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color }}>
          {label}
        </span>
      </div>
      <p className="font-semibold text-gray-900 text-sm leading-snug mb-1">{report.category}</p>
      {report.categoryDetail && (
        <p className="text-xs text-gray-500 mb-1">{report.categoryDetail}</p>
      )}
      <p className="text-xs text-gray-600 mb-0.5">Reported: {dateStr}</p>
      {closedStr && (
        <p className="text-xs text-gray-600 mb-0.5">Resolved: {closedStr}</p>
      )}
      {report.address && (
        <p className="text-xs text-gray-500 mt-1 flex items-start gap-1">
          <span aria-hidden="true" className="mt-px shrink-0">📍</span>
          <span>{report.address}</span>
        </p>
      )}
    </div>
  );
}
