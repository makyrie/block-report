import { Outlet } from 'react-router-dom';
import Navbar from './navbar';
import { useLanguage } from '../../i18n/context';

export default function Layout() {
  const { lang, t } = useLanguage();

  return (
    <div className="flex flex-col h-screen" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      {/* Skip to main content — WCAG 2.4.1 */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 focus:px-4 focus:py-2 focus:bg-white focus:text-blue-700 focus:rounded focus:shadow-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
      >
        {t('nav.skipToContent')}
      </a>
      <Navbar />
      <div className="flex-1 overflow-hidden">
        <Outlet />
      </div>
    </div>
  );
}
