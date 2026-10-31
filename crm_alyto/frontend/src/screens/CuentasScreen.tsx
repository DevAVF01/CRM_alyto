import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { crm, mensajeDeError } from '../api/client';
import { useLectura } from '../components/Aviso';
import { Badge, Icon, etiqueta, formatoDia, montoBs, toneDeKyc } from '../components/ui';
import type { CuentaRow, KycEstado, TipoCuenta } from '../types';

// Cuentas: el alta y la lista de lo que el CRM atiende. Una cuenta no es un lead ni una oportunidad:
// es la persona o la empresa con la que hay una conversación abierta y un legajo que completar.

const TIPOS: TipoCuenta[] = ['persona_natural', 'persona_juridica'];
const KYC: KycEstado[] = ['Pendiente', 'En revision', 'Aprobado', 'Observado', 'Rechazado'];
// Son los valores que acepta el checo clients_origen_check de la base. Ponerlos aqui como lista y no
// como texto libre evita el rechazo mas frecuente al dar de alta: un origen escrito a mano.
const ORIGENES = ['whatsapp_business', 'correo', 'chat_app', 'web_chat', 'linkedin', 'meta', 'tiktok',
  'derivacion', 'manual'];
const RIESGOS = ['por clasificar', 'bajo', 'medio', 'alto'];
const ESTADOS_ECP = ['no dado de alta', 'activo', 'suspendido', 'baja registrada'];

function AltaCuenta({ alCrear }: { alCrear: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [datos, setDatos] = useState({
    account_type: 'persona_natural',
    display_name: '',
    legal_name: '',
    ci: '',
    nit: '',
    email: '',
    phone_e164: '',
    company_name: '',
    city: '',
    sector: '',
    origin: 'manual',
  });

  const cambiar = (campo: keyof typeof datos) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setDatos((prev) => ({ ...prev, [campo]: e.target.value }));

  // La restriccion clients_canal_contacto pide al menos un dato de contacto. Sin esta pantalla no lo
  // comprueba, la base rechaza el alta y el mensaje que llega es un violate de constraint.
  const tieneContacto = [datos.phone_e164, datos.email, datos.ci].some((v) => v.trim() !== '');
  const juridiaIncompleta =
    datos.account_type === 'persona_juridica' && (datos.legal_name.trim() === '' || datos.nit.trim() === '');

  const crear = async () => {
    setGuardando(true);
    setError(null);
    try {
      const cuerpo = Object.fromEntries(Object.entries(datos).filter(([, v]) => String(v).trim() !== ''));
      await crm.crearCuenta(cuerpo);
      setAbierto(false);
      alCrear();
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <section className="card">
      <button type="button" className="btn btn--primary btn--sm" onClick={() => setAbierto((v) => !v)}>
        <Icon name="plus" size={14} /> Alta de cuenta
      </button>
      {!abierto ? (
        <p className="small muted mt-8">
          El alta crea la cuenta y sus casillas de legajo. La base arma las casillas solas, con su disparador.
        </p>
      ) : (
        <div className="grid grid--2 mt-12">
          <label className="field">
            <span className="field__label">Tipo</span>
            <select className="input" value={datos.account_type} onChange={cambiar('account_type')}>
              {TIPOS.map((t) => (
                <option key={t} value={t}>
                  {etiqueta(t)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">Nombre visible</span>
            <input className="input" value={datos.display_name} onChange={cambiar('display_name')} />
          </label>
          <label className="field">
            <span className="field__label">Razón social o nombres completos</span>
            <input className="input" value={datos.legal_name} onChange={cambiar('legal_name')} />
          </label>
          <label className="field">
            <span className="field__label">CI</span>
            <input className="input" value={datos.ci} onChange={cambiar('ci')} />
          </label>
          <label className="field">
            <span className="field__label">NIT</span>
            <input className="input" value={datos.nit} onChange={cambiar('nit')} />
          </label>
          <label className="field">
            <span className="field__label">Correo</span>
            <input className="input" type="email" value={datos.email} onChange={cambiar('email')} />
          </label>
          <label className="field">
            <span className="field__label">Teléfono E.164</span>
            <input
              className="input"
              value={datos.phone_e164}
              onChange={cambiar('phone_e164')}
              placeholder="+59170000000"
            />
          </label>
          <label className="field">
            <span className="field__label">Empresa</span>
            <input className="input" value={datos.company_name} onChange={cambiar('company_name')} />
          </label>
          <label className="field">
            <span className="field__label">Ciudad</span>
            <input className="input" value={datos.city} onChange={cambiar('city')} />
          </label>
          <label className="field">
            <span className="field__label">Sector</span>
            <input className="input" value={datos.sector} onChange={cambiar('sector')} />
          </label>
          <label className="field">
            <span className="field__label">Origen</span>
            <select className="input" value={datos.origin} onChange={cambiar('origin')}>
              {ORIGENES.map((o) => (
                <option key={o} value={o}>
                  {etiqueta(o)}
                </option>
              ))}
            </select>
          </label>
          {error ? <p className="small" style={{ color: 'var(--color-danger)' }}>{error}</p> : null}
          <div className="row">
            <button
              type="button"
              className="btn btn--navy btn--sm"
              disabled={guardando || !datos.display_name.trim() || !tieneContacto || juridiaIncompleta}
              onClick={() => void crear()}
            >
              {guardando ? 'Guardando' : 'Guardar cuenta'}
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setAbierto(false)}>
              Cerrar
            </button>
          </div>
          <p className="small muted mt-8">
            {!datos.display_name.trim()
              ? 'Falta el nombre visible.'
              : juridiaIncompleta
                ? 'Una persona jurídica necesita razón social y NIT; la base lo exige al guardar.'
                : !tieneContacto
                  ? 'Hace falta al menos un dato de contacto: teléfono, correo o cédula. Sin ninguno la ficha no sirve para abrir una conversación y la base rechaza el alta.'
                  : 'Con el nombre y un dato de contacto alcanza. El legajo se crea solo: la base abre las casillas que corresponden al tipo de cuenta.'}
          </p>
        </div>
      )}
    </section>
  );
}

export default function CuentasScreen() {
  const [tipo, setTipo] = useState('');
  const [kyc, setKyc] = useState('');
  const [riesgo, setRiesgo] = useState('');
  const [ecp, setEcp] = useState('');
  const [version, setVersion] = useState(0);

  const lectura = useLectura<CuentaRow>(
    () =>
      crm.cuentas({
        tipo: tipo || undefined,
        kyc: kyc || undefined,
        riesgo: riesgo || undefined,
        ecp: ecp || undefined,
      }),
    [tipo, kyc, riesgo, ecp, version],
    'No hay cuentas con estos filtros para este rol.',
  );

  const filas = lectura.filas;
  const resumen = useMemo(
    () => ({
      total: filas.length,
      pendientes: filas.filter((c) => c.kyc_estado !== 'Aprobado').length,
      conTope: filas.filter((c) => c.tope_operacion_bs !== null).length,
    }),
    [filas],
  );

  return (
    <div>
      <div className="page-head">
        <div>
          <p className="page-head__kicker">ALYTO CRM · CUENTAS</p>
          <h1 className="page-head__title">Cuentas</h1>
          <p className="page-head__sub">
            {resumen.total} cuentas visibles, {resumen.pendientes} con el legajo todavía sin aprobar y{' '}
            {resumen.conTope} con tope por operación registrado.
          </p>
        </div>
      </div>

      <div className="section">
        <AltaCuenta alCrear={() => setVersion((v) => v + 1)} />
      </div>

      <div className="filtros row">
        <label className="field field--inline">
          <span className="field__label">Tipo</span>
          <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="">Todos</option>
            {TIPOS.map((t) => (
              <option key={t} value={t}>
                {etiqueta(t)}
              </option>
            ))}
          </select>
        </label>
        <label className="field field--inline">
          <span className="field__label">KYC</span>
          <select className="input" value={kyc} onChange={(e) => setKyc(e.target.value)}>
            <option value="">Todos</option>
            {KYC.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="field field--inline">
          <span className="field__label">Riesgo</span>
          <select className="input" value={riesgo} onChange={(e) => setRiesgo(e.target.value)}>
            <option value="">Todos</option>
            {RIESGOS.map((t) => (
              <option key={t} value={t}>
                {etiqueta(t)}
              </option>
            ))}
          </select>
        </label>
        <label className="field field--inline">
          <span className="field__label">Estado ECP</span>
          <select className="input" value={ecp} onChange={(e) => setEcp(e.target.value)}>
            <option value="">Todos</option>
            {ESTADOS_ECP.map((t) => (
              <option key={t} value={t}>
                {etiqueta(t)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {lectura.aviso ? lectura.aviso : null}

      {filas.length > 0 ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Cuenta</th>
                <th>Tipo</th>
                <th>Ciudad</th>
                <th>KYC</th>
                <th>Riesgo</th>
                <th>Tope por operación</th>
                <th>Última actividad</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filas.map((c) => (
                <tr key={c.id}>
                  <td>
                    <strong>{c.display_name}</strong>
                    <br />
                    <span className="small muted mono">{c.ci ?? c.nit ?? 'sin documento'}</span>
                  </td>
                  <td>{etiqueta(c.account_type)}</td>
                  <td>{c.city ?? 'sin dato'}</td>
                  <td>
                    <Badge tone={toneDeKyc(c.kyc_estado)}>{c.kyc_estado}</Badge>
                  </td>
                  <td>{c.riesgo}</td>
                  <td className="table__num">{montoBs(c.tope_operacion_bs)}</td>
                  <td>{formatoDia(c.last_activity_at)}</td>
                  <td>
                    <Link className="enlace" to={`/cuentas/${c.id}`}>
                      Ficha 360
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <p className="small muted mt-12">
        El tope y el cupo mensual que se leen acá son los que están registrados en la base del CRM. Si la app de pagos
        maneja otros, manda el de la base mientras no exista la interfaz entre las dos.
      </p>
    </div>
  );
}
