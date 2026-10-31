import { Link } from 'react-router-dom';
import { crm } from '../api/client';
import { Aviso } from '../components/Aviso';
import { useApiData } from '../hooks/useApiData';
import { useAuth } from '../auth/AuthContext';
import { horas, montoBs } from '../components/ui';
import type { PanelMetrica, ParametrosRow } from '../types';

const TONO: Record<PanelMetrica['tono'], string> = {
  verde: 'panel-card--verde',
  ambar: 'panel-card--ambar',
  rojo: 'panel-card--rojo',
};

// Los dias laborales de la fila de parametros vienen en la cuenta de Postgres `dow`, donde el domingo
// es 0: la columna trae [1,2,3,4,5] y ahi coincide con leerla de lunes a viernes.
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function diasLaborales(dias: string[] | undefined): string {
  const nombres = (dias ?? [])
    .map((d) => Number(d))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
    .map((n) => DIAS[n]);
  return nombres.length ? nombres.join(', ') : 'sin días declarados';
}

// El plazo de 12 meses corre desde la fecha que la 0012 agrega como inicio_ecp. Sin esa fecha el
// plazo no se puede calcular, y decirlo en la pantalla es mejor que mostrar los meses sueltos como
// si dijeran algo. La fecha no llega hasta que la migracion esta corrida en la base.
const diaAnio = new Intl.DateTimeFormat('es-BO', { day: '2-digit', month: 'short', year: 'numeric' });

function vencimiento(p: ParametrosRow): string {
  if (!p.inicio_ecp) return 'sin fecha de inicio anotada (migración 0012)';
  const inicio = new Date(`${p.inicio_ecp}T00:00:00`);
  if (Number.isNaN(inicio.getTime())) return 'la fecha de inicio no se puede leer';
  const vence = new Date(inicio.getFullYear(), inicio.getMonth() + Number(p.duracion_maxima_ecp_meses), inicio.getDate());
  const dias = Math.round((vence.getTime() - Date.now()) / 86_400_000);
  const cuenta = dias < 0 ? `vencido hace ${Math.abs(dias)} días` : `quedan ${dias} días`;
  return `${diaAnio.format(vence)} · ${cuenta}`;
}

export default function PanelScreen() {
  const { user } = useAuth();
  const panel = useApiData<PanelMetrica[]>(() => crm.panel(), [], []);
  const parametros = useApiData<ParametrosRow[]>(() => crm.parametros(), [], []);

  if (user?.role !== 'admin') {
    return <Aviso tipo="rechazo" texto="Este panel operativo está disponible para administración." />;
  }

  const ecp = parametros.data[0];

  return (
    <section className="page">
      <header className="page-head">
        <div>
          <p className="page-head__kicker">ALYTO CRM · CONTROL DE OPERACIÓN</p>
          <h1>Panel operativo</h1>
          <p className="muted">Indicadores calculados desde las vistas actuales de Supabase. Abre un indicador para revisar los casos.</p>
        </div>
        <button className="btn btn--ghost" type="button" disabled={panel.loading} onClick={() => void panel.reload()}>
          {panel.loading ? 'Actualizando…' : 'Actualizar'}
        </button>
      </header>

      {/* Los cuatro numeros de abajo se leen contra estos topes: los pone ASFI, no el equipo. */}
      <section className="card section" aria-label="Topes del Entorno Controlado de Pruebas">
        <h2 className="card__title">Topes del Entorno Controlado de Pruebas</h2>
        {parametros.error ? (
          <Aviso tipo="rechazo" texto={`No se pudieron leer los parámetros del ECP: ${parametros.error}`} />
        ) : parametros.loading ? (
          <p className="muted small">Consultando la fila de parámetros…</p>
        ) : !ecp ? (
          <Aviso tipo="vacio" texto="La base no tiene la fila de parámetros del ECP: sin esos números el entorno no tiene techo escrito." />
        ) : (
          <>
            <p className="kv">
              <span className="kv__label">Tope por operación</span>
              <span className="kv__value">{montoBs(ecp.monto_maximo_operacion_bs)}</span>
            </p>
            <p className="kv">
              <span className="kv__label">Usuarios por día</span>
              <span className="kv__value">{ecp.usuarios_por_dia}</span>
            </p>
            <p className="kv">
              <span className="kv__label">Operaciones por día</span>
              <span className="kv__value">{ecp.operaciones_por_dia}</span>
            </p>
            <p className="kv">
              <span className="kv__label">Horario hábil</span>
              <span className="kv__value">
                {ecp.horario_atencion_inicio.slice(0, 5)} a {ecp.horario_atencion_fin.slice(0, 5)} · {diasLaborales(ecp.dias_laborales)}
              </span>
            </p>
            <p className="kv">
              <span className="kv__label">Nivel de servicio sin atención</span>
              <span className="kv__value">{horas(ecp.sla_horas_sin_atencion)}</span>
            </p>
            <p className="kv">
              <span className="kv__label">Vencimiento del ECP</span>
              <span className="kv__value">{vencimiento(ecp)}</span>
            </p>
            <p className="muted small">
              El tope por operación lo impone la base: una ficha que lo anote más alto rebota contra el
              guardaraíl de la migración 0012. Los conteos de usuarios y de operaciones por día son del
              entorno de pagos, no de este CRM, así que acá sirven de referencia y no de semáforo. Estado
              de la autorización: {ecp.estado_autorizacion}.
            </p>
          </>
        )}
      </section>

      {panel.error ? <Aviso tipo="rechazo" texto={`No se pudieron cargar los indicadores: ${panel.error}`} /> : null}
      {!panel.error && panel.loading ? <Aviso tipo="cargando" texto="Consultando indicadores…" /> : null}
      {!panel.error && !panel.loading && panel.data.length === 0 ? <Aviso tipo="vacio" texto="No hay indicadores disponibles." /> : null}

      {panel.data.length > 0 ? (
        <div className="panel-grid">
          {panel.data.map((metrica) => (
            <Link className={`panel-card ${TONO[metrica.tono]}`} to={metrica.destino} key={metrica.clave}>
              <span className="panel-card__tone"><i />{metrica.tono}</span>
              <span className="panel-card__number">{metrica.numero}</span>
              <strong>{metrica.titulo}</strong>
              <span className="panel-card__detail">{metrica.frase}</span>
              <span className="panel-card__link">Ver casos →</span>
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  );
}
