import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { RuntimeProvider } from './runtime/RuntimeProvider';
import Shell from './components/Shell';
import LoginScreen from './screens/LoginScreen';
import DashboardScreen from './screens/DashboardScreen';
import PipelineScreen from './screens/PipelineScreen';
import Client360Screen from './screens/Client360Screen';
import CommunicationsScreen from './screens/CommunicationsScreen';
import ComplianceScreen from './screens/ComplianceScreen';

function RequireAuth() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

export default function App() {
  return (
    <AuthProvider>
      <RuntimeProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginScreen />} />
            <Route element={<RequireAuth />}>
              <Route element={<Shell />}>
                <Route index element={<DashboardScreen />} />
                <Route path="pipeline" element={<PipelineScreen />} />
                <Route path="clientes" element={<Client360Screen />} />
                <Route path="clientes/:clientId" element={<Client360Screen />} />
                <Route path="comunicaciones" element={<CommunicationsScreen />} />
                <Route path="cumplimiento" element={<ComplianceScreen />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </RuntimeProvider>
    </AuthProvider>
  );
}
