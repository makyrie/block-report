import { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '../../i18n/context';

interface PrintFlyerFabProps {
  visible: boolean;
}

export function PrintFlyerFab({ visible }: PrintFlyerFabProps) {
  const { t } = useLanguage();
  const [hasInteracted, setHasInteracted] = useState(false);
  const [printing, setPrinting] = useState(false);

  const handleAfterPrint = useCallback(() => setPrinting(false), []);

  useEffect(() => {
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, [handleAfterPrint]);

  if (!visible) return null;

  const handleClick = () => {
    if (printing) return;
    setHasInteracted(true);
    setPrinting(true);
    window.print();
  };

  return (
    <>
      {/* Desktop FAB — pill button, bottom-end */}
      <button
        type="button"
        onClick={handleClick}
        disabled={printing}
        className={`
          no-print hidden md:inline-flex items-center gap-2
          fixed bottom-6 end-6 z-[900]
          rounded-full bg-gradient-to-r from-amber-500 to-orange-500
          px-5 py-3 text-sm font-semibold text-white
          shadow-lg shadow-orange-500/25
          transition-all duration-200
          hover:scale-105 hover:shadow-xl hover:shadow-orange-500/30
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2
          disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:scale-100
          ${!hasInteracted ? 'motion-safe:animate-pulse' : ''}
        `}
      >
        <PrinterIcon />
        {t('flyer.printFlyer')}
        {!hasInteracted && (
          <span className="ml-1 rounded-full bg-white/25 px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none tracking-wider">
            {t('fab.new')}
          </span>
        )}
      </button>

      {/* Mobile FAB — full-width bar above tab bar */}
      <div
        className={`
          no-print md:hidden fixed bottom-[49px] inset-x-0 z-[900]
          border-t border-orange-200 bg-gradient-to-r from-amber-500 to-orange-500
          px-4 py-2.5
          ${!hasInteracted ? 'motion-safe:animate-pulse' : ''}
        `}
      >
        <button
          type="button"
          onClick={handleClick}
          disabled={printing}
          className="
            flex w-full items-center justify-center gap-2
            text-sm font-semibold text-white
            disabled:opacity-70 disabled:cursor-not-allowed
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-orange-500
            rounded
          "
        >
          <PrinterIcon />
          {t('flyer.printFlyer')}
          {!hasInteracted && (
            <span className="ml-1 rounded-full bg-white/25 px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none tracking-wider">
              {t('fab.new')}
            </span>
          )}
        </button>
      </div>
    </>
  );
}

function PrinterIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
    </svg>
  );
}
