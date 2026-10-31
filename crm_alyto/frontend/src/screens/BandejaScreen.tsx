import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { crm, mensajeDeError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Aviso, useLectura } from '../components/Aviso';
import {
  Badge,
  Icon,
  etiqueta,
  formatoDiaHora,
  formatoHora,
  horas,
  toneDeEstadoHilo,
  toneDeMensaje,
} from '../components/ui';
import type { BadgeTone } from '../components/ui';
import type {
  BandejaRow,
  BanderaRow,
  Canal,
  CategoriaConsulta,
  EntradaResultado,
  EstadoHilo,
  HiloDetalle,
  NotaRow,
  PlantillaRow,
  SalidaRow,
  SenalRow,
  SlaRow,
} from '../types';

// Bandeja: la pantalla principal del CRM. Cinco lecturas de la misma base sobre el trabajo de hoy,
// y el hilo de la conversación seleccionada con su compositor.
//
// Nada de lo que se muestra acá viene de un archivo de datos ficticios. Cada número de las pestañas
// es la cantidad de filas que la base devolvió para el usuario que entró, con sus permisos.

const CANALES: Canal[] = ['whatsapp', 'correo', 'chat_app', 'web_chat', 'formulario', 'telefonica', 'interno'];
const ESTADOS: EstadoHilo[] = ['abierta', 'en_espera_cliente', 'en_espera_agente', 'resuelta', 'cerrada', 'spam'];
const MOTIVOS: CategoriaConsulta[] = [
  'soporte_tecnico', 'registro_kyc', 'empresa_b2b', 'reclamo', 'consulta_saldo', 'otro',
];

type Pestana = 'trabajo' | 'sla' | 'salida' | 'banderas' | 'senales';

const PESTANAS: { id: Pestana; label: string }[] = [
  { id: 'trabajo', label: 'Conversaciones' },
  { id: 'sla', label: 'Nivel de servicio' },
  { id: 'salida', label: 'Salida' },
  { id: 'banderas', label: 'Banderas' },
  { id: 'senales', label: 'Señales' },
];

function Conteo({ n, texto }: { n: number; texto: string }) {
  return (
    <p className="small muted contador">
      {n} {texto}
    </p>
  );
}

function FiltroSelect<T extends string>({
  etiqueta: titulo,
  valores,
  valor,
  cambiar,
  nombre,
}: {
  etiqueta: string;
  valores: readonly T[];
  valor: string;
  cambiar: (v: string) => void;
  nombre: string;
}) {
  return (
    <label className="field field--inline">
      <span className="field__label">{titulo}</span>
      <select className="input" name={nombre} value={valor} onChange={(e) => cambiar(e.target.value)}>
        <option value="">Todos</option>
        {valores.map((v) => (
          <option key={v} value={v}>
            {etiqueta(v)}
          </option>
        ))}
      </select>
    </label>
  );
}

function Filtros({
  canal,
  setCanal,
  estado,
  setEstado,
  cola,
  setCola,
}: {
  canal: string;
  setCanal: (v: string) => void;
  estado: string;
  setEstado: (v: string) => void;
  cola: string;
  setCola: (v: string) => void;
}) {
  return (
    <div className="filtros row">
      <FiltroSelect etiqueta="Canal" valores={CANALES} valor={canal} cambiar={setCanal} nombre="canal" />
      <FiltroSelect etiqueta="Estado" valores={ESTADOS} valor={estado} cambiar={setEstado} nombre="estado" />
      <label className="field field--inline">
        <span className="field__label">Cola</span>
        <input className="input" name="cola" value={cola} onChange={(e) => setCola(e.target.value)} placeholder="soporte, kyc, b2b" />
      </label>
    </div>
  );
}

// Una nota del equipo sobre el hilo: la diferencia entre "el cliente dijo" y "nosotros apuntamos".
// No es un mensaje. La base exige que el canal de un mensaje sea el del hilo y todo mensaje entrante
// reactiva el nivel de servicio del hilo, asi que la nota se archiva como actividad de tipo 'nota':
// queda en la cronologia de la cuenta, no en la conversacion, y no se confunde con una respuesta del
// cliente. Pasa el filtro de marca porque el texto lo escribimos nosotros.
function NotaInterna({ hiloId, alCambiar }: { hiloId: string; alCambiar: () => void }) {
  const [texto, setTexto] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const notas = useLectura<NotaRow>(
    () => crm.notas({ hilo: hiloId, tipo: 'nota' }),
    [hiloId, version],
    'Sin notas del equipo en este hilo.',
  );

  const guardar = async () => {
    setGuardando(true);
    setFallo(null);
    try {
      await crm.anotarNota(hiloId, { body: texto.trim() });
      setTexto('');
      setVersion((v) => v + 1);
      alCambiar();
    } catch (err) {
      setFallo(mensajeDeError(err));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="mt-12">
      <div className="row">
        <textarea
          className="input"
          rows={2}
          style={{ flex: 1 }}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Nota interna: lo que el equipo apunta sobre este hilo. No se envia al cliente."
          aria-label="Nota interna"
        />
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          disabled={guardando || !texto.trim()}
          onClick={() => void guardar()}
        >
          {guardando ? 'Anotando' : 'Anotar nota'}
        </button>
      </div>
      {fallo ? <p className="small" style={{ color: 'var(--color-danger)' }}>{fallo}</p> : null}

      {notas.filas.length > 0 ? (
        <div className="feed mt-8">
          {notas.filas.map((n) => (
            <article className="feed__item" key={n.id}>
              <span className="feed__dot" />
              <div className="feed__body">
                <p className="feed__meta">Nota del equipo · {formatoDiaHora(n.created_at)}</p>
                <p>{n.body ?? n.title}</p>
              </div>
            </article>
          ))}
        </div>
      ) : notas.aviso}
    </div>
  );
}

// --------------------------------------------------------------------- hilo y compositor
function HiloPanel({ hiloId, alCambiar }: { hiloId: string; alCambiar: () => void }) {
  const { user } = useAuth();
  const [hilo, setHilo] = useState<HiloDetalle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [guardandoEstado, setGuardandoEstado] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      setHilo(await crm.hilo(hiloId));
    } catch (err) {
      setError(mensajeDeError(err));
      setHilo(null);
    } finally {
      setCargando(false);
    }
  }, [hiloId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const lecturaPlantillas = useLectura<PlantillaRow>(
    () => (hilo ? crm.plantillas({ canal: hilo.conversacion.channel }) : Promise.resolve([])),
    [hilo?.conversacion.channel],
    'Sin plantillas aprobadas para este canal.',
  );

  const enviar = async () => {
    if (!texto.trim()) return;
    setEnviando(true);
    try {
      const mensaje = await crm.responder(hiloId, { body: texto.trim() });
      setHilo((prev) => (prev ? { ...prev, mensajes: [...prev.mensajes, mensaje] } : prev));
      setTexto('');
      alCambiar();
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setEnviando(false);
    }
  };

  const cambiarEstado = async (nuevo: EstadoHilo) => {
    setGuardandoEstado(true);
    setError(null);
    try {
      // resolved_at va en la misma orden que el estado: la base no lo pone sola y un hilo cerrado
      // sin momento de cierre no se puede auditar ni medir.
      const conversacion = await crm.editarHilo(hiloId, {
        status: nuevo,
        resolved_at: ['resuelta', 'cerrada'].includes(nuevo) ? new Date().toISOString() : null,
      });
      setHilo((prev) => (prev ? { ...prev, conversacion } : prev));
      alCambiar();
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setGuardandoEstado(false);
    }
  };

  const asignarme = async () => {
    setGuardandoEstado(true);
    setError(null);
    try {
      const conversacion = await crm.editarHilo(hiloId, { assignee_id: user?.id ?? null });
      setHilo((prev) => (prev ? { ...prev, conversacion } : prev));
      alCambiar();
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setGuardandoEstado(false);
    }
  };

  if (cargando) return <Aviso tipo="cargando" texto="Leyendo el hilo..." />;
  if (error && !hilo) return <Aviso tipo="rechazo" texto={error} accion={<button type="button" className="btn btn--ghost btn--sm" onClick={() => void cargar()}>Reintentar</button>} />;
  if (!hilo) return null;

  const { conversacion, mensajes } = hilo;
  const cerrado = ['resuelta', 'cerrada', 'archivada'].includes(conversacion.status);

  return (
    <section className="card hilo">
      <div className="hilo__head row row--between">
        <div>
          <p className="small muted">
            <Link to={`/cuentas/${conversacion.client_id}`}>{etiqueta(conversacion.channel)}</Link>
            {' · '}
            {conversacion.queue}
            {' · '}
            {etiqueta(conversacion.query_category)}
          </p>
          <h2 className="card__title" style={{ marginBottom: 0 }}>
            {conversacion.subject ?? 'Conversación sin asunto'}
          </h2>
        </div>
        <div className="row">
          <Badge tone={toneDeEstadoHilo(conversacion.status)}>{etiqueta(conversacion.status)}</Badge>
          <select
            className="input"
            style={{ height: 34, width: 'auto' }}
            value={conversacion.status}
            disabled={guardandoEstado}
            onChange={(e) => void cambiarEstado(e.target.value as EstadoHilo)}
            aria-label="Cambiar estado del hilo"
          >
            {ESTADOS.map((v) => (
              <option key={v} value={v}>{etiqueta(v)}</option>
            ))}
          </select>
          <button type="button" className="btn btn--ghost btn--sm" disabled={guardandoEstado} onClick={() => void asignarme()}>
            <Icon name="key" size={14} /> Asignarme
          </button>
        </div>
      </div>

      {error ? <p className="small" style={{ color: 'var(--color-danger)' }}>{error}</p> : null}

      <div className="feed">
        {mensajes.length === 0 ? (
          <Aviso tipo="vacio" texto="El hilo no tiene mensajes. Todo lo que se responda queda aquí, en orden." />
        ) : (
          mensajes.map((m) => (
            <article key={m.id} className={`hilo__msg hilo__msg--${m.direction}`}>
              <p className="hilo__meta">
                <strong>{m.sender_label ?? (m.direction === 'saliente' ? 'Alyto' : 'Cliente')}</strong>
                {' · '}
                {formatoDiaHora(m.sent_at)}
                {' · '}
                <Badge tone={toneDeMensaje(m.status)}>{etiqueta(m.status)}</Badge>
                {m.attempts > 0 ? <span> · {m.attempts} intentos</span> : null}
              </p>
              <p className="hilo__texto">{m.body}</p>
              {m.last_error ? <p className="small muted">El canal devolvió: {m.last_error}</p> : null}
            </article>
          ))
        )}
      </div>

      {cerrado ? (
        <p className="small muted mt-8">
          La conversación está {etiqueta(conversacion.status).toLowerCase()}. Cámbiele el estado a abierta para poder
          responder; el CRM no escribe mensajes sobre un hilo cerrado.
        </p>
      ) : (
        <>
          <div className="composer mt-12">
            <textarea
              className="input composer__campo"
              rows={3}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Respuesta para el cliente. El filtro de términos de marca corre antes de guardar."
              aria-label="Redactar respuesta"
            />
            <button type="button" className="btn btn--primary" disabled={!texto.trim() || enviando} onClick={() => void enviar()}>
              <Icon name="send" size={15} /> {enviando ? 'Guardando' : 'Responder'}
            </button>
          </div>
          <p className="small muted mt-8">
            El mensaje se guarda en cola de salida. Mientras el conector del canal no esté montado, la entrega real
            queda pendiente y se ve en la pestaña Salida.
          </p>
          <NotaInterna hiloId={hiloId} alCambiar={alCambiar} />
        </>
      )}

      {!cerrado && lecturaPlantillas.filas.length > 0 ? (
        <div className="mt-12">
          <p className="small muted">Plantillas aprobadas para {etiqueta(conversacion.channel).toLowerCase()}</p>
          <div className="chip-row">
            {lecturaPlantillas.filas.map((t) => (
              <button key={t.id} type="button" className="chip" onClick={() => setTexto(t.body)} title={t.code}>
                {t.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

// --------------------------------------------------------------------- la entrada anotada
// El archivador hecho pantalla (paso 3). Mientras el canal real no esté conectado, esta es la forma
// honesta de que un mensaje de un cliente entre al CRM: el agente anota lo que leyó, con el numero o
// el correo de quien lo mando, y la base decide la cuenta, el hilo y la cola. No se elige la cola a
// mano porque la regla de enrutamiento vive en la base, y permitir elegirla seria dejar que alguien
// se salte su propio guardarraíl.
function FormularioEntrada({ alArchivar }: { alArchivar: (resultado: EntradaResultado) => void }) {
  const { user } = useAuth();
  const [abierto, setAbierto] = useState(false);
  const [canal, setCanal] = useState<Canal>('whatsapp');
  const [motivo, setMotivo] = useState<CategoriaConsulta>('soporte_tecnico');
  const [telefono, setTelefono] = useState('');
  const [correo, setCorreo] = useState('');
  const [nombre, setNombre] = useState('');
  const [asunto, setAsunto] = useState('');
  const [texto, setTexto] = useState('');
  const [meLoTomo, setMeLoTomo] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const puedeGuardar = texto.trim().length > 0 && (telefono.trim() || correo.trim());

  const archivar = async () => {
    setGuardando(true);
    setError(null);
    try {
      const resultado = await crm.anotarEntrada({
        channel: canal,
        query_category: motivo,
        telefono: telefono.trim() || undefined,
        correo: correo.trim() || undefined,
        client_name: nombre.trim() || undefined,
        subject: asunto.trim() || undefined,
        body: texto.trim(),
        dueno_email: meLoTomo ? user?.email : undefined,
      });
      alArchivar(resultado);
      setTexto('');
      setAsunto('');
      setAbierto(false);
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <section className="card">
      <div className="row row--between">
        <button type="button" className="btn btn--primary btn--sm" onClick={() => setAbierto((v) => !v)}>
          <Icon name="plus" size={14} /> Anotar entrada
        </button>
        <p className="small muted" style={{ margin: 0, maxWidth: 460 }}>
          El mensaje entra como recibido. La cola y la urgencia las pone la regla de enrutamiento de la base
          segun el motivo, no quien lo anota.
        </p>
      </div>

      {!abierto ? null : (
        <div className="mt-12">
          <div className="row">
            <label className="field field--inline">
              <span className="field__label">Canal</span>
              <select className="input" value={canal} onChange={(e) => setCanal(e.target.value as Canal)}>
                {CANALES.map((c) => (
                  <option key={c} value={c}>{etiqueta(c)}</option>
                ))}
              </select>
            </label>
            <label className="field field--inline">
              <span className="field__label">Motivo</span>
              <select className="input" value={motivo} onChange={(e) => setMotivo(e.target.value as CategoriaConsulta)}>
                {MOTIVOS.map((m) => (
                  <option key={m} value={m}>{etiqueta(m)}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="row">
            <label className="field field--inline" style={{ flex: 1 }}>
              <span className="field__label">Teléfono del cliente</span>
              <input
                className="input"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="+591 71234567 o 71234567"
                aria-label="Teléfono del cliente"
              />
            </label>
            <label className="field field--inline" style={{ flex: 1 }}>
              <span className="field__label">o correo</span>
              <input
                className="input"
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
                placeholder="cliente@correo.com"
                aria-label="Correo del cliente"
              />
            </label>
          </div>

          {telefono.trim() && correo.trim() ? (
            <p className="small muted" style={{ marginTop: 0 }}>
              Los dos campos están escritos: la base busca la ficha por el correo. Si ese correo no
              existe pero el teléfono sí, el mensaje se archiva en la cuenta del teléfono y se le
              agrega el correo como contacto — no se crea una ficha paralela.
            </p>
          ) : null}

          <div className="row">
            <label className="field field--inline" style={{ flex: 1 }}>
              <span className="field__label">Nombre (si no está en el CRM)</span>
              <input
                className="input"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="para crear la ficha mínima"
                aria-label="Nombre del cliente"
              />
            </label>
            <label className="field field--inline" style={{ flex: 1 }}>
              <span className="field__label">Asunto (opcional)</span>
              <input className="input" value={asunto} onChange={(e) => setAsunto(e.target.value)} />
            </label>
          </div>

          <label className="field">
            <span className="field__label">Lo que escribió el cliente</span>
            <textarea
              className="input"
              rows={3}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Transcriba el mensaje tal como llegó. El texto del cliente no pasa por el filtro de marca: es registro, no una salida nuestra."
              aria-label="Mensaje entrante"
            />
          </label>

          <label className="field field--inline mt-8">
            <input type="checkbox" checked={meLoTomo} onChange={(e) => setMeLoTomo(e.target.checked)} />
            <span className="field__label">Me tomo el hilo ({user?.email ?? 'sin sesión'})</span>
          </label>
          <p className="small muted" style={{ marginTop: 0 }}>
            Conviene dejarlo marcado: la base solo deja responder un hilo a quien lo tiene asignado. Sin
            dueño, lo puede mover únicamente administración o cumplimiento.
          </p>

          {error ? <p className="small" style={{ color: 'var(--color-danger)' }}>{error}</p> : null}

          <button
            type="button"
            className="btn btn--navy btn--sm"
            disabled={guardando || !puedeGuardar}
            onClick={() => void archivar()}
          >
            <Icon name="inbox" size={14} /> {guardando ? 'Archivando' : 'Archivar la entrada'}
          </button>
          <p className="small muted mt-8">
            Si el numero no esta en el CRM hace falta el nombre: la ficha minima se crea con el canal de contacto y
            el motivo de la consulta, y la ficha del ECP la completa Cumplimiento desde su pantalla.
          </p>
        </div>
      )}
    </section>
  );
}

// --------------------------------------------------------------------- conversaciones
function TrabajoView({
  alCambiar,
  alContar,
  version,
  seleccionado,
  elegir,
  entrada,
}: {
  alCambiar: () => void;
  alContar: (n: number) => void;
  version: number;
  seleccionado: string | null;
  elegir: (id: string) => void;
  entrada: EntradaResultado | null;
}) {
  const [canal, setCanal] = useState('');
  const [estado, setEstado] = useState('');
  const [cola, setCola] = useState('');

  const lectura = useLectura<BandejaRow>(
    () => crm.bandeja({ canal: canal || undefined, estado: estado || undefined, cola: cola || undefined }),
    [canal, estado, cola, version],
    'Ninguna conversación con estos filtros y este rol. Con "Anotar entrada" se archiva lo que un cliente ' +
      'escribió por un canal todavía no conectado.',
  );

  useEffect(() => {
    if (!lectura.cargando && !lectura.error) alContar(lectura.filas.length);
  }, [lectura.cargando, lectura.error, lectura.filas.length, alContar]);

  const filas = lectura.filas;
  const activo = useMemo(() => filas.find((f) => f.id === seleccionado) ?? null, [filas, seleccionado]);

  // Lo que el archivador hizo, dicho con las tres cosas que le importan a quien mira: donde quedo el
  // mensaje, si hubo que crear la ficha y si hubo que abrir el hilo.
  const resumenEntrada = entrada?.hilo
    ? `Entrada archivada${entrada.abrioHilo ? ' e hilo abierto' : ''} en la cola "${entrada.hilo.queue}"` +
      `${entrada.creoCuenta ? `, con la ficha de ${entrada.cuenta?.display_name ?? 'el cliente'} creada` : ''}` +
      ` · estado ${etiqueta(entrada.mensaje.status).toLowerCase()}`
    : null;

  return (
    <>
      {resumenEntrada ? (
        <div className="mt-8">
          <Aviso
            tipo="vacio"
            texto={resumenEntrada}
            accion={
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => elegir(entrada?.hilo?.id ?? '')}>
                <Icon name="eye" size={14} /> Abrir el hilo
              </button>
            }
          />
          {(entrada?.avisos ?? []).map((aviso) => (
            <p className="small muted" key={aviso}>{aviso}</p>
          ))}
        </div>
      ) : null}
      <Filtros canal={canal} setCanal={setCanal} estado={estado} setEstado={setEstado} cola={cola} setCola={setCola} />
      <Conteo n={filas.length} texto={filas.length === 1 ? 'conversación' : 'conversaciones'} />
      {lectura.aviso ? lectura.aviso : null}
      {filas.length > 0 ? (
        <div className="client-layout section">
          <div className="client-list" role="listbox" aria-label="Lista de conversaciones">
            {filas.map((f) => (
              <button
                key={f.id}
                type="button"
                className={`client-list__item${f.id === seleccionado ? ' client-list__item--active' : ''}`}
                onClick={() => elegir(f.id)}
              >
                <span className="client-list__name">{f.cliente}</span>
                <br />
                <span className="client-list__id mono">{etiqueta(f.channel)} · {f.queue}</span>
                <p className="small muted">{f.ultimo_mensaje ?? 'sin texto'}</p>
                <p className="small muted">
                  {formatoDiaHora(f.momento_ultimo_mensaje)} · {etiqueta(f.direccion_ultimo_mensaje ?? '')} ·{' '}
                  {f.messages_count} msj
                </p>
                <Badge tone={toneDeEstadoHilo(f.status)}>{etiqueta(f.status)}</Badge>
                {' '}
                <Badge tone={f.asignado_a ? 'accent' : 'neutral'}>{f.asignado_a ?? 'sin asignar'}</Badge>
              </button>
            ))}
          </div>
          {activo ? (
            <HiloPanel key={activo.id} hiloId={activo.id} alCambiar={alCambiar} />
          ) : (
            <Aviso tipo="vacio" texto="Elija una conversación de la lista para ver su hilo y responder." />
          )}
        </div>
      ) : null}
    </>
  );
}

// --------------------------------------------------------------------- nivel de servicio
function SlaView({ alContar }: { alContar: (n: number) => void }) {
  const [canal, setCanal] = useState('');
  const [vencida, setVencida] = useState('');
  const lectura = useLectura<SlaRow>(
    () => crm.sla({ canal: canal || undefined, vencida: vencida || undefined }),
    [canal, vencida],
    'Ningún hilo pendiente dentro del plazo de dos horas.',
  );
  useEffect(() => {
    if (!lectura.cargando && !lectura.error) alContar(lectura.filas.length);
  }, [lectura.cargando, lectura.error, lectura.filas.length, alContar]);

  return (
    <>
      <div className="filtros row">
        <FiltroSelect etiqueta="Canal" valores={CANALES} valor={canal} cambiar={setCanal} nombre="canal-sla" />
        <label className="field field--inline">
          <span className="field__label">Vencida</span>
          <select className="input" value={vencida} onChange={(e) => setVencida(e.target.value)}>
            <option value="">Todas</option>
            <option value="true">Vencidas</option>
            <option value="false">En plazo</option>
          </select>
        </label>
      </div>
      <p className="small muted">
        El plazo y el horario de atención los define la base. Las horas que se leen acá son horas hábiles, no
        corridas.
      </p>
      <Conteo n={lectura.filas.length} texto="conversaciones medidas" />
      {lectura.aviso ? lectura.aviso : null}
      {lectura.filas.length > 0 ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Canal</th>
                <th>Estado</th>
                <th>Último entrante</th>
                <th>Horas hábiles sin atención</th>
                <th>Vence</th>
              </tr>
            </thead>
            <tbody>
              {lectura.filas.map((f) => (
                <tr key={f.id}>
                  <td>
                    <Link to={`/cuentas/${f.client_id}`}>{f.cliente}</Link>
                  </td>
                  <td>{etiqueta(f.channel)}</td>
                  <td>
                    <Badge tone={toneDeEstadoHilo(f.status)}>{etiqueta(f.status)}</Badge>
                  </td>
                  <td>{formatoDiaHora(f.last_inbound_at)}</td>
                  <td>
                    <Badge tone={f.vencida ? 'danger' : 'warning'}>{horas(f.horas_habiles_sin_atencion)}</Badge>
                  </td>
                  <td>{f.vence_en ? formatoDiaHora(f.vence_en) : 'sin plazo'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}

// --------------------------------------------------------------------- salida y banderas
function SalidaView({ alContar, abrirHilo }: { alContar: (n: number) => void; abrirHilo: (id: string) => void }) {
  const lectura = useLectura<SalidaRow>(() => crm.salida(), [], 'No hay mensajes esperando al conector del canal.');
  useEffect(() => {
    if (!lectura.cargando && !lectura.error) alContar(lectura.filas.length);
  }, [lectura.cargando, lectura.error, lectura.filas.length, alContar]);

  return (
    <>
      <p className="small muted">
        Messages que el CRM dejó escritos y que todavía no salieron por un canal real. Un estado entregado o leído
        solo llega cuando el conector confirme la entrega.
      </p>
      <Conteo n={lectura.filas.length} texto="mensajes en espera" />
      {lectura.aviso ? lectura.aviso : null}
      {lectura.filas.length > 0 ? (
        <div className="feed">
          {lectura.filas.map((m) => (
            <article className="feed__item" key={m.message_id}>
              <span className={`feed__dot${m.status === 'fallido' ? ' feed__dot--danger' : ''}`} />
              <div className="feed__body">
                <p className="feed__meta">
                  <Link to={`/cuentas/${m.client_id}`}>{m.cliente}</Link> · {etiqueta(m.channel)} ·{' '}
                  {formatoDiaHora(m.sent_at)} · <Badge tone={toneDeMensaje(m.status)}>{etiqueta(m.status)}</Badge>
                  {' · '}
                  <button type="button" className="enlace" onClick={() => abrirHilo(m.conversation_id)}>
                    Ver hilo
                  </button>
                </p>
                <p>{m.body}</p>
                {m.last_error ? <p className="small muted">{m.last_error}</p> : null}
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </>
  );
}

function BanderasView({ alContar, abrirHilo }: { alContar: (n: number) => void; abrirHilo: (id: string) => void }) {
  const lectura = useLectura<BanderaRow>(() => crm.banderas(), [], 'Ningún mensaje del periodo trae términos en advertencia.');
  useEffect(() => {
    if (!lectura.cargando && !lectura.error) alContar(lectura.filas.length);
  }, [lectura.cargando, lectura.error, lectura.filas.length, alContar]);

  return (
    <>
      <p className="small muted">
        La severidad bloqueo no deja escribir. Lo que se ve acá es la severidad advertencia: pasó, y queda a la vista
        para corregirla en la siguiente respuesta.
      </p>
      <Conteo n={lectura.filas.length} texto="mensajes con advertencia" />
      {lectura.aviso ? lectura.aviso : null}
      {lectura.filas.length > 0 ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Cuándo</th>
                <th>Dirección</th>
                <th>Término</th>
                <th>Sugerencia del glosario</th>
                <th>Hilo</th>
              </tr>
            </thead>
            <tbody>
              {lectura.filas.map((b) => (
                <tr key={b.message_id}>
                  <td>{formatoDiaHora(b.sent_at)}</td>
                  <td>{etiqueta(b.direction)}</td>
                  <td className="mono">{b.term}</td>
                  <td>{b.suggestion ?? 'sin sugerencia'}</td>
                  <td>
                    <button type="button" className="enlace" onClick={() => abrirHilo(b.conversation_id)}>
                      Ver hilo
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}

function SenalesView({ alContar, abrirHilo }: { alContar: (n: number) => void; abrirHilo: (id: string) => void }) {
  const [tipo, setTipo] = useState('');
  const [toque, setToque] = useState(0);
  const [corriendo, setCorriendo] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const lectura = useLectura<SenalRow>(
    () => crm.senales({ tipo: tipo || undefined }),
    [tipo, toque],
    'No hay señales abiertas: ningún viaje esperando su paso.',
  );
  useEffect(() => {
    if (!lectura.cargando && !lectura.error) alContar(lectura.filas.length);
  }, [lectura.cargando, lectura.error, lectura.filas.length, alContar]);

  // La corrida manual del motor: el administrador no tiene que esperar el ciclo de minuto y
  // medio para ver el efecto. El motor respeta su propia traba: si ya esta corriendo, dice.
  const { user } = useAuth();

  const correrMotor = async () => {
    setCorriendo(true);
    setFallo(null);
    setResultado(null);
    try {
      const resultado = await crm.corridaMotor();
      if (!resultado.resumen) {
        setFallo(resultado.motivo === 'CORRIDA_EN_CURSO'
          ? 'El motor ya esta corriendo en este momento; prueba de nuevo en unos segundos.'
          : 'El motor no tiene base configurada: no corre viajes.');
      } else {
        const r = resultado.resumen;
        setResultado(
          `Corrida del motor: ${r.senales_consumidas} señales consumidas · ` +
          `${r.inscripciones} inscripciones · ${r.mensajes_en_cola} mensajes en cola · ` +
          `${r.fallidos} fallos. Revisa la Bandeja de salida y el Registro.`,
        );
      }
      setToque((t) => t + 1);
    } catch (err) {
      setFallo(mensajeDeError(err));
    } finally {
      setCorriendo(false);
    }
  };

  const tono: Record<string, BadgeTone> = {
    reclamo_recibido: 'danger',
    documento_observado: 'warning',
    consulta_sin_responder: 'warning',
    datos_incompletos: 'neutral',
    documento_por_vencer: 'accent',
    sin_respuesta_cliente: 'neutral',
  };

  return (
    <>
      <div className="filtros row">
        <label className="field field--inline">
          <span className="field__label">Tipo de señal</span>
          <input className="input" value={tipo} onChange={(e) => setTipo(e.target.value)} placeholder="documento_observado" />
        </label>
        {user?.role === 'admin' ? (
          <button type="button" className="btn btn--ghost btn--sm" disabled={corriendo} onClick={() => void correrMotor()}>
            <Icon name="bolt" size={14} /> {corriendo ? 'Corriendo el motor' : 'Ejecutar el motor ahora'}
          </button>
        ) : null}
      </div>
      <p className="small muted">
        Una señal es la prueba de que algo pasó: la bandeja la muestra y el motor de viajes decide el paso. Hoy la
        genera el personal o el agente, no el canal. El motor corre solo cada minuto y medio; el botón lo despierta al
        momento (solo administración) y deja su asiento en el Registro.
      </p>
      {resultado ? <p className="small" style={{ color: 'var(--color-success, #0d9488)' }}>{resultado}</p> : null}
      {fallo ? <p className="small" style={{ color: 'var(--color-danger, #dc2626)' }}>{fallo}</p> : null}
      <Conteo n={lectura.filas.length} texto="señales abiertas" />
      {lectura.aviso ? lectura.aviso : null}
      {lectura.filas.length > 0 ? (
        <div className="feed">
          {lectura.filas.map((s) => (
            <article className="feed__item" key={s.id}>
              <span className="feed__dot" />
              <div className="feed__body">
                <p className="feed__meta">
                  <Badge tone={tono[s.kind] ?? 'neutral'}>{etiqueta(s.kind)}</Badge>
                  {' · '}
                  <Link to={`/cuentas/${s.client_id}`}>{s.cliente}</Link>
                  {' · '}
                  {formatoDiaHora(s.created_at)}
                  {s.conversation_id ? (
                    <>
                      {' · '}
                      <button type="button" className="enlace" onClick={() => abrirHilo(s.conversation_id ?? '')}>
                        Ver hilo
                      </button>
                    </>
                  ) : null}
                </p>
                {s.detail ? <p className="small muted mono">{JSON.stringify(s.detail)}</p> : null}
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </>
  );
}

// --------------------------------------------------------------------- pantalla
export default function BandejaScreen() {
  const [pestana, setPestana] = useState<Pestana>('trabajo');
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [conteos, setConteos] = useState<Record<Pestana, number>>({
    trabajo: 0,
    sla: 0,
    salida: 0,
    banderas: 0,
    senales: 0,
  });
  // version sube cada vez que el hilo cambia de estado o escribe un mensaje, para que la lista
  // vuelva a leerse y el número de la pestaña no se quede atrás.
  const [version, setVersion] = useState(0);
  // La ultima entrada archivada en esta visita: es lo que permite abrir el hilo recien nacido sin
  // buscarlo en la lista. Se pisa con cada archivo, a proposito: el aviso tiene que hablar del ultimo.
  const [entrada, setEntrada] = useState<EntradaResultado | null>(null);

  const contar = useCallback((clave: Pestana) => (n: number) => {
    setConteos((prev) => (prev[clave] === n ? prev : { ...prev, [clave]: n }));
  }, []);

  // Abrir un hilo desde Salida o desde Banderas: la lista de conversaciones es la que sabe mostrar
  // el hilo, así que las otras pestañas devuelven el id a esta pantalla en vez de duplicar el panel.
  const elegir = useCallback((id: string) => {
    setSeleccionado(id);
    setPestana('trabajo');
  }, []);

  return (
    <div>
      <div className="page-head">
        <div>
          <p className="page-head__kicker">ALYTO CRM · OPERACIONES Y SERVICIO</p>
          <h1 className="page-head__title">Bandeja</h1>
          <p className="page-head__sub">
            Conversaciones de WhatsApp, correo, chat y redes en una sola lista, con su plazo de dos horas hábiles.
            Cada canal conectado alimenta esta lista; mientras el conector no esté, la entrada se anota.
          </p>
        </div>
        <Link to="/agenda" className="btn btn--ghost btn--sm">
          <Icon name="calendar" size={14} /> Agenda del día
        </Link>
      </div>

      <div className="tabs" role="tablist">
        {PESTANAS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={pestana === p.id}
            className={`tab${pestana === p.id ? ' tab--active' : ''}`}
            onClick={() => setPestana(p.id)}
          >
            {p.label}
            <span className="tab__numero">{conteos[p.id]}</span>
          </button>
        ))}
      </div>

      {pestana === 'trabajo' ? <FormularioEntrada alArchivar={(r) => { setEntrada(r); setVersion((v) => v + 1); }} /> : null}
      {pestana === 'trabajo' ? (
        <TrabajoView
          alCambiar={() => setVersion((v) => v + 1)}
          alContar={contar('trabajo')}
          version={version}
          seleccionado={seleccionado}
          elegir={elegir}
          entrada={entrada}
        />
      ) : null}
      {pestana === 'sla' ? <SlaView alContar={contar('sla')} /> : null}
      {pestana === 'salida' ? <SalidaView alContar={contar('salida')} abrirHilo={elegir} /> : null}
      {pestana === 'banderas' ? <BanderasView alContar={contar('banderas')} abrirHilo={elegir} /> : null}
      {pestana === 'senales' ? (
        <SenalesView alContar={contar('senales')} abrirHilo={(id) => elegir(id)} />
      ) : null}
    </div>
  );
}
