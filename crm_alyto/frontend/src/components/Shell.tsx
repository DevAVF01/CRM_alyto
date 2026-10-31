import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { COMPLIANCE_BADGE, LEGAL_FOOTER, NETWORK_PILL } from '../utils/brandCopy';
import { useAuth } from '../auth/AuthContext';
import { useRuntime } from '../runtime/RuntimeProvider';
import { Icon } from './ui';
import type { IconName } from './ui';

// Navegación del CRM. La entrada es la Bandeja, que es el trabajo de todos los días; Pipeline ya
// no existe porque el embudo de seis etapas pasó a vivir dentro de la ruta comercial.
// El Registro queda arriba y no en el menú de abajo por dos motivos: lo leen solo administración y
// cumplimiento, y no es una cola a la que alguien entre cada hora.
const NAV_ITEMS: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '/panel', label: 'Panel', icon: 'kanban' },
  { to: '/', label: 'Bandeja', icon: 'inbox', end: true },
  { to: '/rutas', label: 'Rutas', icon: 'route' },
  { to: '/cuentas', label: 'Cuentas', icon: 'users' },
  { to: '/legajo', label: 'Legajo', icon: 'doc' },
  { to: '/reclamos', label: 'Reclamos', icon: 'warning' },
  { to: '/agenda', label: 'Agenda', icon: 'calendar' },
  { to: '/personal', label: 'Personal', icon: 'key' },
];

export default function Shell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const runtime = useRuntime();

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
            <span className="topbar__subtitle">Operaciones y servicio</span>
          </span>
        </div>
        <div className="topbar__meta">
          <button
            type="button"
            className={`source-pill source-pill--topbar source-pill--${runtime.tone}`}
            title={`${runtime.label}. ${runtime.detail}`}
            onClick={() => void runtime.reload()}
          >
            <span className="source-pill__dot" />
            {runtime.label}
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
            title="El registro: quién hizo qué y cuándo"
            onClick={() => navigate('/registro')}
          >
            <Icon name="list" size={16} />
          </button>
          <button
            type="button"
            className="icon-btn"
            style={{ background: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.25)', color: '#ffffff' }}
            title={`Cerrar sesión (${user?.email ?? ''}), rol ${user?.role ?? ''}`}
            onClick={handleLogout}
          >
            <Icon name="logout" size={16} />
          </button>
        </div>
      </header>

      {runtime.tone !== 'real' ? (
        <p className={`demobar demobar--${runtime.tone}`} role="status">
          <span className="demobar__dot" />
          {runtime.demo
            ? 'El CRM no está leyendo la base de Supabase con su sesión. Las pantallas salen vacías o con el aviso del backend, nunca con datos de relleno.'
            : `${runtime.label}. ${runtime.detail}`}
        </p>
      ) : null}

      <nav className="bottomnav" aria-label="Navegación principal">
        {/* Personal es una pantalla de administración: los otros roles ni la ven ni la alcanzan. */}
        {NAV_ITEMS.filter((item) => !['/personal', '/panel'].includes(item.to) || user?.role === 'admin').map((item) => (
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
