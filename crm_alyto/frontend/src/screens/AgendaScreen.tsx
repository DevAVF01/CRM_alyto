import { useState } from 'react';
import { Link } from 'react-router-dom';
import { crm, mensajeDeError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useLectura } from '../components/Aviso';
import { Badge, Icon, etiqueta, formatoDiaHora } from '../components/ui';
import type { ActividadAbiertaRow, CuentaRow, TipoActividad } from '../types';

// Agenda del CRM (F-30). La vista vw_open_activities solo trae lo que sigue abierto: una tarea se
// cierra escribiendo done_at, y la base la saca de la lista. Por eso no hay filtro "mostrar hechas"
// en esta pantalla: lo hecho ya no es trabajo pendiente, y si alguien necesita el historial completo
// lo ve por el registro o por la ficha de la cuenta.

const TIPOS: TipoActividad[] = ['llamada', 'reunion', 'visita', 'correo', 'tarea', 'nota'];

function NuevaActividad({
  cuentas,
  usuarioId,
  alCrear,
}: {
  cuentas: CuentaRow[];
  usuarioId: string;
  alCrear: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [cuenta, setCuenta] = useState(cuentas[0]?.id ?? '');
  const [tipo, setTipo] = useState<TipoActividad>('llamada');
  const [titulo, setTitulo] = useState('');
  const [detalle, setDetalle] = useState('');
  const [cuando, setCuando] = useState('');
  const [minutos, setMinutos] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const crear = async () => {
    setGuardando(true);
    setError(null);
    try {
      await crm.crearActividad({
        client_id: cuenta,
        owner_id: usuarioId,
        type: tipo,
        title: titulo.trim(),
        body: detalle.trim() || undefined,
        // El input datetime-local entrega una hora sin zona. Se convierte aqui para que la base
        // reciba un instante real y el calculo de vencido siga usando la zona del entorno.
        due_at: cuando ? new Date(cuando).toISOString() : undefined,
        duration_minutes: minutos ? Number(minutos) : undefined,
      });
      setAbierto(false);
      setTitulo('');
      setDetalle('');
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
        <Icon name="plus" size={14} /> Programar actividad
      </button>
      {!abierto ? (
        <p className="small muted mt-8">
          La actividad queda a nombre del usuario con el que entró; el responsable no se elige a mano.
        </p>
      ) : (
        <div className="mt-12">
          <div className="row">
            <label className="field field--inline" style={{ flex: 1 }}>
              <span className="field__label">Cuenta</span>
              <select className="input" value={cuenta} onChange={(e) => setCuenta(e.target.value)}>
                {cuentas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.display_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field field--inline">
              <span className="field__label">Tipo</span>
              <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value as TipoActividad)}>
                {TIPOS.map((t) => (
                  <option key={t} value={t}>
                    {etiqueta(t)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="field">
            <span className="field__label">Título</span>
            <input className="input" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          </label>
          <label className="field">
            <span className="field__label">Nota</span>
            <textarea className="input" rows={2} value={detalle} onChange={(e) => setDetalle(e.target.value)} />
          </label>
          <div className="row">
            <label className="field field--inline" style={{ flex: 1 }}>
              <span className="field__label">Cuándo</span>
              <input
                className="input"
                type="datetime-local"
                value={cuando}
                onChange={(e) => setCuando(e.target.value)}
              />
            </label>
            <label className="field field--inline">
              <span className="field__label">Duración (min)</span>
              <input
                className="input"
                type="number"
                min={0}
                value={minutos}
                onChange={(e) => setMinutos(e.target.value)}
                style={{ width: 120 }}
              />
            </label>
          </div>
          {error ? <p className="small" style={{ color: 'var(--color-danger)' }}>{error}</p> : null}
          <button
            type="button"
            className="btn btn--navy btn--sm"
            disabled={guardando || !cuenta || !titulo.trim()}
            onClick={() => void crear()}
          >
            {guardando ? 'Guardando' : 'Guardar actividad'}
          </button>
          <p className="small muted mt-8">
            Sin fecha la actividad queda abierta indefinidamente: no es una tarea vencida, es una tarea sin plazo.
          </p>
        </div>
      )}
    </section>
  );
}

function FilaActividad({ actividad, alCambiar }: { actividad: ActividadAbiertaRow; alCambiar: () => void }) {
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cerrar = async () => {
    setGuardando(true);
    setError(null);
    try {
      await crm.editarActividad(actividad.id, { done_at: new Date().toISOString() });
      alCambiar();
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <article className="feed__item">
      <span className={`feed__dot${actividad.vencida ? ' feed__dot--danger' : ' feed__dot--success'}`} />
      <div className="feed__body" style={{ flex: 1 }}>
        <p className="feed__meta">
          <Badge tone={actividad.vencida ? 'danger' : 'neutral'}>{etiqueta(actividad.type)}</Badge>{' '}
          <strong>{actividad.title}</strong>
        </p>
        <p className="feed__meta">
          {actividad.cuenta ? (
            <Link to={`/cuentas/${actividad.client_id}`}>{actividad.cuenta}</Link>
          ) : (
            'cuenta sin nombre'
          )}{' '}
          · {actividad.due_at ? `para el ${formatoDiaHora(actividad.due_at)}` : 'sin fecha fijada'}
          {actividad.vencida ? ' · vencida' : ''}
        </p>
        {error ? <p className="small" style={{ color: 'var(--color-danger)' }}>{error}</p> : null}
      </div>
      <button
        type="button"
        className="btn btn--ghost btn--sm"
        disabled={guardando}
        onClick={() => void cerrar()}
        title="Marca done_at en la base y la actividad sale de esta lista"
      >
        <Icon name="check" size={14} /> {guardando ? 'Cerrando' : 'Cerrar'}
      </button>
    </article>
  );
}

export default function AgendaScreen() {
  const { user } = useAuth();
  const [tipo, setTipo] = useState('');
  const [soloVencidas, setSoloVencidas] = useState('');
  const [version, setVersion] = useState(0);

  const lectura = useLectura<ActividadAbiertaRow>(
    () => crm.actividades({ tipo: tipo || undefined, vencida: soloVencidas || undefined }),
    [tipo, soloVencidas, version],
    'No hay actividades pendientes con estos filtros.',
  );
  const cuentas = useLectura<CuentaRow>(() => crm.cuentas({}), [], 'Registre una cuenta antes de programar actividades.');

  const cambios = () => setVersion((v) => v + 1);

  return (
    <div>
      <div className="page-head">
        <div>
          <p className="page-head__kicker">ALYTO CRM · TRABAJO PENDIENTE</p>
          <h1 className="page-head__title">Agenda</h1>
          <p className="page-head__sub">
            Llamadas, reuniones y tareas abiertas de cada cuenta. La cadencia B2B de 14 días no está aquí: esa sale
            sola y se ve en Rutas.
          </p>
        </div>
      </div>

      <div className="section">
        {user ? <NuevaActividad cuentas={cuentas.filas} usuarioId={user.id} alCrear={cambios} /> : null}
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
          <span className="field__label">Vencidas</span>
          <select className="input" value={soloVencidas} onChange={(e) => setSoloVencidas(e.target.value)}>
            <option value="">Todas</option>
            <option value="true">Sí</option>
            <option value="false">No</option>
          </select>
        </label>
        <span className="small muted">
          {lectura.filas.length} actividad{lectura.filas.length === 1 ? '' : 'es'} abierta
          {user ? ` para ${user.email}` : ''}.
        </span>
      </div>

      {cuentas.aviso ? cuentas.aviso : null}

      {lectura.aviso ? lectura.aviso : null}
      {lectura.filas.length > 0 ? (
        <div className="feed">
          {lectura.filas.map((a) => (
            <FilaActividad key={a.id} actividad={a} alCambiar={cambios} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
