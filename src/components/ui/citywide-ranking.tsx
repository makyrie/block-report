import { useRef, useEffect, memo, useCallback } from 'react';
import type { CitywideCommunity } from '../../types';
import { useLanguage } from '../../i18n/context';
import { scoreToColor, norm, titleCase } from '../../utils/community';

const VALID_FACTORS = new Set(['factor.lowEngagement', 'factor.lowTransit', 'factor.highNonEnglish']);

interface RankingRowProps {
  entry: CitywideCommunity;
  isHovered: boolean;
  onHoverCommunity: (community: string | null) => void;
  onClickCommunity: (community: string) => void;
  rowRef: (el: HTMLButtonElement | null) => void;
}

const RankingRow = memo(function RankingRow({
  entry,
  isHovered,
  onHoverCommunity,
  onClickCommunity,
  rowRef,
}: RankingRowProps) {
  const { t } = useLanguage();
  const displayName = titleCase(entry.community);
  const validFactors = entry.topFactors.filter((f) => VALID_FACTORS.has(f));

  return (
    <li className="m-0 p-0">
      <button
        ref={rowRef}
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
          {validFactors.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {validFactors.map((factor) => (
                <span
                  key={factor}
                  className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded"
                >
                  {t(factor)}
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
    </li>
  );
});

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

  const makeRowRef = useCallback(
    (community: string) => (el: HTMLButtonElement | null) => {
      const key = norm(community);
      if (el) rowRefs.current.set(key, el);
      else rowRefs.current.delete(key);
    },
    [],
  );

  // Auto-scroll to hovered community (from map hover), debounced to prevent jitter
  useEffect(() => {
    if (!hoveredCommunity || !listRef.current) return;
    const timer = setTimeout(() => {
      const el = rowRefs.current.get(norm(hoveredCommunity));
      if (el) {
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }, 150);
    return () => clearTimeout(timer);
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
      <ul aria-label={t('citywide.title')} className="list-none m-0 p-0">
        {ranking.map((entry) => {
          const isHovered = !!hoveredCommunity && norm(hoveredCommunity) === norm(entry.community);
          return (
            <RankingRow
              key={entry.community}
              entry={entry}
              isHovered={isHovered}
              onHoverCommunity={onHoverCommunity}
              onClickCommunity={onClickCommunity}
              rowRef={makeRowRef(entry.community)}
            />
          );
        })}
      </ul>
    </div>
  );
}
