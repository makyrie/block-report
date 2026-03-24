import React from 'react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import ReactDOM from 'react-dom';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/layout/layout';
import WelcomePage from './pages/welcome-page';
import NeighborhoodPage from './pages/neighborhood-page';
import ResourcesPage from './pages/resources-page';
import FlyerPage from './pages/flyer-page';
import CitywidePage from './pages/citywide-page';
import { LanguageProvider } from './i18n/context';
import './app.css';
import './print.css';

if (import.meta.env.DEV) {
  import('@axe-core/react').then((axe) => {
    axe.default(React, ReactDOM, 1000);
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<WelcomePage />} />
            <Route path="/citywide" element={<CitywidePage />} />
            <Route path="/neighborhood/:slug" element={<NeighborhoodPage />} />
            <Route path="/flyer" element={<FlyerPage />} />
            <Route path="/flyer/:slug" element={<FlyerPage />} />
            <Route path="/resources" element={<ResourcesPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </LanguageProvider>
  </StrictMode>,
);
