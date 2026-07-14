/**
 * VeriChainX — app shell with routing.
 *   /            landing page
 *   /admin       operations dashboard
 *   /verify/:id  public authenticity record (no login)
 */

import React from 'react';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import theme from './theme';
import { LandingPage } from './pages/LandingPage';
import { AdminPage } from './pages/AdminPage';
import { VerifyPage } from './pages/VerifyPage';
import { CertificatePage } from './pages/CertificatePage';

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/verify/:id" element={<VerifyPage />} />
          <Route path="/certificate/:id" element={<CertificatePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
