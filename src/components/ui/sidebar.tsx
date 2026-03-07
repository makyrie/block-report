import { useState } from 'react';
import type { NeighborhoodProfile, CommunityBrief } from '../../types';
import BriefDisplay from '../brief/brief-display';
import { useLanguage } from '../../i18n/context';
import { SUPPORTED_LANGUAGES, DEMOGRAPHICS_TO_LANG } from '../../i18n/translations';

interface SidebarProps {
  community: string | null;
  metrics: NeighborhoodProfile['metrics'] | null;
  loading: boolean;
  onGenerateBrief: (language: string) => void;
  brief: CommunityBrief | null;
  briefLoading: boolean;
  briefError: string | null;
  topLanguages?: { language: string; percentage: number }[];
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
  topLanguages,
}: SidebarProps) {
  const [showDetails, setShowDetails] = useState(false);
  const { t, briefLang, setBriefLang } = useLanguage();

  // Find the top non-English language for this neighborhood
  const suggestedLang = topLanguages
    ?.filter((l) => l.language !== 'English' && l.percentage > 5)
    ?.[0];

  const suggestedLangCode = suggestedLang ? DEMOGRAPHICS_TO_LANG[suggestedLang.language] : undefined;
  const suggestedLangMeta = suggestedLangCode
    ? SUPPORTED_LANGUAGES.find((l) => l.code === suggestedLangCode)
    : undefined;

  if (!community) {
    return (
      <div className="p-4 text-gray-500 text-sm">
        <p>{t('sidebar.selectPrompt')}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-4">
        <h1 className="text-lg font-semibold mb-2">{community}</h1>
        <LoadingSpinner label={t('loading.data', { community })} />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-5" aria-live="polite" aria-atomic="false">
      <h1 className="text-lg font-semibold">{community}</h1>

      {metrics && (
        <>
          {/* Narrative summary */}
          <section aria-labelledby="summary-heading">
            <h2 id="summary-heading" className="sr-only">{t('sidebar.neighborhoodSummary')}</h2>
            <p className="text-sm text-gray-700 mb-1">
              {t('sidebar.requestsSummary', { count: metrics.totalRequests311.toLocaleString() })}
            </p>
            {metrics.requestsPer1000Residents != null && metrics.population > 0 && (
              <p className="text-sm text-gray-600 mb-3">
                Residents here report about <span className="font-semibold">{metrics.requestsPer1000Residents}</span> issues per 1,000 people.
              </p>
            )}
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
              {showDetails ? t('sidebar.hideDetails') : t('sidebar.showDetails')}
            </button>

            {showDetails && (
              <dl className="mt-2 rounded-lg bg-gray-50 p-3 text-xs space-y-1.5">
                <div className="flex justify-between">
                  <dt className="text-gray-500">{t('sidebar.requests311')}</dt>
                  <dd className="font-mono font-medium">{metrics.totalRequests311.toLocaleString()}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">{t('sidebar.resolutionRate')}</dt>
                  <dd className="font-mono font-medium">{(metrics.resolutionRate * 100).toFixed(1)}%</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">{t('sidebar.avgDays')}</dt>
                  <dd className="font-mono font-medium">{metrics.avgDaysToResolve.toFixed(1)}</dd>
                </div>
                {metrics.population > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Est. population</dt>
                    <dd className="font-mono font-medium">{metrics.population.toLocaleString()}</dd>
                  </div>
                )}
                {metrics.requestsPer1000Residents != null && (
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Requests per 1,000</dt>
                    <dd className="font-mono font-medium">{metrics.requestsPer1000Residents}</dd>
                  </div>
                )}
              </dl>
            )}
          </section>

          {/* Top issues — visual bars */}
          {metrics.topIssues.length > 0 && (
            <section aria-labelledby="issues-heading">
              <h2 id="issues-heading" className="text-sm font-medium text-gray-700 mb-2">
                {t('sidebar.topIssues')}
              </h2>
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
              <h2 id="resolved-heading" className="text-sm font-medium text-gray-700 mb-2">
                {t('sidebar.recentlyResolved')}
              </h2>
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

          {/* Language suggestion based on demographics */}
          {suggestedLangMeta && briefLang === 'English' && (
            <div className="rounded-lg bg-blue-50 border border-blue-200 p-3">
              <p className="text-sm text-blue-800 mb-2">
                {t('sidebar.languageSuggestion', { language: suggestedLang!.language })}
              </p>
              <button
                type="button"
                onClick={() => {
                  setBriefLang(suggestedLangMeta.label);
                  onGenerateBrief(suggestedLangMeta.label);
                }}
                disabled={briefLoading}
                className="w-full rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              >
                {t('sidebar.generateIn', { language: suggestedLangMeta.nativeLabel })}
              </button>
            </div>
          )}

          {/* Brief language selector — visible buttons, not a dropdown */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">{t('sidebar.briefLanguage')}</p>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('sidebar.briefLanguage')}>
              {SUPPORTED_LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  role="radio"
                  aria-checked={briefLang === l.label}
                  onClick={() => setBriefLang(l.label)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                    briefLang === l.label
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {l.nativeLabel}
                </button>
              ))}
            </div>
          </div>

          {/* Generate brief */}
          <button
            type="button"
            onClick={() => onGenerateBrief(briefLang)}
            disabled={briefLoading}
            aria-busy={briefLoading}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            {briefLoading ? t('sidebar.generating') : t('sidebar.generateBrief')}
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
