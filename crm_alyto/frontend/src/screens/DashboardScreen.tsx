import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DISTRIBUTION,
  KPI_CIERRE_DIAS,
  KPI_LEADS,
  KPI_MONTHLY_USD,
  KPI_MONTH_LABELS,
  KPI_PENDIENTES_ECP,
  KPI_VOLUME_TOTAL,
  MOCK_CLIENTS,
  MOCK_TRANSACTIONS,
} from '../data/mock';
import type { ClientRecord, TransferTx } from '../types';
import { api } from '../api/client';
import { useApiData } from '../hooks/useApiData';
import { Badge, Icon, txTone, usd, usdCompact } from '../components/ui';

const FILTERS = ['Todos', 'B2B Corporativo', 'En Validación ECP', 'Aprobados ASFI'] as const;
type Filter = (typeof FILTERS)[number];

const FILTER_MATCHERS: Record<Filter, (tx: TransferTx) => boolean> = {
  Todos: () => true,
  'B2B Corporativo': () => true,
  'En Validación ECP': (tx) => tx.status !== 'Completada en ECP',
  'Aprobados ASFI': (tx) => tx.status === 'Completada en ECP',
};

export default function DashboardScreen() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('Todos');
  const { data: transfers, live } = useApiData<TransferTx[]>(() => api.transfers.list(), MOCK_TRANSACTIONS);
  const { data: clients } = useApiData<ClientRecord[]>(() => api.clients.list(), MOCK_CLIENTS);

  const maxMonthly = Math.max(...KPI_MONTHLY_USD);
  const recent = useMemo(() => {
    const matcher = FILTER_MATCHERS[filter];
    return [...transfers].reverse().filter(matcher).slice(0, 5);
  }, [transfers, filter]);
  const totalDistribution = DISTRIBUTION.reduce((acc, row) => acc + row.amount, 0);

  return (
    <div>
      <div className="page-head">
        <div>
          <p className="page-head__kicker">ALYTO CRM • AV FINANCE</p>
          <h1 className="page-head__title">Dashboard Ejecutivo Ventas y Pagos Transfronterizos</h1>
          <p className="page-head__sub">Panel operativo B2B bajo supervisión de ASFI en el ECP</p>
        </div>
        <div className="row">
          <button type="button" className="btn btn--primary btn--sm" onClick={() => navigate('/pipeline')}>
            <Icon name="plus" size={14} /> Nuevo Prospecto
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => navigate('/cumplimiento')}>
            <Icon name="shield" size={14} /> Validar ECP
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => navigate('/clientes')}>
            <Icon name="doc" size={14} /> Reporte ASFI
          </button>
        </div>
      </div>

      <div className="chip-row section">
        {FILTERS.map((item) => (
          <button
            key={item}
            type="button"
            className={`chip${filter === item ? ' chip--active' : ''}`}
            onClick={() => setFilter(item)}
          >
            {item}
          </button>
        ))}
      </div>

      <section className="grid grid--kpis section" aria-label="Indicadores principales">
        <div className="card stat">
          <p className="stat__label">Volumen Total Transaccionado</p>
          <p className="stat__value">{usd(KPI_VOLUME_TOTAL)}</p>
          <p className="stat__hint stat__hint--up">+24.5% vs mes anterior</p>
        </div>
        <div className="card stat">
          <p className="stat__label">Pendientes ECP</p>
          <p className="stat__value">{KPI_PENDIENTES_ECP}</p>
          <p className="stat__hint">Operaciones en curso</p>
        </div>
        <div className="card stat">
          <p className="stat__label">Leads Calificados</p>
          <p className="stat__value">{KPI_LEADS}</p>
          <p className="stat__hint">{clients.length} expedientes B2B activos</p>
        </div>
        <div className="card stat">
          <p className="stat__label">Tiempo Promedio de Cierre</p>
          <p className="stat__value">{KPI_CIERRE_DIAS} días</p>
          <p className="stat__hint">Ciclo ECP Regulatorio</p>
        </div>
      </section>

      <div className="grid grid--2 section">
        <section className="card" aria-label="Evolución mensual">
          <h2 className="card__title">Evolución Mensual de Procesamiento ECP</h2>
          <div className="bars">
            {KPI_MONTHLY_USD.map((value, index) => (
              <div className="bars__item" key={KPI_MONTH_LABELS[index]}>
                <span className="bars__value">{usdCompact(value)}</span>
                <div
                  className={`bars__bar${index === KPI_MONTHLY_USD.length - 1 ? ' bars__bar--accent' : ''}`}
                  style={{ height: `${Math.round((value / maxMonthly) * 100)}%` }}
                />
                <span className="bars__label">{KPI_MONTH_LABELS[index]}</span>
              </div>
            ))}
          </div>
          <p className="small muted mt-8">
            100% de la liquidación protocolar se registra sobre contratos inteligentes en Stellar Testnet.
          </p>
        </section>

        <section className="card" aria-label="Distribución operativa">
          <h2 className="card__title">Salud y Distribución Operativa B2B</h2>
          {DISTRIBUTION.map((row) => (
            <div className="dist-row" key={row.label}>
              <div className="dist-row__head">
                <span>{row.label}</span>
                <span className="dist-row__pct">{usd(row.amount)} ({row.pct}%)</span>
              </div>
              <div className="progress">
                <div className="progress__fill" style={{ width: `${(row.amount / totalDistribution) * 100}%` }} />
              </div>
            </div>
          ))}
          <p className="small muted">
            {live
              ? 'Custodia institucional con wallets custodiales, sincronizada con el conector Stellar.'
              : 'Wallets custodiales institucionales, índice de salud operativa: 98.4%.'}
          </p>
        </section>
      </div>

      <section className="card" aria-label="Transferencias recientes">
        <h2 className="card__title">Transferencias Internacionales Recientes</h2>
        {recent.length === 0 ? (
          <p className="small muted">No hay operaciones que cumplan el filtro seleccionado.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Operación</th>
                  <th>Beneficiario</th>
                  <th>Destino</th>
                  <th className="table__num">Monto</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((tx) => (
                  <tr key={tx.id}>
                    <td className="mono">{tx.id}</td>
                    <td>{tx.beneficiary}</td>
                    <td>{tx.destination}</td>
                    <td className="table__num">{usd(tx.amountUsd)}</td>
                    <td>
                      <Badge tone={txTone(tx.status)}>{tx.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
