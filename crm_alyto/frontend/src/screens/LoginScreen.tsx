import { useState } from 'react';
import type { FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useRuntime } from '../runtime/RuntimeProvider';
import { COMPLIANCE_BADGE, NETWORK_PILL } from '../utils/brandCopy';
import { solicitarCuenta, mensajeDeError } from '../api/client';
import { Icon } from '../components/ui';

const DEMO_PROFILES: { email: string; label: string }[] = [
  { email: 'admin@avfinance.bo', label: 'Administrador' },
  // Los otros cuatro perfiles siguen suspendidos en Auth desde el 29/10 (ban de 100 anos), porque
  // una baja fisica los saca de Auth y arranca asientos inmutables de auditoria por cascada.
  // Vuelven a esta lista el dia que se vuelvan a abrir los roles.
];

export default function LoginScreen() {
  const { login } = useAuth();
  const runtime = useRuntime();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Solicitud de cuenta propia (F-03): el panel secundario del login. Pide correo corporativo,
  // nombre y contrasena; la cuenta queda creada y pendiente hasta que el administrador la acepte.
  const [solicitudAbierta, setSolicitudAbierta] = useState(false);
  const [solNombre, setSolNombre] = useState('');
  const [solEmail, setSolEmail] = useState('');
  const [solPassword, setSolPassword] = useState('');
  const [solError, setSolError] = useState<string | null>(null);
  const [solMensaje, setSolMensaje] = useState<string | null>(null);
  const [solCargando, setSolCargando] = useState(false);

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

  const handleSolicitud = async (event: FormEvent) => {
    event.preventDefault();
    if (!solNombre.trim() || !solEmail.trim() || solPassword.length < 8) {
      setSolError('Nombre, correo y una contrasena de al menos 8 caracteres.');
      return;
    }
    setSolCargando(true);
    setSolError(null);
    try {
      const { mensaje } = await solicitarCuenta({
        display_name: solNombre.trim(),
        email: solEmail.trim(),
        password: solPassword,
      });
      setSolMensaje(mensaje);
      setSolNombre('');
      setSolEmail('');
      setSolPassword('');
    } catch (err) {
      setSolError(mensajeDeError(err));
    } finally {
      setSolCargando(false);
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
            <span className="field__hint">Su contraseña es la de su cuenta del CRM</span>
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
          <p className="login__profiles-title">Accesos del entorno de pruebas</p>
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
            {runtime.demo
              ? 'El backend esta en modo demostracion: estos correos viven en el almacen en memoria y la contrasena es el valor de DEMO_PASSWORD del archivo .env del backend. Ningun otro correo ingresa.'
              : 'Estas cuentas estan registradas en Supabase, la base del CRM. La contrasena es la que el personal recibe al habilitar su cuenta. Los demas roles quedaron suspendidos el 29/10 y vuelven con el alta por la pantalla Personal.'}
          </p>
        </div>

        <div className="login__solicitud">
          {solicitudAbierta ? (
            <form onSubmit={handleSolicitud} noValidate>
              <p className="login__profiles-title">Solicitar cuenta del personal</p>
              {solMensaje ? (
                <p className="small" style={{ color: 'var(--color-success)' }}>{solMensaje}</p>
              ) : (
                <>
                  <div className="field">
                    <label htmlFor="sol-nombre">Nombre visible</label>
                    <input id="sol-nombre" className="input" type="text" value={solNombre}
                      onChange={(e) => setSolNombre(e.target.value)}
                      placeholder="Como quiere que lo vean en el CRM" />
                  </div>
                  <div className="field">
                    <label htmlFor="sol-email">Correo corporativo</label>
                    <input id="sol-email" className="input" type="email" value={solEmail}
                      onChange={(e) => setSolEmail(e.target.value)}
                      placeholder="nombre@avfinance.bo" autoComplete="email" />
                  </div>
                  <div className="field">
                    <label htmlFor="sol-password">Su contraseña</label>
                    <input id="sol-password" className="input" type="password" value={solPassword}
                      onChange={(e) => setSolPassword(e.target.value)}
                      placeholder="Minimo 8 caracteres" autoComplete="new-password" />
                  </div>
                  {solError ? <p className="small" style={{ color: 'var(--color-danger)' }}>{solError}</p> : null}
                  <button className="btn btn--navy btn--block" type="submit" disabled={solCargando}>
                    {solCargando ? 'Enviando la solicitud...' : 'Enviar solicitud'}
                  </button>
                  <p className="login__profiles-hint">
                    La cuenta queda pendiente hasta que el administrador la acepte con un rol. Hasta entonces no
                    puede entrar con ella.
                  </p>
                </>
              )}
              <button type="button" className="btn btn--ghost btn--block btn--sm"
                onClick={() => { setSolicitudAbierta(false); setSolError(null); }}>
                Volver a iniciar sesión
              </button>
            </form>
          ) : (
            <button type="button" className="btn btn--ghost btn--block"
              onClick={() => setSolicitudAbierta(true)}>
              <Icon name="plus" size={14} /> Solicitar una cuenta del personal
            </button>
          )}
        </div>

        <p className="login__footer">
          Las cuentas del personal se solicitan con el correo corporativo y el administrador las acepta con el rol
          que corresponde a cada persona.
          <br />
          Al continuar usted acepta los Términos de Servicio de AV Finance S.R.L.
          <br />
          {COMPLIANCE_BADGE} | {NETWORK_PILL}
        </p>
      </div>
    </div>
  );
}
