import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { crm, mensajeDeError } from '../api/client';
import { useLectura } from '../components/Aviso';
import { Badge, Icon, etiqueta, formatoDia, toneDeReclamo } from '../components/ui';
import type { CategoriaReclamo, CuentaRow, EstadoReclamo, ReclamoRow } from '../types';

// Reclamos del consumidor financiero. Lo que la pantalla registra va a la tabla claims con su
// código, y el plazo de respuesta queda vacío hasta que la decisión esté tomada: el CRM no inventa
// un plazo legal que nadie confirmó. Lo que sí calcula la base es cuántos días van desde la
// recepción, y eso es lo que se ve en el semáforo.

const CATEGORIAS: CategoriaReclamo[] = ['atraso_respuesta', 'error_operacion', 'cobro_indebido',
  'cierre_servicio', 'incumplimiento_normativo', 'otro'];
const ESTADOS: EstadoReclamo[] = ['recibido', 'en_analisis', 'requiere_documentos', 'respondido', 'cerrado', 'elevado_asfi'];

function nuevoCodigo(año: number, existentes: Pick<ReclamoRow, 'code'>[]): string {
  const prefijo = `RC-${año}-`;
  const maximo = existentes
    .filter((c) => c.code.startsWith(prefijo))
    .reduce((acc, c) => Math.max(acc, Number(c.code.slice(prefijo.length)) || 0), 0);
  return `${prefijo}${String(maximo + 1).padStart(4, '0')}`;
}

function NuevoReclamo({ cuentas, alCrear }: { cuentas: CuentaRow[]; alCrear: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cuenta, setCuenta] = useState(cuentas[0]?.id ?? '');
  const [categoria, setCategoria] = useState<CategoriaReclamo>('atraso_respuesta');
  const [resumen, setResumen] = useState('');
  const [detalle, setDetalle] = useState('');

  const existentes = useLectura<ReclamoRow>(() => crm.reclamos({}), [], '');
  const codigo = useMemo(
    () => nuevoCodigo(new Date().getFullYear(), existentes.filas),
    [existentes.filas],
  );

  const crear = async () => {
    setGuardando(true);
    setError(null);
    try {
      await crm.crearReclamo({
        code: codigo,
        client_id: cuenta,
        category: categoria,
        summary: resumen.trim(),
        description: detalle.trim() || undefined,
      });
      setAbierto(false);
      setResumen('');
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
        <Icon name="warning" size={14} /> Registrar reclamo
      </button>
      {!abierto ? (
        <p className="small muted mt-8">
          Solo los roles de soporte, cumplimiento y administración pueden registrar un reclamo; la base lo comprueba
          en cada escritura.
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
              <span className="field__label">Categoría</span>
              <select className="input" value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaReclamo)}>
                {CATEGORIAS.map((c) => (
                  <option key={c} value={c}>
                    {etiqueta(c)}
                  </option>
                ))}
              </select>
            </label>
            <span className="small muted mono">{codigo}</span>
          </div>
          <label className="field mt-8">
            <span className="field__label">Resumen</span>
            <input className="input" value={resumen} onChange={(e) => setResumen(e.target.value)} />
          </label>
          <label className="field">
            <span className="field__label">Detalle</span>
            <textarea className="input" rows={3} value={detalle} onChange={(e) => setDetalle(e.target.value)} />
          </label>
          {error ? <p className="small" style={{ color: 'var(--color-danger)' }}>{error}</p> : null}
          <button
            type="button"
            className="btn btn--navy btn--sm"
            disabled={guardando || !resumen.trim() || !cuenta}
            onClick={() => void crear()}
          >
            {guardando ? 'Guardando' : 'Guardar reclamo'}
          </button>
          <p className="small muted mt-8">
            El plazo de respuesta queda vacío. Es la decisión pendiente número uno del alcance: mientras no esté el
            plazo legal confirmado, el CRM no pone una fecha que nadie aprobó.
          </p>
        </div>
      )}
    </section>
  );
}

function FilaReclamo({ reclamo, alCambiar }: { reclamo: ReclamoRow; alCambiar: () => void }) {
  const [estado, setEstado] = useState<EstadoReclamo>(reclamo.status);
  const [resolucion, setResolucion] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // claims_cerrado_con_resolucion: un reclamo no se cierra con la resolución vacía. La traba está en
  // la base; el botón se apaga antes para no mandar una escritura que ya se sabe que va a volver.
  const pideResolucion = estado === 'cerrado' && !reclamo.resolution && resolucion.trim() === '';

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    try {
      await crm.editarReclamo(reclamo.id, {
        status: estado,
        responded_at: estado === 'respondido' || estado === 'cerrado' ? new Date().toISOString() : undefined,
        resolution: resolucion.trim() || undefined,
      });
      alCambiar();
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <article className="feed__item">
      <span className={`feed__dot${reclamo.vencido ? ' feed__dot--danger' : reclamo.sin_plazo_definido ? '' : ' feed__dot--success'}`} />
      <div className="feed__body" style={{ flex: 1 }}>
        <p className="feed__meta">
          <strong className="mono">{reclamo.code}</strong> · <Link to={`/cuentas/${reclamo.client_id}`}>{reclamo.cliente}</Link> ·{' '}
          {etiqueta(reclamo.category)} · recibido {formatoDia(reclamo.received_at)} · {reclamo.dias_transcurridos} días
        </p>
        <p>{reclamo.summary}</p>
        {reclamo.resolution ? <p className="small muted">Resolución: {reclamo.resolution}</p> : null}
        <p className="feed__meta">
          <Badge tone={toneDeReclamo(reclamo.status)}>{etiqueta(reclamo.status)}</Badge>
          {' · '}
          {reclamo.due_at
            ? `plazo ${formatoDia(reclamo.due_at)}${reclamo.vencido ? ' (vencido)' : ''}`
            : 'sin plazo definido'}
          {reclamo.responded_at ? ` · respondido ${formatoDia(reclamo.responded_at)}` : ''}
        </p>
        <div className="row mt-8">
          <select
            className="input"
            style={{ height: 34, width: 'auto' }}
            value={estado}
            onChange={(e) => setEstado(e.target.value as EstadoReclamo)}
            aria-label={`Estado de ${reclamo.code}`}
          >
            {ESTADOS.map((v) => (
              <option key={v} value={v}>
                {etiqueta(v)}
              </option>
            ))}
          </select>
          <input
            className="input"
            style={{ flex: 1, minWidth: 160 }}
            value={resolucion}
            onChange={(e) => setResolucion(e.target.value)}
            placeholder="Resolución (opcional)"
          />
          <button type="button" className="btn btn--ghost btn--sm" disabled={guardando || pideResolucion} onClick={() => void guardar()}>
            <Icon name="check" size={14} /> {guardando ? 'Guardando' : 'Actualizar'}
          </button>
        </div>
        {pideResolucion ? (
          <p className="small muted">
            Para cerrar el reclamo hace falta escribir la resolución. La base no deja un cierre sin respuesta.
          </p>
        ) : null}
        {error ? <p className="small" style={{ color: 'var(--color-danger)' }}>{error}</p> : null}
      </div>
    </article>
  );
}

export default function ReclamosScreen() {
  const [categoria, setCategoria] = useState('');
  const [estado, setEstado] = useState('');
  const [version, setVersion] = useState(0);

  const lectura = useLectura<ReclamoRow>(
    () => crm.reclamos({ categoria: categoria || undefined, estado: estado || undefined }),
    [categoria, estado, version],
    'No hay reclamos con estos filtros para este rol.',
  );
  const cuentas = useLectura<CuentaRow>(() => crm.cuentas({}), [], 'Registre una cuenta antes de abrir un reclamo.');

  return (
    <div>
      <div className="page-head">
        <div>
          <p className="page-head__kicker">ALYTO CRM · CONSUMIDOR FINANCIERO</p>
          <h1 className="page-head__title">Reclamos</h1>
          <p className="page-head__sub">
            Registro por categoría, días transcurridos y semáforo. El raised a ASFI se anota en la misma ficha.
          </p>
        </div>
      </div>

      <div className="section">
        <NuevoReclamo cuentas={cuentas.filas} alCrear={() => setVersion((v) => v + 1)} />
      </div>

      <div className="filtros row">
        <label className="field field--inline">
          <span className="field__label">Categoría</span>
          <select className="input" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            <option value="">Todas</option>
            {CATEGORIAS.map((c) => (
              <option key={c} value={c}>
                {etiqueta(c)}
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
        <div className="feed">
          {lectura.filas.map((r) => (
            <FilaReclamo key={r.id} reclamo={r} alCambiar={() => setVersion((v) => v + 1)} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
