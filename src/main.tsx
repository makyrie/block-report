import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/layout/layout';
import WelcomePage from './pages/welcome-page';
import NeighborhoodPage from './pages/neighborhood-page';
import ResourcesPage from './pages/resources-page';
import { LanguageProvider } from './i18n/context';
import './app.css';
import './print.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<WelcomePage />} />
            <Route path="/neighborhood/:slug" element={<NeighborhoodPage />} />
            <Route path="/resources" element={<ResourcesPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </LanguageProvider>
  </StrictMode>,
);
