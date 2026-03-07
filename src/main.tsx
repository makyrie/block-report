import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import App from './App';
import WelcomePage from './components/ui/welcome-page';
import './app.css';
import './print.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<WelcomePage />} />
        <Route path="/neighborhood/:slug" element={<App />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
