import type { CommunityReport, CommunityTrends, NeighborhoodProfile } from '../../types/index';
import { useLanguage } from '../../i18n/context';
import { FlyerPreview } from '../flyer/flyer-preview';

interface ReportViewProps {
  report: CommunityReport | null;
  loading: boolean;
  metrics?: NeighborhoodProfile['metrics'] | null;
  topLanguages?: { language: string; percentage: number }[];
  trends?: CommunityTrends | null;
}

export default function ReportView({ report, loading, metrics, topLanguages, trends }: ReportViewProps) {
  const { t } = useLanguage();

  if (loading) {
    return (
      <div role="status" aria-label={t('report.generating')} className="flex flex-col items-center justify-center py-8 text-gray-500">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600 mb-2" />
        <p className="text-sm text-gray-500">{t('report.generatingBackground') ?? 'Generating your report...'}</p>
        <span className="sr-only">{t('report.generatingSr')}</span>
      </div>
    );
  }

  if (!report) {
    return null;
  }

  return (
    <>
      {/* Flyer preview — visible on-screen as a paper card */}
      <FlyerPreview
        report={report}
        metrics={metrics}
        topLanguages={topLanguages}
        trends={trends}
      />
    </>
  );
}
