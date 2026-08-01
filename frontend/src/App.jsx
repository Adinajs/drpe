import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { SearchProvider } from './context/SearchContext';
import ProtectedRoute from './components/ProtectedRoute';
import MainLayout from './components/layout/MainLayout';
import { Toaster } from 'react-hot-toast';

// Pages
import DashboardPage from './pages/DashboardPage.jsx';
import AssetsPage from './pages/AssetsPage.jsx';
import ScansPage from './pages/ScansPage.jsx';
import VulnerabilitiesPage from './pages/VulnerabilitiesPage.jsx';
import ThreatIntelPage from './pages/ThreatIntelPage.jsx';
import TopologyPage from './pages/TopologyPage.jsx';
import ReportsPage from './pages/ReportsPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import LoginPage from './pages/auth/LoginPage.jsx';
import SignupPage from './pages/auth/SignupPage.jsx';

function App() {
  return (
    <ThemeProvider>
      <Toaster 
        position="top-right"
        reverseOrder={false}
        toastOptions={{
          className: 'glass !bg-background/80 !text-foreground !border-border !shadow-2xl font-medium',
          duration: 3000,
          style: {
            borderRadius: '12px',
            background: 'var(--background)',
            color: 'var(--foreground)',
            border: '1px solid var(--border)',
          },
        }}
      />
      <AuthProvider>
        <SearchProvider>
          <Router>
            <Routes>
              {/* Public Routes */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup" element={<SignupPage />} />

              {/* Protected Dashboard Routes */}
              <Route element={<ProtectedRoute />}>
                <Route element={<MainLayout />}>
                  <Route path="/" element={<DashboardPage />} />
                  <Route path="/assets" element={<AssetsPage />} />
                  <Route path="/scans" element={<ScansPage />} />
                  <Route path="/vulnerabilities" element={<VulnerabilitiesPage />} />
                  <Route path="/intelligence" element={<ThreatIntelPage />} />
                  <Route path="/topology" element={<TopologyPage />} />
                  <Route path="/reports" element={<ReportsPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                </Route>
              </Route>

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Router>
        </SearchProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
