import { useState, useEffect } from 'react';
import type { CommunityReport, NeighborhoodProfile } from '../../types/index';
import { FlyerLayout } from './flyer-layout';
import { toSlug } from '../../utils/slug';
import { useLanguage } from '../../i18n/context';
import { downloadPdf } from '../../api/client';

interface FlyerPreviewProps {
  report: CommunityReport;
  metrics?: NeighborhoodProfile['metrics'] | null;
  topLanguages?: { language: string; percentage: number }[];
}

const PREVIEW_SCALE = 0.52;
const FLYER_WIDTH = 612; // letter width in px at 72dpi ~= 8.5in
const FLYER_HEIGHT = 792; // letter height in px at 72dpi ~= 11in

export function FlyerPreview({ report, metrics, topLanguages }: FlyerPreviewProps) {
  const { t } = useLanguage();
  const [visible, setVisible] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [pdfState, setPdfState] = useState<'idle' | 'loading' | 'error'>('idle');

  // Fade-in animation on mount
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(timer);
  }, []);

  const slug = toSlug(report.neighborhoodName);

  const handleDownloadPdf = async () => {
    if (pdfState === 'loading') return;
    setPdfState('loading');
    try {
      const blob = await downloadPdf(report, slug, metrics, topLanguages);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const langCode = report.language?.toLowerCase().slice(0, 10) || 'en';
      a.download = `${slug}-${langCode}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setPdfState('idle');
    } catch {
      setPdfState('error');
    }
  };

  return (
    <>
      <div
        className={`transition-all duration-500 ease-out ${
          visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
        }`}
      >
        {/* Paper card */}
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="group relative w-full cursor-pointer rounded bg-white border border-gray-200 shadow-md hover:shadow-lg transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          aria-label="View full-size flyer"
          style={{
            height: FLYER_HEIGHT * PREVIEW_SCALE,
            overflow: 'hidden',
          }}
        >
          {/* Scaled flyer content */}
          <div
            style={{
              width: FLYER_WIDTH,
              transform: `scale(${PREVIEW_SCALE})`,
              transformOrigin: 'top left',
            }}
          >
            <div className="p-8">
              <FlyerLayout
                report={report}
                neighborhoodSlug={slug}
                metrics={metrics}
                topLanguages={topLanguages}
                inline
              />
            </div>
          </div>

          {/* Hover overlay */}
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/5 transition-colors rounded">
            <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 backdrop-blur-sm text-gray-800 text-sm font-medium px-4 py-2 rounded-full shadow">
              Click to view full size
            </span>
          </div>
        </button>

        {/* Action buttons */}
        <div className="flex gap-2 mt-3 no-print">
          <button
            type="button"
            onClick={() => window.print()}
            className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            <PrinterIcon />
            {t('flyer.print')}
          </button>
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={pdfState === 'loading'}
            className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2"
          >
            <DownloadIcon />
            {pdfState === 'loading'
              ? t('flyer.downloading')
              : pdfState === 'error'
                ? t('flyer.downloadError')
                : t('flyer.downloadPdf')}
          </button>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            <ExpandIcon />
            Full Size
          </button>
        </div>
      </div>

      {/* Full-size modal */}
      {modalOpen && (
        <FlyerModal
          report={report}
          slug={slug}
          metrics={metrics}
          topLanguages={topLanguages}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}

function FlyerModal({
  report,
  slug,
  metrics,
  topLanguages,
  onClose,
}: {
  report: CommunityReport;
  slug: string;
  metrics?: NeighborhoodProfile['metrics'] | null;
  topLanguages?: { language: string; percentage: number }[];
  onClose: () => void;
}) {
  const { t } = useLanguage();

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Prevent body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  return (
    <div
      className="no-print fixed inset-0 z-[1000] flex items-start justify-center bg-black/50 backdrop-blur-sm overflow-y-auto p-4 md:p-8"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Flyer full-size preview"
    >
      <div className="relative bg-white rounded-lg shadow-2xl max-w-[680px] w-full my-4">
        {/* Modal header */}
        <div className="sticky top-0 z-10 flex items-center justify-between bg-white border-b border-gray-200 px-4 py-3 rounded-t-lg">
          <h2 className="text-sm font-semibold text-gray-800">Flyer Preview</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                setTimeout(() => window.print(), 100);
              }}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <PrinterIcon />
              {t('flyer.print')}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Full-size flyer */}
        <div className="p-6 md:p-8">
          <FlyerLayout
            report={report}
            neighborhoodSlug={slug}
            metrics={metrics}
            topLanguages={topLanguages}
            inline
          />
        </div>
      </div>
    </div>
  );
}

function PrinterIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function ExpandIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
    </svg>
  );
}
