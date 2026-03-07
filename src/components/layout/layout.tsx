import { Outlet } from 'react-router-dom';
import Navbar from './navbar';

export default function Layout() {
  return (
    <div className="flex flex-col h-screen">
      {/* Skip to main content — WCAG 2.4.1 */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 focus:px-4 focus:py-2 focus:bg-white focus:text-blue-700 focus:rounded focus:shadow-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
      >
        Skip to main content
      </a>
      <Navbar />
      <div className="flex-1 overflow-hidden">
        <Outlet />
      </div>
    </div>
  );
}
