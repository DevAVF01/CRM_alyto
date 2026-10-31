import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { crm, mensajeDeError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Aviso, useLectura } from '../components/Aviso';
import { Badge, Icon, etiqueta, formatoDia, formatoDiaHora, horas, toneDeRuta } from '../components/ui';
import type { EstadoRuta, RutaCabecera, RutaDetalle, RutaRow, TablaRutasRow, TipoRuta, ViajeRow } from '../types';

// Rutas de vinculación: las tres columnas paralelas que el brief define como el trabajo sobre un
// mismo cliente (A documentación, B comercial, C riesgo y cupos). El embudo de seis etapas ya no es
// la estructura de la pantalla: vive dentro de la ruta comercial.
//
// Mover una ruta no es arrastrar una tarjeta. Cada movimiento deja un asiento con quién lo hizo y un
// motivo, y la base no deja bloquear ni cerrar sin explicación.

const ESTADOS: EstadoRuta[] = ['abierta', 'en_curso', 'en_espera_cliente', 'bloqueada', 'cerrada', 'cerrada_sin_resultado'];
const TIPOS: TipoRuta[] = ['documentacion', 'comercial', 'riesgo'];

// Estados que la base obliga a justificar (routes_motivo_obligatorio). Se repite acá solo para dar
// el aviso antes de intentar la escritura; si alguien lo cambia en la base, la base manda y el
// rechazo aparece en pantalla con su propio mensaje.
const pidieronMotivo = (estado: string) => ['bloqueada', 'cerrada_sin_resultado'].includes(estado);

function siguienteCodigo(tipo: TipoRuta, existentes: Pick<RutaRow, 'code'>[]): string {
  const letra = { documentacion: 'A', comercial: 'B', riesgo: 'C' }[tipo];
  const prefijo = `RT${letra}-`;
  const maximo = existentes
    .filter((r) => r.code.startsWith(prefijo))
    .reduce((acc, r) => Math.max(acc, Number(r.code.slice(prefijo.length)) || 0), 0);
  return `${prefijo}${String(maximo + 1).padStart(4, '0')}`;
}

function PanelRuta({ rutaId, alCambiar }: { rutaId: string; alCambiar: () => void }) {
  const { user } = useAuth();
  const [detalle, setDetalle] = useState<RutaDetalle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [estado, setEstado] = useState<EstadoRuta | ''>('');
  const [motivo, setMotivo] = useState('');
  const [paso, setPaso] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const data = await crm.ruta(rutaId);
      setDetalle(data);
      setEstado(data.ruta.estado);
      setPaso(data.ruta.next_step ?? '');
      setMotivo('');
    } catch (err) {
      setError(mensajeDeError(err));
      setDetalle(null);
    } finally {
      setCargando(false);
    }
  }, [rutaId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const mover = async () => {
    if (!detalle) return;
    setGuardando(true);
    setError(null);
    try {
      // next_step es detalle de la ruta B: en las rutas A y C la base lo rechaza
      // (routes_detalle_solo_comercial). Si la pantalla lo enviara siempre, mover una ruta de
      // documentacion o de riesgo con la limpieza del campo vacio seria imposible.
      const cuerpo: Record<string, string | undefined> = {
        estado,
        motivo: motivo.trim() || undefined,
      };
      if (detalle.ruta.kind === 'comercial' && paso.trim()) cuerpo.next_step = paso.trim();
      const actualizada = await crm.moverRuta(rutaId, cuerpo);
      setDetalle({ ruta: { ...detalle.ruta, ...actualizada }, asientos: detalle.asientos });
      alCambiar();
      void cargar();
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) return <Aviso tipo="cargando" texto="Leyendo la ruta y su historial..." />;
  if (error && !detalle) {
    return (
      <Aviso
        tipo="rechazo"
        texto={error}
        accion={
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => void cargar()}>
            Reintentar
          </button>
        }
      />
    );
  }
  if (!detalle) return null;

  const { ruta, asientos } = detalle;

  return (
    <section className="card">
      <div className="row row--between">
        <div>
          <p className="small muted mono">
            {ruta.code} · <Link to={`/cuentas/${ruta.client_id}`}>ver cuenta</Link>
          </p>
          <h2 className="card__title" style={{ marginBottom: 0 }}>
            {etiqueta(ruta.kind)}
          </h2>
        </div>
        <Badge tone={toneDeRuta(ruta.estado)}>{etiqueta(ruta.estado)}</Badge>
      </div>

      <div className="grid grid--2 mt-12">
        <p className="kv">
          <span className="kv__label">Abierta</span>
          <span className="kv__value">{formatoDiaHora(ruta.opened_at)}</span>
        </p>
        <p className="kv">
          <span className="kv__label">Cerrada</span>
          <span className="kv__value">{ruta.closed_at ? formatoDiaHora(ruta.closed_at) : 'sigue abierta'}</span>
        </p>
        <p className="kv">
          <span className="kv__label">Siguiente paso</span>
          <span className="kv__value">{ruta.next_step ?? 'sin definir'}</span>
        </p>
        <p className="kv">
          <span className="kv__label">Dueño</span>
          <span className="kv__value">{ruta.owner_id === user?.id ? 'usted' : ruta.owner_id ?? 'sin dueño'}</span>
        </p>
      </div>

      {(ruta.operation_type || ruta.frequency || ruta.monthly_volume_bs !== null) && ruta.kind === 'comercial' ? (
        <div className="grid grid--2 mt-8">
          <p className="kv">
            <span className="kv__label">Tipo de operación</span>
            <span className="kv__value">{ruta.operation_type ?? 'sin dato'}</span>
          </p>
          <p className="kv">
            <span className="kv__label">Frecuencia</span>
            <span className="kv__value">{ruta.frequency ?? 'sin dato'}</span>
          </p>
          <p className="kv">
            <span className="kv__label">Volumen mensual</span>
            <span className="kv__value">{ruta.monthly_volume_bs ?? 'sin dato'} Bs</span>
          </p>
        </div>
      ) : null}

      <h3 className="card__title mt-12">Mover la ruta</h3>
      {error ? <p className="small" style={{ color: 'var(--color-danger)' }}>{error}</p> : null}
      <div className="row">
        <label className="field field--inline">
          <span className="field__label">Estado</span>
          <select className="input" value={estado} onChange={(e) => setEstado(e.target.value as EstadoRuta)}>
            {ESTADOS.map((v) => (
              <option key={v} value={v}>
                {etiqueta(v)}
              </option>
            ))}
          </select>
        </label>
        <input
          className="input"
          style={{ flex: 1, minWidth: 180 }}
          value={paso}
          onChange={(e) => setPaso(e.target.value)}
          placeholder="Siguiente paso"
          aria-label="Siguiente paso"
        />
      </div>
      <label className="field mt-8">
        <span className="field__label">
          Motivo {pidieronMotivo(estado) ? '(obligatorio para bloquear o cerrar sin resultado)' : '(opcional)'}
        </span>
        <textarea
          className="input"
          rows={2}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Qué pasó y por qué la ruta se mueve. Queda en el historial."
        />
      </label>
      <button
        type="button"
        className="btn btn--primary btn--sm mt-8"
        disabled={guardando || (pidieronMotivo(estado) && !motivo.trim())}
        onClick={() => void mover()}
      >
        <Icon name="route" size={14} /> {guardando ? 'Guardando' : 'Guardar movimiento'}
      </button>
      <p className="small muted mt-8">
        El asiento del historial lo escribe la base con su propio disparador. Nadie lo redacta desde la pantalla, y
        por eso no se puede inventar.
      </p>

      <h3 className="card__title mt-12">Historial</h3>
      {asientos.length === 0 ? (
        <Aviso tipo="vacio" texto="La ruta todavía no tiene movimientos." />
      ) : (
        <div className="feed">
          {asientos.map((a) => (
            <article className="feed__item" key={a.id}>
              <span className={`feed__dot${a.to_estado === 'bloqueada' || a.to_estado === 'cerrada_sin_resultado' ? ' feed__dot--danger' : ''}`} />
              <div className="feed__body">
                <p className="feed__meta">
                  {formatoDiaHora(a.created_at)} · {a.from_estado ? `${etiqueta(a.from_estado)} → ` : 'inicio → '}
                  <Badge tone={toneDeRuta(a.to_estado)}>{etiqueta(a.to_estado)}</Badge> · {a.actor_email}
                </p>
                <p>{a.reason ?? 'sin motivo anotado'}</p>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function NuevaRuta({ clienteId, alCreada }: { clienteId: string; alCreada: () => void }) {
  const { user } = useAuth();
  const [tipo, setTipo] = useState<TipoRuta>('documentacion');
  const [abierta, setAbierta] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const existentes = useLectura<RutaRow>(() => crm.rutas({}), [], '');
  const codigo = useMemo(() => siguienteCodigo(tipo, existentes.filas), [tipo, existentes.filas]);

  const crear = async () => {
    setAbierta(true);
    setError(null);
    try {
      await crm.crearRuta({
        code: codigo,
        client_id: clienteId,
        kind: tipo,
        estado: 'abierta',
        owner_id: user?.id ?? null,
        motivo: 'Alta desde la pantalla de rutas',
      });
      alCreada();
      void existentes.recargar();
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setAbierta(false);
    }
  };

  return (
    <section className="card">
      <h2 className="card__title">Abrir una ruta a una cuenta</h2>
      <div className="row">
        <label className="field field--inline">
          <span className="field__label">Tipo</span>
          <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value as TipoRuta)}>
            {TIPOS.map((v) => (
              <option key={v} value={v}>
                {etiqueta(v)}
              </option>
            ))}
          </select>
        </label>
        <span className="small muted mono">código propuesto: {codigo}</span>
      </div>
      {error ? <p className="small" style={{ color: 'var(--color-danger)' }}>{error}</p> : null}
      <button type="button" className="btn btn--primary btn--sm" disabled={abierta} onClick={() => void crear()}>
        <Icon name="plus" size={14} /> {abierta ? 'Abriendo' : 'Abrir ruta'}
      </button>
      <p className="small muted mt-8">
        Las tres rutas pueden correr a la vez sobre la misma cuenta. El código lo propone la pantalla a partir de los
        que ya existen y la base lo valida: si alguien abre la misma ruta dos veces, la base lo rechaza.
      </p>
    </section>
  );
}

export default function RutasScreen() {
  const [pestana, setPestana] = useState<'rutas' | 'tablero' | 'viajes'>('rutas');
  const [tipo, setTipo] = useState('');
  const [estado, setEstado] = useState('');
  const [seleccionada, setSeleccionada] = useState<string | null>(null);
  const [nuevaPara, setNuevaPara] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const lectura = useLectura<RutaRow>(
    () => crm.rutas({ tipo: tipo || undefined, estado: estado || undefined }),
    [tipo, estado, version],
    'No hay rutas con estos filtros para este rol.',
  );
  const tablero = useLectura<TablaRutasRow>(() => crm.tableroRutas(), [version], 'Ninguna cuenta tiene rutas abiertas.');
  const viajes = useLectura<ViajeRow>(() => crm.viajes({}), [version], 'Ningún paso de cadencia vencido: nada que tocar hoy.');

  const activa = useMemo(
    () => lectura.filas.find((r) => r.id === seleccionada) ?? null,
    [lectura.filas, seleccionada],
  );

  return (
    <div>
      <div className="page-head">
        <div>
          <p className="page-head__kicker">ALYTO CRM · VINCULACIÓN</p>
          <h1 className="page-head__title">Rutas</h1>
          <p className="page-head__sub">
            Documentación, comercial y riesgo en paralelo sobre la misma cuenta, cada una con su historial.
          </p>
        </div>
        <button
          type="button"
          className="btn btn--primary btn--sm"
          disabled={!lectura.filas.length && !tablero.filas.length}
          onClick={() => {
            const cuenta = activa?.client_id ?? lectura.filas[0]?.client_id ?? tablero.filas[0]?.client_id ?? null;
            setNuevaPara(cuenta);
          }}
        >
          <Icon name="plus" size={14} /> Nueva ruta
        </button>
      </div>

      {nuevaPara ? (
        <div className="section">
          <NuevaRuta
            clienteId={nuevaPara}
            alCreada={() => {
              setNuevaPara(null);
              setVersion((v) => v + 1);
            }}
          />
        </div>
      ) : null}

      <div className="tabs" role="tablist">
        <button type="button" className={`tab${pestana === 'rutas' ? ' tab--active' : ''}`} onClick={() => setPestana('rutas')}>
          Rutas <span className="tab__numero">{lectura.filas.length}</span>
        </button>
        <button type="button" className={`tab${pestana === 'tablero' ? ' tab--active' : ''}`} onClick={() => setPestana('tablero')}>
          Por cuenta <span className="tab__numero">{tablero.filas.length}</span>
        </button>
        <button type="button" className={`tab${pestana === 'viajes' ? ' tab--active' : ''}`} onClick={() => setPestana('viajes')}>
          Cadencia <span className="tab__numero">{viajes.filas.length}</span>
        </button>
      </div>

      {pestana === 'rutas' ? (
        <>
          <div className="filtros row">
            <label className="field field--inline">
              <span className="field__label">Tipo</span>
              <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
                <option value="">Todos</option>
                {TIPOS.map((v) => (
                  <option key={v} value={v}>
                    {etiqueta(v)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field field--inline">
              <span className="field__label">Estado</span>
              <select className="input" value={estado} onChange={(e) => setEstado(e.target.value)}>
                <option value="">Todos</option>
                {ESTADOS.map((v) => (
                  <option key={v} value={v}>
                    {etiqueta(v)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {lectura.aviso ? lectura.aviso : null}
          {lectura.filas.length > 0 ? (
            <div className="client-layout section">
              <div className="client-list" aria-label="Lista de rutas">
                {lectura.filas.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className={`client-list__item${r.id === seleccionada ? ' client-list__item--active' : ''}`}
                    onClick={() => setSeleccionada(r.id)}
                  >
                    <span className="client-list__name">{r.cliente}</span>
                    <br />
                    <span className="client-list__id mono">
                      {r.code} · {etiqueta(r.kind)}
                    </span>
                    <p className="small muted">
                      {formatoDia(r.opened_at)} · {horas(r.horas_habiles_en_el_estado)} en este estado
                    </p>
                    <Badge tone={toneDeRuta(r.estado)}>{etiqueta(r.estado)}</Badge>
                    {r.motivo ? <p className="small muted">{r.motivo}</p> : null}
                  </button>
                ))}
              </div>
              {activa ? (
                <PanelRuta key={activa.id} rutaId={activa.id} alCambiar={() => setVersion((v) => v + 1)} />
              ) : (
                <Aviso tipo="vacio" texto="Elija una ruta de la lista para ver su historial y moverla." />
              )}
            </div>
          ) : null}
        </>
      ) : null}

      {pestana === 'tablero' ? (
        <>
          {tablero.aviso ? tablero.aviso : null}
          {tablero.filas.length > 0 ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Cuenta</th>
                    <th>Tipo</th>
                    <th>Abiertas</th>
                    <th>En curso</th>
                    <th>Esperando cliente</th>
                    <th>Bloqueadas</th>
                    <th>A</th>
                    <th>B</th>
                    <th>C</th>
                  </tr>
                </thead>
                <tbody>
                  {tablero.filas.map((t) => (
                    <tr key={t.client_id}>
                      <td>
                        <Link to={`/cuentas/${t.client_id}`}>{t.cliente}</Link>
                      </td>
                      <td>{etiqueta(t.account_type)}</td>
                      <td className="table__num">{t.rutas_abiertas}</td>
                      <td className="table__num">{t.en_curso}</td>
                      <td className="table__num">{t.esperando_cliente}</td>
                      <td className="table__num">
                        {t.bloqueadas > 0 ? <Badge tone="danger">{t.bloqueadas}</Badge> : t.bloqueadas}
                      </td>
                      <td className="table__num">{t.tiene_documentacion}</td>
                      <td className="table__num">{t.tiene_comercial}</td>
                      <td className="table__num">{t.tiene_riesgo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      ) : null}

      {pestana === 'viajes' ? (
        <>
          <p className="small muted">
            El paso pendiente más próximo de cada cadencia activa, con su fecha. La columna vencido es la que dice qué
            hay que tocar hoy; el motor que ejecuta los pasos todavía no está montado.
          </p>
          {viajes.aviso ? viajes.aviso : null}
          {viajes.filas.length > 0 ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Cadencia</th>
                    <th>Cuenta</th>
                    <th>Paso</th>
                    <th>Día</th>
                    <th>Canal</th>
                    <th>Plantilla</th>
                    <th>Programado</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {viajes.filas.map((v) => (
                    <tr key={`${v.enrollment_id}-${v.step_order}`}>
                      <td className="mono">{v.cadencia}</td>
                      <td>
                        <Link to={`/cuentas/${v.client_id}`}>{v.cliente}</Link>
                      </td>
                      <td className="table__num">{v.step_order}</td>
                      <td className="table__num">{v.day_number}</td>
                      <td>{etiqueta(v.channel)}</td>
                      <td className="mono">{v.template_code}</td>
                      <td>{formatoDia(v.scheduled_for)}</td>
                      <td>
                        <Badge tone={v.vencido ? 'danger' : v.estado_ejecucion === 'enviado' ? 'success' : 'neutral'}>
                          {etiqueta(v.estado_ejecucion)}
                          {v.vencido ? ' · vencido' : ''}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export type { RutaCabecera };
