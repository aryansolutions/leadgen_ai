
import { Navigate, Route, Routes } from 'react-router-dom';

import { useAuth } from './context/AuthContext';

import AppLayout from './components/AppLayout';

import AuthPage from './pages/AuthPage';
import DashboardPage from './pages/DashboardPage';
import LeadsPage from './pages/LeadsPage';
import LeadFinderPage from './pages/LeadFinderPage';
import CallingPage from './pages/CallingPage';
import CampaignsPage from './pages/CampaignsPage';
import ReportsPage from './pages/ReportsPage';


function ProtectedRoutes() {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <AuthPage />;
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>

        <Route
          index
          element={<DashboardPage />}
        />

        <Route
          path="leads"
          element={<LeadsPage />}
        />

        <Route
          path="lead-finder"
          element={<LeadFinderPage />}
        />

        <Route
          path="calling"
          element={<CallingPage />}
        />

        <Route
          path="campaigns"
          element={<CampaignsPage />}
        />

        <Route
          path="reports"
          element={<ReportsPage />}
        />

        <Route
          path="*"
          element={<Navigate to="/" replace />}
        />

      </Route>
    </Routes>
  );
}


export default function App() {
  return <ProtectedRoutes />;
}
