import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { COMPLIANCE_BADGE, LEGAL_FOOTER, NETWORK_PILL } from '../utils/brandCopy';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/client';
import { useApiData } from '../hooks/useApiData';
import { STAGES } from '../data/mock';
import { Icon } from './ui';
import type { IconName } from './ui';

const NAV_ITEMS: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '/', label: 'Panel', icon: 'grid', end: true },
  { to: '/pipeline', label: 'Pipeline', icon: 'kanban' },
  { to: '/clientes', label: 'Clientes', icon: 'users' },
  { to: '/comunicaciones', label: 'Mensajes', icon: 'mail' },
  { to: '/cumplimiento', label: 'Cumplimiento', icon: 'shield' },
];

export default function Shell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { live, reload } = useApiData<string[]>(() => api.meta.stages(), [...STAGES]);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar__brand">
          <span className="topbar__logo">
            <img src="/logo.png" alt="Alyto" />
          </span>
          <span>
            <span className="topbar__title">Alyto CRM</span>
            <br />
            <span className="topbar__subtitle">AV Finance ECP</span>
          </span>
        </div>
        <div className="topbar__meta">
          <button
            type="button"
            className={`source-pill source-pill--topbar${live ? ' source-pill--live' : ''}`}
            title={live ? 'Backend de API alcanzable en /api' : 'Sin respuesta del backend, la interfaz usa datos de demostración'}
            onClick={() => void reload()}
          >
            <span className="source-pill__dot" />
            {live ? 'API conectada' : 'Modo demostración'}
          </button>
          <span className="network-pill">
            <span className="network-pill__dot" />
            {NETWORK_PILL}
          </span>
          <span className="compliance-badge">{COMPLIANCE_BADGE}</span>
          <button
            type="button"
            className="icon-btn"
            style={{ background: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.25)', color: '#ffffff' }}
            title={`Cerrar sesión (${user?.email ?? ''})`}
            onClick={handleLogout}
          >
            <Icon name="logout" size={16} />
          </button>
        </div>
      </header>

      <nav className="bottomnav" aria-label="Navegación principal">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `bottomnav__item${isActive ? ' active' : ''}`}
          >
            <span className="bottomnav__icon">
              <Icon name={item.icon} size={19} />
            </span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      <main className="shell__content">
        <Outlet />
      </main>

      <footer className="footer-legal">
        <span>{LEGAL_FOOTER}</span>
        <span>Bajo supervisión de ASFI en el Entorno Controlado de Pruebas (ECP)</span>
      </footer>
    </div>
  );
}
