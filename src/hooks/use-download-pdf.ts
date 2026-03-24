import { useState, useCallback } from 'react';
import type { CommunityReport, NeighborhoodProfile } from '../types/index';
import { downloadPdf } from '../utils/download-pdf';
import { useLanguage } from '../i18n/context';

export function useDownloadPdf(
  report: CommunityReport,
  slug: string,
  metrics?: NeighborhoodProfile['metrics'] | null,
  topLanguages?: { language: string; percentage: number }[],
) {
  const { t } = useLanguage();
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const handleDownloadPdf = useCallback(async () => {
    setDownloading(true);
    setDownloadError(null);
    try {
      await downloadPdf(report, slug, metrics, topLanguages);
    } catch (err) {
      console.error('PDF download failed:', err);
      setDownloadError(t('flyer.downloadError'));
    } finally {
      setDownloading(false);
    }
  }, [report, slug, metrics, topLanguages, t]);

  return { downloading, downloadError, handleDownloadPdf };
}
