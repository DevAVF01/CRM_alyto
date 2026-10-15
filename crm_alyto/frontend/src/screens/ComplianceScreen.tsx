import { useMemo, useState } from 'react';
import {
  COMPLIANCE_SUMMARY,
  DIRECTRICES_ECP,
  ECP_LIMITS,
  MOCK_AUDIT,
  MOCK_CLIENTS,
} from '../data/mock';
import type { AuditEvent, ClientRecord, ComplianceSummary, EcpLimits } from '../types';
import type { EcpDirective } from '../api/client';
import { ApiError, api } from '../api/client';
import { useApiData } from '../hooks/useApiData';
import { Badge, Icon, usd, useToast } from '../components/ui';

const GREEN_PCT = 78;
const YELLOW_PCT = 15;

function bandTone(band: string) {
  if (band === 'Bajo') return 'success' as const;
  if (band === 'Medio') return 'warning' as const;
  return 'danger' as const;
}

function directiveLine(item: EcpDirective): string {
  return `${item.code}: ${item.description}`;
}

export default function ComplianceScreen() {
  const { show, element } = useToast();
  const [sent, setSent] = useState(false);

  const { data: summary, live } = useApiData<ComplianceSummary>(
    () => api.compliance.summary(),
    COMPLIANCE_SUMMARY,
  );
  const { data: directrices } = useApiData<EcpDirective[]>(() => api.compliance.directrices(), []);
  const { data: limits } = useApiData<EcpLimits>(() => api.compliance.limits(), ECP_LIMITS);
  const { data: audit } = useApiData<AuditEvent[]>(() => api.compliance.audit(), MOCK_AUDIT);
  const { data: clients } = useApiData<ClientRecord[]>(() => api.clients.list(), MOCK_CLIENTS);

  const events = useMemo(() => audit.slice(0, 6), [audit]);
  const limitRows = useMemo(
    () => [
      {
        label: 'Expedientes habilitados',
        used: limits.consumption.expedientesActivos,
        capacity: limits.parameters.usuariosPorDia,
        pct: (limits.consumption.expedientesActivos / limits.parameters.usuariosPorDia) * 100,
      },
      {
        label: 'Operaciones registradas',
        used: limits.consumption.operacionesRegistradas,
        capacity: limits.parameters.operacionesPorDia,
        pct: (limits.consumption.operacionesRegistradas / limits.parameters.operacionesPorDia) * 100,
      },
    ],
    [limits],
  );
  const directiveLines = useMemo(
    () => (directrices.length > 0 ? directrices.map(directiveLine) : DIRECTRICES_ECP),
    [directrices],
  );
  const total = summary.approved + summary.inReview + summary.pending;

  const generateReport = async () => {
    setSent(true);
    try {
      const event = await api.compliance.addAudit({
        action: 'reporte_regulatorio',
        detail: 'Reporte ASFI del periodo generado desde Alyto CRM',
      });
      show(`Reporte registrado en auditoría, asiento #${event.id}`);
    } catch (err) {
      show(err instanceof ApiError ? err.message : 'Reporte generado en modo demostración, sin backend disponible');
    }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <p className="page-head__kicker">Cumplimiento ASFI / ECP</p>
          <h1 className="page-head__title">Monitoreo Normativo y Debida Diligencia</h1>
          <p className="page-head__sub">Expedientes, checklist regulatorio y trazabilidad de auditoría</p>
        </div>
        <span className={`source-pill${live ? ' source-pill--live' : ''}`}>
          {live ? 'Cumplimiento en vivo' : 'Datos de demostración'}
        </span>
      </div>

      <section className="card card--dark regime-banner section" aria-label="Régimen de supervisión">
        <div>
          <p className="regime-banner__title">SUPERVISADO POR ASFI</p>
          <p className="regime-banner__sub">Entorno Controlado de Pruebas (ECP), AV Finance S.R.L.</p>
        </div>
        <span className="regime-banner__code">CÓDIGO DE RÉGIMEN: {summary.regimeCode}</span>
      </section>

      <section className="grid grid--kpis section" aria-label="Estado de expedientes">
        <div className="card stat">
          <p className="stat__label">Expedientes Aprobados</p>
          <p className="stat__value">{summary.approved}</p>
          <p className="stat__hint stat__hint--up">Conformidad plena</p>
        </div>
        <div className="card stat">
          <p className="stat__label">En Revisión ECP</p>
          <p className="stat__value">{summary.inReview}</p>
          <p className="stat__hint">En evaluación</p>
        </div>
        <div className="card stat">
          <p className="stat__label">Pendientes</p>
          <p className="stat__value">{String(summary.pending).padStart(2, '0')}</p>
          <p className="stat__hint">Subsanación requerida</p>
        </div>
        <div className="card stat">
          <p className="stat__label">Total de Expedientes</p>
          <p className="stat__value">{total}</p>
          <p className="stat__hint">Cartera institucional B2B</p>
        </div>
      </section>

      <div className="grid grid--2 section">
        <section className="card" aria-label="Índice global de cumplimiento">
          <div className="row row--between">
            <h2 className="card__title" style={{ marginBottom: 0 }}>Índice Global de Cumplimiento Técnico</h2>
            <span className="stat__value" style={{ fontSize: 22 }}>{summary.index}</span>
          </div>
          <div className="progress-tri mt-12" aria-hidden="true">
            <span style={{ width: `${GREEN_PCT}%`, background: 'var(--color-success)' }} />
            <span style={{ width: `${YELLOW_PCT}%`, background: 'var(--color-accent)' }} />
            <span style={{ flex: 1, background: 'var(--color-danger)' }} />
          </div>
          <div className="row mt-8">
            <Badge tone="success">Verde: Oficialía Verificada</Badge>
            <Badge tone="accent">Amarillo: Revisión ECP</Badge>
            <Badge tone="danger">Rojo: Observaciones</Badge>
          </div>
          <p className="small muted mt-12">
            El índice pondera validación documental, listas restrictivas, origen de fondos y trazabilidad en Stellar Testnet.
          </p>
          <button type="button" className="btn btn--primary btn--block mt-12" onClick={() => void generateReport()} disabled={sent}>
            <Icon name="doc" size={15} /> {sent ? 'Reporte Generado' : 'Generar Reporte Regulatorio ASFI'}
          </button>
        </section>

        <section className="card" aria-label="Directrices ECP">
          <div className="row row--between">
            <h2 className="card__title" style={{ marginBottom: 0 }}>Directrices del Entorno Controlado de Pruebas</h2>
            <Badge tone={directrices.length > 0 ? 'success' : 'neutral'}>
              {directrices.length > 0 ? 'Conector KYC/AML' : 'Base local'}
            </Badge>
          </div>
          <div className="feed">
            {directiveLines.map((line) => (
              <div className="feed__item" key={line}>
                <span className="feed__dot" />
                <p className="feed__body">{line}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid grid--2 section">
        <section className="card" aria-label="Límites operativos del ECP">
          <div className="row row--between">
            <h2 className="card__title" style={{ marginBottom: 0 }}>Límites Operativos del ECP</h2>
            <Badge tone="accent">Resolución ASFI</Badge>
          </div>
          {limitRows.map((row) => (
            <div className="dist-row" key={row.label}>
              <div className="dist-row__head">
                <span>{row.label}</span>
                <span className="dist-row__pct">{row.used} / {row.capacity}</span>
              </div>
              <div className="progress">
                <div className="progress__fill" style={{ width: `${Math.min(100, row.pct)}%` }} />
              </div>
            </div>
          ))}
          <div className="kv mt-12">
            <div>
              <p className="kv__label">Monto Máximo por Operación</p>
              <p className="kv__value">Bs {limits.parameters.montoMaximoOperacionBs.toLocaleString('es-BO')}</p>
            </div>
            <div>
              <p className="kv__label">Operación de Mayor Monto Registrada</p>
              <p className="kv__value">{usd(limits.consumption.operacionDeMayorMontoUsd)}</p>
            </div>
            <div>
              <p className="kv__label">Duración Máxima del ECP</p>
              <p className="kv__value">{limits.parameters.duracionMaximaEcpMeses} meses</p>
            </div>
            <div>
              <p className="kv__label">Estado de Autorización</p>
              <p className="kv__value">{limits.parameters.estadoLicencia}</p>
            </div>
          </div>
        </section>

        <section className="card" aria-label="Matriz de riesgo UIF">
          <div className="row row--between">
            <h2 className="card__title" style={{ marginBottom: 0 }}>Matriz de Riesgo UIF por Expediente</h2>
            <Badge tone="neutral">Debida Dilencia</Badge>
          </div>
          {limits.riskMatrix.map((band) => (
            <div className="wallet-row" key={band.band}>
              <div>
                <p style={{ fontWeight: 700, fontSize: 13 }}>Riesgo {band.band}</p>
                <p className="wallet-row__key">{band.action}</p>
              </div>
              <Badge tone={bandTone(band.band)}>{band.expedientes} expedientes</Badge>
            </div>
          ))}
          <p className="small muted mt-8">
            La clasificación considera estado KYC, observaciones del checklist y salud documental de cada expediente
            institucional.
          </p>
        </section>
      </div>

      <div className="grid grid--2 section">
        <section className="card" aria-label="Expedientes en seguimiento">
          <h2 className="card__title">Expedientes en Seguimiento</h2>
          {clients.slice(0, 5).map((client) => (
            <div className="wallet-row" key={client.id}>
              <div>
                <p style={{ fontWeight: 700, fontSize: 13 }}>{client.name}</p>
                <p className="wallet-row__key">{client.id} · {client.sector}</p>
              </div>
              <Badge tone={client.kycStatus === 'Aprobado' ? 'success' : client.kycStatus === 'Pendiente' ? 'neutral' : 'warning'}>
                {client.kycStatus}
              </Badge>
            </div>
          ))}
        </section>

        <section className="card" aria-label="Trazabilidad de auditoría">
          <h2 className="card__title">Trazabilidad de Auditoría</h2>
          <div className="feed">
            {events.map((event) => (
              <div className="feed__item" key={event.id}>
                <span className={`feed__dot${event.action.includes('observado') ? ' feed__dot--danger' : ' feed__dot--success'}`} />
                <div>
                  <p className="feed__body">{event.detail}</p>
                  <p className="feed__meta">
                    {event.actor} · {new Date(event.at).toLocaleString('es-BO', { dateStyle: 'short', timeStyle: 'short' })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {element}
    </div>
  );
}
