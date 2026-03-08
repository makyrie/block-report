import { useState } from 'react';
import type { NeighborhoodProfile, CommunityReport } from '../../types';
import ReportView from '../report/report-view';
import { useLanguage } from '../../i18n/context';
import { SUPPORTED_LANGUAGES, DEMOGRAPHICS_TO_LANG } from '../../i18n/translations';

interface SidebarProps {
  community: string | null;
  metrics: NeighborhoodProfile['metrics'] | null;
  loading: boolean;
  onGenerateReport: (language: string) => void;
  report: CommunityReport | null;
  reportLoading: boolean;
  reportError: string | null;
  topLanguages?: { language: string; percentage: number }[];
  transitScore?: NeighborhoodProfile['transit'] | null;
  accessGap?: NeighborhoodProfile['accessGap'];
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
  onGenerateReport,
  report,
  reportLoading,
  reportError,
  topLanguages,
  transitScore,
  accessGap,
}: SidebarProps) {
  const [showDetails, setShowDetails] = useState(false);
  const { t, reportLang, setReportLang } = useLanguage();

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
                {transitScore && transitScore.stopCount > 0 && (
                  <>
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Transit stops</dt>
                      <dd className="font-mono font-medium">{transitScore.stopCount}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Transit score</dt>
                      <dd className="font-mono font-medium">{transitScore.transitScore}/100</dd>
                    </div>
                  </>
                )}
              </dl>
            )}
          </section>

          {/* Transit accessibility */}
          {transitScore && transitScore.stopCount > 0 && (
            <section aria-labelledby="transit-heading" className="rounded-lg bg-indigo-50 border border-indigo-200 p-3">
              <h2 id="transit-heading" className="text-sm font-medium text-indigo-800 mb-2">
                Transit Access
              </h2>
              <div className="flex items-center gap-3 mb-2">
                <div className="text-2xl font-bold text-indigo-700">{transitScore.transitScore}</div>
                <div className="text-xs text-indigo-600">
                  <span className="block">/ 100</span>
                  <span className="block">
                    {transitScore.transitScore > transitScore.cityAverage
                      ? 'Above city average'
                      : transitScore.transitScore === transitScore.cityAverage
                        ? 'At city average'
                        : 'Below city average'}
                    {' '}({transitScore.cityAverage})
                  </span>
                </div>
              </div>
              <p className="text-sm text-indigo-700">
                Your neighborhood has <span className="font-semibold">{transitScore.stopCount}</span> transit stop{transitScore.stopCount !== 1 ? 's' : ''} served
                by <span className="font-semibold">{transitScore.agencyCount}</span> transit agenc{transitScore.agencyCount !== 1 ? 'ies' : 'y'}
                {transitScore.agencies.length > 0 && (
                  <> ({transitScore.agencies.join(', ')})</>
                )}.
              </p>
            </section>
          )}

          {/* Access gap score */}
          {accessGap && accessGap.accessGapScore != null && (
            <section aria-labelledby="access-gap-heading" className="rounded-lg bg-amber-50 border border-amber-200 p-3">
              <h2 id="access-gap-heading" className="text-sm font-medium text-amber-800 mb-2">
                Access Gap Assessment
              </h2>
              <div className="flex items-center gap-3 mb-2">
                <div className="text-2xl font-bold text-amber-700">{accessGap.accessGapScore}</div>
                <div className="text-xs text-amber-600">
                  <span className="block">/ 100</span>
                  <span className="block">
                    Rank {accessGap.rank} of {accessGap.totalCommunities} communities
                  </span>
                </div>
              </div>
              <p className="text-sm text-amber-700 mb-2">
                {accessGap.accessGapScore >= 65
                  ? 'Data patterns suggest this neighborhood may face significant access barriers to civic services.'
                  : accessGap.accessGapScore >= 40
                    ? 'Some indicators suggest potential access gaps in this neighborhood.'
                    : 'This neighborhood shows relatively fewer signs of access barriers.'}
              </p>
              <div className="space-y-1.5 text-xs text-amber-600">
                {accessGap.signals.lowEngagement != null && (
                  <div className="flex justify-between">
                    <span>Low civic engagement signal</span>
                    <span className="font-mono">{Math.round(accessGap.signals.lowEngagement * 100)}%</span>
                  </div>
                )}
                {accessGap.signals.lowTransit != null && (
                  <div className="flex justify-between">
                    <span>Limited transit access signal</span>
                    <span className="font-mono">{Math.round(accessGap.signals.lowTransit * 100)}%</span>
                  </div>
                )}
                {accessGap.signals.highNonEnglish != null && (
                  <div className="flex justify-between">
                    <span>Language barrier signal</span>
                    <span className="font-mono">{Math.round(accessGap.signals.highNonEnglish * 100)}%</span>
                  </div>
                )}
              </div>
              <p className="text-xs text-amber-500 mt-2 italic">
                This score identifies potential access gaps based on available data. It does not prove a neighborhood is underserved.
              </p>
            </section>
          )}

          {/* Good news */}
          {metrics.goodNews.length > 0 && (
            <section aria-labelledby="good-news-heading" className="rounded-lg bg-green-50 border border-green-200 p-3">
              <h2 id="good-news-heading" className="text-sm font-medium text-green-800 mb-2">
                Good News
              </h2>
              <ul className="space-y-1.5 text-sm text-green-700">
                {metrics.goodNews.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </section>
          )}

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
          {suggestedLangMeta && reportLang === 'English' && (
            <div className="rounded-lg bg-blue-50 border border-blue-200 p-3">
              <p className="text-sm text-blue-800 mb-2">
                {t('sidebar.languageSuggestion', { language: suggestedLang!.language })}
              </p>
              <button
                type="button"
                onClick={() => {
                  setReportLang(suggestedLangMeta.label);
                  onGenerateReport(suggestedLangMeta.label);
                }}
                disabled={reportLoading}
                className="w-full rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              >
                {t('sidebar.generateReportIn', { language: suggestedLangMeta.nativeLabel })}
              </button>
            </div>
          )}

          {/* Brief language selector — visible buttons, not a dropdown */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">{t('sidebar.reportLanguage')}</p>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('sidebar.reportLanguage')}>
              {SUPPORTED_LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  role="radio"
                  aria-checked={reportLang === l.label}
                  onClick={() => setReportLang(l.label)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                    reportLang === l.label
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
            onClick={() => onGenerateReport(reportLang)}
            disabled={reportLoading}
            aria-busy={reportLoading}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            {reportLoading ? t('sidebar.generating') : t('sidebar.generateReport')}
          </button>
        </>
      )}

      {reportError && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700" role="alert">
          {reportError}
        </div>
      )}

      <ReportView report={report} loading={reportLoading} metrics={metrics} topLanguages={topLanguages} />
    </div>
  );
}
