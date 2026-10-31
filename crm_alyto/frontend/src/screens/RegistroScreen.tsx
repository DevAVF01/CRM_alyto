import { useState } from 'react';
import { Link } from 'react-router-dom';
import { crm } from '../api/client';
import { useApiData } from '../hooks/useApiData';
import { useLectura } from '../components/Aviso';
import { Badge, Icon, etiqueta, formatoDiaHora, toneDeResultado } from '../components/ui';
import type { ActorKind, RegistroRow, Resultado } from '../types';

// El registro (F-15). Es la tabla audit_events leída tal cual: inmutable, con actor, acción, entidad,
// resultado y las columnas que cambiaron. No es un tablero de indicadores y por eso no está en el menú
// lateral: se abre desde la barra superior, y solo administración y cumplimiento lo pueden leer.
// Quien intenta abrirlo con otro rol recibe el 403 de la política audit_read, y la pantalla lo muestra
// en lugar de enseñar una tabla vacía que parecería "no pasó nada".

const ACTORES: ActorKind[] = ['humano', 'agente', 'sistema'];
const RESULTADOS: Resultado[] = ['exito', 'rechazado', 'error'];

function Cambio({ antes, despues }: { antes: Record<string, unknown> | null; despues: Record<string, unknown> | null }) {
  if (!antes && !despues) return null;
  return (
    <pre className="mono registro__cambio">
      {JSON.stringify({ antes, despues }, null, 2)}
    </pre>
  );
}

function FilaRegistro({ asiento }: { asiento: RegistroRow }) {
  return (
    <tr>
      <td className="mono">{asiento.id}</td>
      <td>
        {formatoDiaHora(asiento.created_at)}
        <p className="small muted">
          <Badge tone={asiento.actor_kind === 'humano' ? 'neutral' : asiento.actor_kind === 'agente' ? 'accent' : 'warning'}>
            {etiqueta(asiento.actor_kind)}
          </Badge>
        </p>
      </td>
      <td>
        {asiento.actor}
        {asiento.trace_id ? <p className="small muted mono">{asiento.trace_id}</p> : null}
      </td>
      <td>
        <span className="mono">{asiento.action}</span>
        {asiento.entity_type ? (
          <p className="small muted">
            {etiqueta(asiento.entity_type)}{' '}
            {/* El enlace solo tiene sentido cuando el asiento habla de una cuenta: una fila de
                audit_events puede referir a un mensaje o a una ruta, y esas no tienen pantalla. */}
            {asiento.entity_type === 'clients' && asiento.entity_id ? (
              <Link className="enlace mono" to={`/cuentas/${asiento.entity_id}`}>
                {asiento.entity_id.slice(0, 8)}
              </Link>
            ) : asiento.entity_id ? (
              <span className="mono">{asiento.entity_id.slice(0, 8)}</span>
            ) : null}
          </p>
        ) : null}
      </td>
      <td>
        <Badge tone={toneDeResultado(asiento.outcome)}>{etiqueta(asiento.outcome)}</Badge>
        {asiento.detail ? <p className="small">{asiento.detail}</p> : null}
        <Cambio antes={asiento.changed_before} despues={asiento.changed_after} />
      </td>
    </tr>
  );
}

export default function RegistroScreen() {
  const [actor, setActor] = useState('');
  const [actorKind, setActorKind] = useState('');
  const [accion, setAccion] = useState('');
  const [entidad, setEntidad] = useState('');
  const [resultado, setResultado] = useState('');
  const [limite, setLimite] = useState('50');

  const meta = useApiData(() => crm.meta(), null, []);

  const lectura = useLectura<RegistroRow>(
    () =>
      crm.registro({
        actor: actor || undefined,
        actorKind: actorKind || undefined,
        accion: accion || undefined,
        entidad: entidad || undefined,
        resultado: resultado || undefined,
        limite: limite || undefined,
      }),
    [actor, actorKind, accion, entidad, resultado, limite],
    'El registro no tiene asientos con estos filtros.',
  );

  return (
    <div>
      <div className="page-head">
        <div>
          <p className="page-head__kicker">ALYTO CRM · PRUEBA DE AUDITORÍA</p>
          <h1 className="page-head__title">El registro</h1>
          <p className="page-head__sub">
            Todo lo que se escribió en la base, con quién lo escribió y con qué resultado. La tabla no admite
            ediciones ni borrados: la traba está en la base, no en esta pantalla.
          </p>
        </div>
        {meta.data ? (
          <div className="card registro__identidad">
            <p className="small mono">{meta.data.usuario}</p>
            <p className="small muted">
              Rol: <Badge tone="accent">{etiqueta(meta.data.rol)}</Badge> · Lecturas habilitadas:{' '}
              {meta.data.vistas.length}
            </p>
          </div>
        ) : null}
      </div>

      {meta.error ? <p className="small" style={{ color: 'var(--color-danger)' }}>{meta.error}</p> : null}

      <div className="filtros row">
        <label className="field field--inline">
          <span className="field__label">Actor</span>
          <input
            className="input"
            value={actor}
            onChange={(e) => setActor(e.target.value)}
            placeholder="correo exacto"
          />
        </label>
        <label className="field field--inline">
          <span className="field__label">Tipo de actor</span>
          <select className="input" value={actorKind} onChange={(e) => setActorKind(e.target.value)}>
            <option value="">Todos</option>
            {ACTORES.map((a) => (
              <option key={a} value={a}>
                {etiqueta(a)}
              </option>
            ))}
          </select>
        </label>
        <label className="field field--inline">
          <span className="field__label">Acción</span>
          <input
            className="input"
            value={accion}
            onChange={(e) => setAccion(e.target.value)}
            placeholder="ej. update"
          />
        </label>
        <label className="field field--inline">
          <span className="field__label">Entidad</span>
          <input
            className="input"
            value={entidad}
            onChange={(e) => setEntidad(e.target.value)}
            placeholder="ej. conversations"
          />
        </label>
        <label className="field field--inline">
          <span className="field__label">Resultado</span>
          <select className="input" value={resultado} onChange={(e) => setResultado(e.target.value)}>
            <option value="">Todos</option>
            {RESULTADOS.map((r) => (
              <option key={r} value={r}>
                {etiqueta(r)}
              </option>
            ))}
          </select>
        </label>
        <label className="field field--inline">
          <span className="field__label">Filas</span>
          <select className="input" value={limite} onChange={(e) => setLimite(e.target.value)}>
            {['25', '50', '100', '200'].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => void lectura.recargar()}>
          <Icon name="refresh" size={14} /> Recargar
        </button>
      </div>

      <p className="small muted">
        Actor, Acción y Entidad comparan el valor completo tal como lo guarda la base; el puente no hace búsquedas por
        texto parcial.
      </p>

      {lectura.aviso ? lectura.aviso : null}

      {lectura.filas.length > 0 ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Momento</th>
                <th>Actor</th>
                <th>Acción / entidad</th>
                <th>Resultado</th>
              </tr>
            </thead>
            <tbody>
              {lectura.filas.map((a) => (
                <FilaRegistro key={a.id} asiento={a} />
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
