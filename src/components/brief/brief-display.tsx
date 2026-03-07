import type { CommunityBrief } from '../../types/index';
import { useLanguage } from '../../i18n/context';

interface BriefDisplayProps {
  brief: CommunityBrief | null;
  loading: boolean;
}

export function BriefDisplay({ brief, loading }: BriefDisplayProps) {
  const { t } = useLanguage();

  if (loading) {
    return (
      <div role="status" aria-label={t('brief.generating')} className="flex flex-col items-center justify-center py-12 text-gray-500">
        <svg
          aria-hidden="true"
          className="animate-spin h-8 w-8 mb-3 text-blue-600"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
          />
        </svg>
        <p className="text-sm" aria-hidden="true">{t('brief.generating')}</p>
        <span className="sr-only">{t('brief.generatingSr')}</span>
      </div>
    );
  }

  if (!brief) {
    return null;
  }

  const formattedDate = new Date(brief.generatedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="brief-content bg-white rounded-lg shadow p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="border-b border-gray-200 pb-4 mb-4">
        <h2 className="text-2xl font-bold text-gray-900">
          {brief.neighborhoodName}
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          {t('brief.communityBrief')} &middot; {formattedDate} &middot; {brief.language}
        </p>
      </div>

      {/* Welcome / Summary */}
      <section className="mb-5">
        <p className="text-gray-700 leading-relaxed">{brief.summary}</p>
      </section>

      {/* Good News */}
      <section className="mb-5">
        <h3 className="text-lg font-semibold text-green-700 mb-2">{t('brief.goodNews')}</h3>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          {brief.goodNews.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      </section>

      {/* Top Issues */}
      <section className="mb-5">
        <h3 className="text-lg font-semibold text-amber-700 mb-2">
          {t('brief.topIssues')}
        </h3>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          {brief.topIssues.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      </section>

      {/* How to Participate */}
      <section className="mb-5">
        <h3 className="text-lg font-semibold text-blue-700 mb-2">
          {t('brief.howTo')}
        </h3>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          {brief.howToParticipate.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      </section>

      {/* Contact Info */}
      <section className="mb-5 bg-gray-50 rounded-md p-4">
        <h3 className="text-lg font-semibold text-gray-800 mb-2">{t('brief.contactInfo')}</h3>
        <dl className="space-y-1 text-sm text-gray-700">
          <div className="flex gap-2">
            <dt className="font-medium">{t('brief.councilDistrict')}</dt>
            <dd>{brief.contactInfo.councilDistrict}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-medium">{t('brief.phone311')}</dt>
            <dd>{brief.contactInfo.phone311}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-medium">{t('brief.nearestResource')}</dt>
            <dd>{brief.contactInfo.anchorLocation}</dd>
          </div>
        </dl>
      </section>

      {/* Print button */}
      <div className="no-print mt-4 text-center">
        <button
          type="button"
          onClick={() => window.print()}
          className="px-5 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        >
          {t('brief.print')}
        </button>
      </div>
    </div>
  );
}
