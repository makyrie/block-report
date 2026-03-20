import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useLanguage } from '../../i18n/context';

function linkClass({ isActive }: { isActive: boolean }) {
  return `px-3 py-2 rounded-md text-sm font-medium transition-colors ${
    isActive
      ? 'text-blue-700 bg-blue-50'
      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
  }`;
}

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { t } = useLanguage();

  const navLinks = [
    { to: '/', label: t('nav.home') || 'Home' },
    { to: '/citywide', label: t('nav.citywide') || 'Citywide' },
    { to: '/neighborhood/mira-mesa', label: t('nav.explore') || 'Explore' },
    { to: '/resources', label: t('nav.resources') || 'Resources' },
  ];

  return (
    <nav aria-label="Main navigation" className="bg-white border-b border-gray-200 shrink-0 print:hidden">
      <div className="px-4 flex items-center justify-between h-14">
        {/* Brand */}
        <NavLink to="/" className="text-lg font-bold text-gray-900 hover:text-blue-700 transition-colors">
          {t('app.title')}
        </NavLink>

        {/* Desktop nav links */}
        <div className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => (
            <NavLink key={link.to} to={link.to} className={linkClass} end={link.to === '/'}>
              {link.label}
            </NavLink>
          ))}
        </div>

        {/* Mobile hamburger */}
        <button
          type="button"
          className="md:hidden p-2 rounded-md text-gray-500 hover:text-gray-900 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          aria-expanded={menuOpen}
          aria-controls="mobile-nav-menu"
          onClick={() => setMenuOpen((v) => !v)}
        >
          <span className="sr-only">{menuOpen ? 'Close menu' : 'Open menu'}</span>
          {menuOpen ? (
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div id="mobile-nav-menu" className="md:hidden border-t border-gray-100 px-4 py-2 space-y-1">
          {navLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === '/'}
              className={({ isActive }) =>
                `block px-3 py-2 rounded-md text-sm font-medium ${
                  isActive ? 'text-blue-700 bg-blue-50' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`
              }
              onClick={() => setMenuOpen(false)}
            >
              {link.label}
            </NavLink>
          ))}
        </div>
      )}
    </nav>
  );
}
