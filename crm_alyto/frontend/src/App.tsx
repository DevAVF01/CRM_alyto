import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { RuntimeProvider } from './runtime/RuntimeProvider';
import Shell from './components/Shell';
import LoginScreen from './screens/LoginScreen';
import BandejaScreen from './screens/BandejaScreen';
import RutasScreen from './screens/RutasScreen';
import CuentasScreen from './screens/CuentasScreen';
import FichaScreen from './screens/FichaScreen';
import LegajoScreen from './screens/LegajoScreen';
import ReclamosScreen from './screens/ReclamosScreen';
import AgendaScreen from './screens/AgendaScreen';
import RegistroScreen from './screens/RegistroScreen';
import PersonalScreen from './screens/PersonalScreen';
import PanelScreen from './screens/PanelScreen';

function RequireAuth() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

// La entrada del CRM es la Bandeja. No hay ruta de embudo comercial ni de pipeline: las seis etapas
// viven dentro de la ruta comercial, que se abre en /rutas.
export default function App() {
  return (
    <AuthProvider>
      <RuntimeProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginScreen />} />
            <Route element={<RequireAuth />}>
              <Route element={<Shell />}>
                <Route index element={<BandejaScreen />} />
                <Route path="panel" element={<PanelScreen />} />
                <Route path="rutas" element={<RutasScreen />} />
                <Route path="cuentas" element={<CuentasScreen />} />
                <Route path="cuentas/:clientId" element={<FichaScreen />} />
                <Route path="legajo" element={<LegajoScreen />} />
                <Route path="reclamos" element={<ReclamosScreen />} />
                <Route path="agenda" element={<AgendaScreen />} />
                <Route path="registro" element={<RegistroScreen />} />
                <Route path="personal" element={<PersonalScreen />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </RuntimeProvider>
    </AuthProvider>
  );
}
