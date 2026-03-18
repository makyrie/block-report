import { useRef, useEffect } from 'react';
import type { CitywideCommunity } from '../../types';
import { useLanguage } from '../../i18n/context';

// Same color scale as choropleth
function scoreToColor(score: number): string {
  if (score <= 20) return '#fee5d9';
  if (score <= 40) return '#fcae91';
  if (score <= 60) return '#fb6a4a';
  if (score <= 80) return '#de2d26';
  return '#a50f15';
}

// Normalize for comparison
function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Convert UPPERCASE community name to title case for display
function titleCase(name: string): string {
  return name
    .toLowerCase()
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

interface CitywideRankingProps {
  ranking: CitywideCommunity[];
  hoveredCommunity: string | null;
  onHoverCommunity: (community: string | null) => void;
  onClickCommunity: (community: string) => void;
}

export default function CitywideRanking({
  ranking,
  hoveredCommunity,
  onHoverCommunity,
  onClickCommunity,
}: CitywideRankingProps) {
  const { t } = useLanguage();
  const listRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  // Auto-scroll to hovered community (from map hover)
  useEffect(() => {
    if (!hoveredCommunity || !listRef.current) return;
    const el = rowRefs.current.get(norm(hoveredCommunity));
    if (el) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [hoveredCommunity]);

  return (
    <div ref={listRef} className="overflow-y-auto h-full">
      {/* Column headers */}
      <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-3 text-xs font-semibold text-gray-500 uppercase tracking-wide z-10">
        <span className="w-8 text-center shrink-0">#</span>
        <span className="flex-1">{t('citywide.community')}</span>
        <span className="w-12 text-right shrink-0">{t('citywide.score')}</span>
      </div>

      {/* Rows */}
      <div role="list" aria-label={t('citywide.title')}>
        {ranking.map((entry) => {
          const isHovered = hoveredCommunity && norm(hoveredCommunity) === norm(entry.community);
          const displayName = titleCase(entry.community);
          return (
            <button
              key={entry.community}
              ref={(el) => {
                if (el) rowRefs.current.set(norm(entry.community), el);
              }}
              role="listitem"
              type="button"
              onClick={() => onClickCommunity(entry.community)}
              onMouseEnter={() => onHoverCommunity(entry.community)}
              onMouseLeave={() => onHoverCommunity(null)}
              onFocus={() => onHoverCommunity(entry.community)}
              onBlur={() => onHoverCommunity(null)}
              className={`w-full text-left px-4 py-3 flex items-center gap-3 border-b border-gray-100 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${
                isHovered ? 'bg-blue-50' : 'hover:bg-gray-50'
              }`}
            >
              {/* Rank */}
              <span className="w-8 text-center shrink-0 text-sm font-bold text-gray-700">
                {entry.rank}
              </span>

              {/* Color swatch + name + badges */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-sm shrink-0"
                    style={{ backgroundColor: scoreToColor(entry.accessGapScore) }}
                    aria-hidden="true"
                  />
                  <span className="text-sm font-medium text-gray-900 truncate">
                    {displayName}
                  </span>
                  {entry.accessGapScore >= 50 && (
                    <span className="text-[10px] font-semibold text-red-700 bg-red-50 px-1.5 py-0.5 rounded shrink-0">
                      {t('citywide.highGap')}
                    </span>
                  )}
                </div>
                {entry.topFactors.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {entry.topFactors.map((factor) => (
                      <span
                        key={factor}
                        className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded"
                      >
                        {factor}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Score */}
              <span className="w-12 text-right shrink-0 text-sm font-bold text-gray-800">
                {entry.accessGapScore}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
