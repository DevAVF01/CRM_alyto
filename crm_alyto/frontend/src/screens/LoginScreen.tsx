import { useState } from 'react';
import type { FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { COMPLIANCE_BADGE, NETWORK_PILL } from '../utils/brandCopy';
import { Icon } from '../components/ui';

const DEMO_PROFILES: { email: string; label: string }[] = [
  { email: 'admin@avfinance.bo', label: 'Administrador' },
  { email: 'compliance@avfinance.bo', label: 'Oficial de Cumplimiento' },
  { email: 'operaciones@avfinance.bo', label: 'Operaciones' },
  { email: 'ventas@avfinance.bo', label: 'Fuerza de Ventas B2B' },
  { email: 'soporte@avfinance.bo', label: 'Atención y Soporte' },
];

export default function LoginScreen() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const from = (location.state as { from?: string } | null)?.from ?? '/';

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !password) {
      setError('Ingrese su correo y contraseña para continuar.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await login(email.trim(), password);
      navigate(from, { replace: true });
    } catch {
      setError('No fue posible iniciar sesión. Verifique sus credenciales.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login">
      <div className="login__card">
        <img className="login__logo" src="/logo.png" alt="Alyto" />
        <p className="login__kicker">CRM de Operaciones y Servicio</p>
        <h1>Bienvenido de nuevo</h1>
        <p className="login__sub">Accede a tu cuenta Alyto CRM</p>

        <form onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              className="input"
              type="email"
              placeholder="tu@email.com"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="password">Contraseña</label>
            <div className="input__wrap">
              <input
                id="password"
                className="input"
                type={showPassword ? 'text' : 'password'}
                placeholder="Ingrese su contraseña"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                type="button"
                className="input__eye"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                <Icon name={showPassword ? 'eyeOff' : 'eye'} size={17} />
              </button>
            </div>
            <span className="field__hint">La contraseña la asigna la administración</span>
          </div>

          <label className="checkbox">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
            />
            Recordarme
          </label>

          {error ? <p className="small" style={{ color: 'var(--color-danger)' }}>{error}</p> : null}

          <button className="btn btn--navy btn--block" type="submit" disabled={loading}>
            {loading ? 'Verificando credenciales...' : 'Iniciar sesión'}
          </button>
        </form>

        <div className="login__profiles">
          <p className="login__profiles-title">Perfiles de demostración del ECP</p>
          <div className="login__profiles-list">
            {DEMO_PROFILES.map((profile) => (
              <button
                key={profile.email}
                type="button"
                className={`login__profile${email === profile.email ? ' login__profile--active' : ''}`}
                onClick={() => {
                  setEmail(profile.email);
                }}
              >
                <Icon name="key" size={13} />
                {profile.label}
              </button>
            ))}
          </div>
          <p className="login__profiles-hint">
            Estos correos solo existen en el almacén de demostración. La contraseña es el valor de DEMO_PASSWORD en el
            archivo .env del backend y ningún otro correo puede ingresar.
          </p>
        </div>

        <p className="login__footer">
          Las cuentas de Alyto CRM las crea la administración con el rol que corresponde a cada persona.
          <br />
          Al continuar usted acepta los Términos de Servicio de AV Finance S.R.L.
          <br />
          {COMPLIANCE_BADGE} | {NETWORK_PILL}
        </p>
      </div>
    </div>
  );
}
