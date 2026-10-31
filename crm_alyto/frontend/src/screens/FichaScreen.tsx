import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { crm, mensajeDeError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Aviso } from '../components/Aviso';
import {
  Badge,
  Icon,
  etiqueta,
  formatoDia,
  formatoDiaHora,
  montoBs,
  toneDeCasilla,
  toneDeEstadoHilo,
  toneDeKyc,
  toneDeMensaje,
  toneDeRuta,
} from '../components/ui';
import type { CasillaRow, DocumentoRow, EstadoCasilla, Ficha } from '../types';

// Ficha 360: la cuenta con sus nueve bloques en una sola lectura. Es lo que un agente mira antes de
// responder, y por eso cada bloque dice cuántas filas trajo: "sin documentos" y "0 documentos" no
// son lo mismo.
//
// La ficha no inventa ningún bloque. Lo que la app de pagos maneja (wallets, saldos, transacciones)
// no está acá por decisión de alcance: el CRM lee la base del CRM, y el identificador del cliente en
// el otro sistema aparece apenas como referencia con su etiqueta de origen.

const ESTADOS_CASILLA: EstadoCasilla[] = ['Pendiente', 'En revision', 'Aprobado', 'Observado'];

function Bloque({
  titulo,
  n,
  children,
}: {
  titulo: string;
  n: number;
  children: React.ReactNode;
}) {
  return (
    <section className="card">
      <h2 className="card__title">
        {titulo} <span className="small muted">({n})</span>
      </h2>
      {n === 0 ? <p className="small muted">Sin filas en este bloque.</p> : children}
    </section>
  );
}

function CasillaFila({ clientId, casilla, alCambiar }: { clientId: string; casilla: CasillaRow; alCambiar: () => void }) {
  const [estado, setEstado] = useState<CasillaRow>(casilla);
  const [detalle, setDetalle] = useState(casilla.detail ?? '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    try {
      const actualizada = await crm.editarCasilla(clientId, estado.requirement_code, {
        status: estado.status,
        detail: detalle,
      });
      setEstado(actualizada);
      alCambiar();
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setGuardando(false);
    }
  };

  // La exencion es la potestad de administracion y de cumplimiento de aprobar una casilla que
  // pide documento aunque este falte, con el motivo por escrito: la base la deja y escribe el
  // asiento de auditoria en la misma transaccion. Solo se ofrece mientras la casilla no este
  // ya aprobada y el rol alcance; sin motivo, la base rebota y aqui se lo dice antes.
  const puedeExentur = (user?.role === 'admin' || user?.role === 'compliance') && estado.status !== 'Aprobado';

  const exentur = async () => {
    if (detalle.trim().length < 3) {
      setError('La exencion exige el motivo por escrito en el campo de observacion.');
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const aprobada = await crm.exentarCasilla(clientId, estado.requirement_code, detalle.trim());
      setEstado(aprobada);
      alCambiar();
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="check-item">
      <div className="row row--between">
        <span className="check-item__label mono">{estado.requirement_code}</span>
        <Badge tone={toneDeCasilla(estado.status)}>{estado.status}</Badge>
      </div>
      <div className="row mt-8">
        <select
          className="input"
          style={{ height: 34, width: 'auto' }}
          value={estado.status}
          onChange={(e) => setEstado((prev) => ({ ...prev, status: e.target.value as EstadoCasilla }))}
          aria-label={`Estado de ${estado.requirement_code}`}
        >
          {ESTADOS_CASILLA.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <input
          className="input"
          style={{ flex: 1, minWidth: 160 }}
          value={detalle}
          onChange={(e) => setDetalle(e.target.value)}
          placeholder="Observación para el cliente"
        />
        <button type="button" className="btn btn--ghost btn--sm" disabled={guardando} onClick={() => void guardar()}>
          <Icon name="check" size={14} /> {guardando ? 'Guardando' : 'Revisar'}
        </button>
        {puedeExentur ? (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={guardando}
            onClick={() => void exentur()}
            title="Aprobar sin documento, con motivo por escrito: queda asiento en el registro"
          >
            <Icon name="check" size={14} /> Exención
          </button>
        ) : null}
      </div>
      {error ? <p className="small" style={{ color: 'var(--color-danger)' }}>{error}</p> : null}
      <p className="check-item__detail">
        {estado.reviewed_at ? `Revisada el ${formatoDiaHora(estado.reviewed_at)}` : 'Sin revisión anotada'}
      </p>
    </div>
  );
}

// Fila de documento con su botón de apertura: el contenido baja del cubo en binario, se abre en
// una pestaña nueva con un URL efímero. Solo administracion, cumplimiento y operaciones alcanzan
// el cubo; para los demás roles el botón no se ofrece (la base igual diría 403).
function FilaDocumento({ documento }: { documento: DocumentoRow }) {
  const { user } = useAuth();
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abre = async () => {
    if (trabajando) return;
    setTrabajando(true);
    setError(null);
    try {
      const { blob } = await crm.contenidoDocumento(documento.id);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setTrabajando(false);
    }
  };

  return (
    <div className="check-item">
      <div className="row row--between">
        <span className="check-item__label">{documento.filename}</span>
        <Badge tone={documento.review_status === 'Aprobado' ? 'success' : documento.review_status === 'Rechazado' ? 'danger' : 'warning'}>
          {documento.review_status}
        </Badge>
      </div>
      <p className="check-item__detail">
        {documento.requirement_code ?? 'sin requisito'} · {formatoDia(documento.created_at)}
        {documento.size_bytes ? ` · ${Math.max(1, Math.round(documento.size_bytes / 1024))} KB` : ''}
        {documento.expires_on ? ` · vence ${formatoDia(`${documento.expires_on}T00:00:00Z`)}` : ' · sin vencimiento'}
      </p>
      <div className="row mt-8">
        {user?.role === 'admin' || user?.role === 'compliance' || user?.role === 'operaciones' ? (
          <button type="button" className="btn btn--ghost btn--sm" disabled={trabajando} onClick={() => void abre()}>
            <Icon name="doc" size={14} /> {trabajando ? 'Bajando' : 'Abrir'}
          </button>
        ) : null}
        {error ? <span className="small" style={{ color: 'var(--color-danger)' }}>{error}</span> : null}
      </div>
    </div>
  );
}

// Formulario de carga del legajo (F-18). El archivo viaja al backend en base64 con el requisito
// a la casilla que responde; el sufijo de tipo lo dice el navegador. Sin arquivo, no hay envío.
function FormularioDocumento({ clientId, casillas, alSubir }: { clientId: string; casillas: CasillaRow[]; alSubir: () => void }) {
  const [requisito, setRequisito] = useState(casillas[0]?.requirement_code ?? '');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [vence, setVence] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const envia = async () => {
    if (subiendo || !archivo || !requisito) return;
    setSubiendo(true);
    setError(null);
    setAviso(null);
    try {
      const base64 = await new Promise<string>((resuelve, revienta) => {
        const lector = new FileReader();
        lector.onload = () => resuelve(String(lector.result ?? '').slice(String(lector.result ?? '').indexOf(',') + 1));
        lector.onerror = () => revienta(new Error('No fue posible leer el archivo desde el navegador.'));
        lector.readAsDataURL(archivo);
      });
      const fila = await crm.subirDocumento(clientId, {
        requirement_code: requisito,
        filename: archivo.name,
        mime_type: archivo.type || 'application/pdf',
        expires_on: vence || null,
        content_base64: base64,
      });
      setAviso(`Subido: ${fila.filename} (${Math.max(1, Math.round((fila.size_bytes ?? 0) / 1024))} KB), estado Pendiente hasta la revisión.`);
      setArchivo(null);
      setVence('');
      alSubir();
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setSubiendo(false);
    }
  };

  if (casillas.length === 0) {
    return <p className="small muted">Este cliente no tiene casillas de requisitos en su plantilla.</p>;
  }

  return (
    <div className="check-item">
      <p className="check-item__label">Subir documento al expediente</p>
      <div className="row mt-8">
        <select className="input" style={{ height: 34, width: 'auto' }} value={requisito}
          onChange={(e) => setRequisito(e.target.value)} aria-label="Requisito del documento">
          {casillas.map((c) => (
            <option key={c.requirement_code} value={c.requirement_code}>{c.requirement_code}</option>
          ))}
        </select>
        <input
          type="file"
          className="input"
          style={{ flex: 1, minWidth: 160 }}
          accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,application/pdf,image/png,image/jpeg,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={(e) => { setArchivo(e.target.files?.[0] ?? null); setAviso(null); setError(null); }}
        />
        <input
          type="date"
          className="input"
          style={{ height: 34, width: 'auto' }}
          value={vence}
          onChange={(e) => setVence(e.target.value)}
          aria-label="Vencimiento (opcional)"
          title="Vencimiento (opcional)"
        />
        <button type="button" className="btn btn--navy btn--sm" disabled={subiendo || !archivo || !requisito}
          onClick={() => void envia()}>
          <Icon name="plus" size={14} /> {subiendo ? 'Subiendo' : 'Subir'}
        </button>
      </div>
      {aviso ? <p className="small" style={{ color: 'var(--color-success)' }}>{aviso}</p> : null}
      {error ? <p className="small" style={{ color: 'var(--color-danger)' }}>{error}</p> : null}
      <p className="check-item__detail">PDF, PNG, JPEG, DOC o DOCX hasta 10 MB. La revisión del estado la hace cumplimiento.</p>
    </div>
  );
}

export default function FichaScreen() {
  const { clientId = '' } = useParams();
  const { user } = useAuth();
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      setFicha(await crm.ficha(clientId));
    } catch (err) {
      setError(mensajeDeError(err));
      setFicha(null);
    } finally {
      setCargando(false);
    }
  }, [clientId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  if (cargando) return <Aviso tipo="cargando" texto="Leyendo la ficha de la cuenta..." />;
  if (error || !ficha) {
    return (
      <Aviso
        tipo="rechazo"
        texto={error ?? 'La cuenta no existe o no está visible para este usuario.'}
        accion={
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => void cargar()}>
            Reintentar
          </button>
        }
      />
    );
  }

  const { cuenta, contactos, casillas, documentos, rutas, hilos, senales, cotejos, reclamos, registro } = ficha;

  return (
    <div>
      <div className="page-head">
        <div>
          <p className="page-head__kicker">ALYTO CRM · FICHA 360</p>
          <h1 className="page-head__title">{cuenta.display_name}</h1>
          <p className="page-head__sub">
            {etiqueta(cuenta.account_type)} · {cuenta.legal_name ?? 'sin razón social'} ·{' '}
            {cuenta.ci ? `CI ${cuenta.ci}` : ''} {cuenta.nit ? `· NIT ${cuenta.nit}` : ''} ·{' '}
            {cuenta.city ?? 'sin ciudad'}
          </p>
        </div>
        <div className="row">
          <Badge tone={toneDeKyc(cuenta.kyc_estado)}>{cuenta.kyc_estado}</Badge>
          <Badge tone={cuenta.riesgo === 'Alto' ? 'danger' : cuenta.riesgo === 'Medio' ? 'warning' : 'success'}>
            Riesgo {cuenta.riesgo.toLowerCase()}
          </Badge>
          <Link to="/" className="btn btn--ghost btn--sm">
            <Icon name="inbox" size={14} /> Bandeja
          </Link>
        </div>
      </div>

      <div className="grid grid--2 section">
        <section className="card">
          <h2 className="card__title">Datos de la cuenta</h2>
          <p className="kv">
            <span className="kv__label">Correo</span>
            <span className="kv__value mono">{cuenta.email ?? 'sin correo'}</span>
          </p>
          <p className="kv">
            <span className="kv__label">Teléfono</span>
            <span className="kv__value mono">{cuenta.phone_e164 ?? 'sin teléfono'}</span>
          </p>
          <p className="kv">
            <span className="kv__label">Sector</span>
            <span className="kv__value">{cuenta.sector ?? 'sin dato'}</span>
          </p>
          <p className="kv">
            <span className="kv__label">Origen</span>
            <span className="kv__value">{etiqueta(cuenta.origin)}</span>
          </p>
          <p className="kv">
            <span className="kv__label">Estado en el ECP</span>
            <span className="kv__value">{cuenta.ecp_status}</span>
          </p>
          <p className="kv">
            <span className="kv__label">Tope por operación</span>
            <span className="kv__value">{montoBs(cuenta.tope_operacion_bs)}</span>
          </p>
          <p className="kv">
            <span className="kv__label">Cupo mensual de operaciones</span>
            <span className="kv__value">{cuenta.cupo_mensual_operaciones ?? 'sin dato'}</span>
          </p>
          <p className="kv">
            <span className="kv__label">Referencia en la app de pagos</span>
            <span className="kv__value mono">
              {cuenta.payments_ref ?? 'sin referencia'}
              <span className="small muted"> · dato de origen externo, el CRM solo lo lee</span>
            </span>
          </p>
          <p className="kv">
            <span className="kv__label">Ficha revisada</span>
            <span className="kv__value">{cuenta.ficha_revisada_en ? formatoDiaHora(cuenta.ficha_revisada_en) : 'sin revisión'}</span>
          </p>
          {cuenta.ficha_nota ? <p className="small muted mt-8">{cuenta.ficha_nota}</p> : null}
          <p className="small muted mt-8">
            Las columnas de KYC, riesgo, tope y nota de ficha las escribe solamente cumplimiento, y el guarda está en
            la base. Si usted entra con otro rol, el guardado se rechaza con el mensaje de la base.
          </p>
          {user?.role === 'compliance' || user?.role === 'admin' ? null : (
            <p className="small muted">Su rol ({user?.role ?? ''}) puede leer la ficha pero no editar esas columnas.</p>
          )}
        </section>

        <div className="grid">
          <Bloque titulo="Contactos" n={contactos.length}>
            {contactos.map((c) => (
              <div className="check-item" key={c.id}>
                <div className="row row--between">
                  <span className="check-item__label">{c.full_name}</span>
                  {c.is_primary ? <Badge tone="accent">principal</Badge> : null}
                  {c.is_decision_maker ? <Badge tone="neutral">decide</Badge> : null}
                </div>
                <p className="check-item__detail">
                  {c.role_title ?? 'sin cargo'} · {c.email ?? 'sin correo'} · {c.phone_e164 ?? 'sin teléfono'}
                </p>
              </div>
            ))}
          </Bloque>
          <Bloque titulo="Rutas abiertas" n={rutas.length}>
            {rutas.map((r) => (
              <div className="check-item" key={r.id}>
                <div className="row row--between">
                  <span className="check-item__label mono">{r.code}</span>
                  <Badge tone={toneDeRuta(r.estado)}>{etiqueta(r.estado)}</Badge>
                </div>
                <p className="check-item__detail">
                  {etiqueta(r.kind)} · abierta {formatoDia(r.opened_at)}
                  {r.motivo ? ` · ${r.motivo}` : ''}
                </p>
                <Link className="enlace" to="/rutas">
                  Abrir en Rutas
                </Link>
              </div>
            ))}
          </Bloque>
        </div>
      </div>

      <div className="section">
        <Bloque titulo="Legajo: casillas de requisitos" n={casillas.length}>
          {casillas.map((c) => (
            <CasillaFila key={c.requirement_code} clientId={cuenta.id} casilla={c} alCambiar={() => void cargar()} />
          ))}
        </Bloque>
      </div>

      <div className="grid grid--2 section">
        <Bloque titulo="Documentos" n={documentos.length}>
          {documentos.map((d) => (
            <FilaDocumento key={d.id} documento={d} />
          ))}
          <FormularioDocumento clientId={cuenta.id} casillas={casillas} alSubir={() => void cargar()} />
        </Bloque>

        <Bloque titulo="Conversaciones" n={hilos.length}>
          {hilos.map((h) => (
            <div className="check-item" key={h.id}>
              <div className="row row--between">
                <span className="check-item__label">{etiqueta(h.channel)} · {h.queue}</span>
                <Badge tone={toneDeEstadoHilo(h.status)}>{etiqueta(h.status)}</Badge>
              </div>
              <p className="check-item__detail">
                {h.subject ?? 'sin asunto'} · {h.messages_count} mensajes · último {formatoDia(h.last_message_at)}
              </p>
            </div>
          ))}
        </Bloque>
      </div>

      <div className="grid grid--2 section">
        <Bloque titulo="Señales" n={senales.length}>
          {senales.map((s) => (
            <div className="check-item" key={s.id}>
              <div className="row row--between">
                <span className="check-item__label">{etiqueta(s.kind)}</span>
                <Badge tone={s.status === 'abierta' ? 'warning' : 'neutral'}>{s.status}</Badge>
              </div>
              <p className="check-item__detail">
                {formatoDiaHora(s.created_at)} · {s.conversation_id ? 'con hilo asociado' : 'sin hilo'}
              </p>
            </div>
          ))}
        </Bloque>

        <Bloque titulo="Cotejos" n={cotejos.length}>
          {cotejos.map((c) => (
            <div className="check-item" key={c.id}>
              <div className="row row--between">
                <span className="check-item__label">{c.list_name}</span>
                <Badge tone={c.result === 'coincidencia' ? 'danger' : 'success'}>{c.result}</Badge>
              </div>
              <p className="check-item__detail">
                {c.subject} · {formatoDia(c.created_at)}
              </p>
            </div>
          ))}
        </Bloque>
      </div>

      <div className="grid grid--2 section">
        <Bloque titulo="Reclamos" n={reclamos.length}>
          {reclamos.map((r) => (
            <div className="check-item" key={r.id}>
              <div className="row row--between">
                <span className="check-item__label mono">{r.code}</span>
                <Badge tone={r.status === 'cerrado' ? 'success' : 'warning'}>{etiqueta(r.status)}</Badge>
              </div>
              <p className="check-item__detail">
                {etiqueta(r.category)} · {r.summary}
                {r.due_at ? ` · plazo ${formatoDia(r.due_at)}` : ' · sin plazo definido'}
              </p>
            </div>
          ))}
        </Bloque>

        <Bloque titulo="El registro de esta cuenta" n={registro.length}>
          {registro.map((a) => (
            <div className="check-item" key={a.id}>
              <div className="row row--between">
                <span className="check-item__label">{a.action}</span>
                <Badge tone={a.outcome === 'exito' ? 'success' : a.outcome === 'error' ? 'danger' : 'warning'}>
                  {etiqueta(a.outcome)}
                </Badge>
              </div>
              <p className="check-item__detail">
                {formatoDiaHora(a.created_at)} · {a.actor} ({etiqueta(a.actor_kind)})
              </p>
              {a.detail ? <p className="check-item__detail">{a.detail}</p> : null}
            </div>
          ))}
          <p className="small muted mt-8">
            Este bloque es inmutable: ni la administración puede editarlo ni borrarlo. Lo que no está acá no pasó.
          </p>
        </Bloque>
      </div>

      <p className="small muted">
        Los mensajes completos de cada conversación se leen en la Bandeja. Esta ficha muestra cuántos hay y de qué
        canal, no el texto: el texto es el prueba del hilo.
      </p>
    </div>
  );
}
