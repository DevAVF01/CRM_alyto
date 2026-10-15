import { useMemo, useState } from 'react';
import type { DragEvent, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { MOCK_DEALS, PIPELINE_SUMMARY, STAGES, stageName } from '../data/mock';
import type { DealRecord, DealStage } from '../types';
import { api, ApiError } from '../api/client';
import { useApiData } from '../hooks/useApiData';
import { Badge, Icon, healthTone, usd, useToast } from '../components/ui';

export default function PipelineScreen() {
  const navigate = useNavigate();
  const { show, element } = useToast();
  const { data: deals, setData, live } = useApiData<DealRecord[]>(() => api.deals.list(), MOCK_DEALS);
  const [dropStage, setDropStage] = useState<DealStage | null>(null);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [company, setCompany] = useState('');
  const [monthlyVolume, setMonthlyVolume] = useState('');
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return deals;
    return deals.filter((deal) =>
      `${deal.company} ${deal.dealType}`.toLowerCase().includes(term),
    );
  }, [deals, query]);

  const byStage = (stage: DealStage) => filtered.filter((deal) => deal.stage === stage);

  const handleDrop = async (event: DragEvent<HTMLElement>, stage: DealStage) => {
    event.preventDefault();
    setDropStage(null);
    const id = event.dataTransfer.getData('text/deal-id');
    if (!id) return;
    const deal = deals.find((item) => item.id === id);
    if (!deal || deal.stage === stage) return;

    setData((current) => current.map((item) => (item.id === id ? { ...item, stage } : item)));
    try {
      await api.deals.move(id, stage);
      show(`${deal.company} movido a ${stageName(stage)}`);
    } catch (err) {
      setData((current) => current.map((item) => (item.id === id ? { ...item, stage: deal.stage } : item)));
      show(err instanceof ApiError ? err.message : 'No fue posible actualizar la etapa en el servidor');
    }
  };

  const submitProspect = async (event: FormEvent) => {
    event.preventDefault();
    const name = company.trim();
    if (!name) {
      show('Indique la razón social del prospecto');
      return;
    }
    setSaving(true);
    try {
      const created = await api.deals.create({
        company: name,
        monthlyVolume: Number(monthlyVolume.replace(/[^\d.]/g, '')) || 0,
      });
      setData((current) => [...current, created]);
      setCompany('');
      setMonthlyVolume('');
      setCreating(false);
      show(`Prospecto ${created.id} registrado en ${stageName(created.stage)}`);
    } catch (err) {
      show(err instanceof ApiError ? err.message : 'El backend no respondió, no se creó el prospecto');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <p className="page-head__kicker">Pipeline de Transferencias</p>
          <h1 className="page-head__title">Embudo Comercial B2B</h1>
          <p className="page-head__sub">6 etapas, desde prospecto hasta cliente activo</p>
        </div>
        <span className={`source-pill${live ? ' source-pill--live' : ''}`}>
          {live ? 'Datos del backend' : 'Datos de demostración'}
        </span>
      </div>

      <section className="grid grid--kpis section kanban-summary" aria-label="Resumen del embudo">
        <div className="card stat">
          <p className="stat__label">Volumen en Trámite</p>
          <p className="stat__value">{usd(PIPELINE_SUMMARY.volumenTramite)}</p>
          <p className="stat__hint">{PIPELINE_SUMMARY.cuentasActivas} cuentas activas</p>
        </div>
        <div className="card stat">
          <p className="stat__label">Pruebas en Curso</p>
          <p className="stat__value">{PIPELINE_SUMMARY.pruebasEnCurso}</p>
          <p className="stat__hint">En proceso</p>
        </div>
      </section>

      <div className="row row--between section" style={{ flexWrap: 'wrap', gap: 10 }}>
        <input
          className="input"
          style={{ maxWidth: 360 }}
          placeholder="Buscar por cliente o tipología de pago"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button type="button" className="btn btn--ghost btn--sm"><Icon name="doc" size={14} /> Filtros</button>
      </div>

      {creating ? (
        <form className="card section" onSubmit={submitProspect} aria-label="Nuevo prospecto">
          <h2 className="card__title">Registrar Prospecto Institucional</h2>
          <div className="row" style={{ flexWrap: 'wrap', gap: 10 }}>
            <input
              className="input"
              style={{ flex: 2, minWidth: 220 }}
              placeholder="Razón social, por ejemplo Comercial del Altiplano S.A."
              value={company}
              onChange={(event) => setCompany(event.target.value)}
              aria-label="Razón social del prospecto"
            />
            <input
              className="input"
              style={{ flex: 1, minWidth: 150 }}
              placeholder="Volumen mensual estimado"
              inputMode="numeric"
              value={monthlyVolume}
              onChange={(event) => setMonthlyVolume(event.target.value)}
              aria-label="Volumen mensual estimado"
            />
            <button type="submit" className="btn btn--primary btn--sm" disabled={saving}>
              <Icon name="plus" size={14} /> {saving ? 'Registrando' : 'Crear Prospecto'}
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setCreating(false)}>
              Cancelar
            </button>
          </div>
          <p className="small muted mt-8">
            El prospecto abre el expediente en etapa 1 y queda disponible para la debida diligencia del ECP.
          </p>
        </form>
      ) : null}

      <div className="kanban" role="list" aria-label="Etapas del pipeline">
        {STAGES.map((label, index) => {
          const stage = (index + 1) as DealStage;
          const stageDeals = byStage(stage);
          return (
            <section
              key={label}
              className={`kanban__col${dropStage === stage ? ' kanban__col--drop' : ''}`}
              role="listitem"
              aria-label={label}
              onDragOver={(event) => {
                event.preventDefault();
                setDropStage(stage);
              }}
              onDragLeave={() => setDropStage((current) => (current === stage ? null : current))}
              onDrop={(event) => void handleDrop(event, stage)}
            >
              <header className="kanban__colhead">
                <span>{label}</span>
                <span className="kanban__count">{stageDeals.length}</span>
              </header>
              {stageDeals.map((deal) => (
                <article
                  key={deal.id}
                  className="deal-card"
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData('text/deal-id', deal.id);
                    event.dataTransfer.effectAllowed = 'move';
                  }}
                >
                  <p className="deal-card__company">{deal.company}</p>
                  <div className="deal-card__meta">
                    <span className="mono">{deal.id}</span>
                    <span>{deal.dealType}</span>
                    <span>Frecuencia: {deal.frequency}</span>
                  </div>
                  <div className="deal-card__foot">
                    <span className="deal-card__amount">{usd(deal.monthlyVolume)} / mes</span>
                    <Badge tone={healthTone(deal.health)}>{deal.health}</Badge>
                  </div>
                  <div className="row mt-8">
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => navigate(`/clientes/${deal.clientId}`)}
                    >
                      Detalles
                    </button>
                    <button
                      type="button"
                      className="btn btn--primary btn--sm"
                      onClick={() => navigate(`/clientes/${deal.clientId}`)}
                    >
                      Gestionar
                    </button>
                  </div>
                </article>
              ))}
              {stageDeals.length === 0 ? (
                <p className="small muted" style={{ padding: '8px 4px' }}>
                  Arrastre una oportunidad a esta etapa
                </p>
              ) : null}
            </section>
          );
        })}
      </div>

      <button type="button" className="btn btn--primary fab" onClick={() => setCreating((current) => !current)}>
        <Icon name="plus" size={16} /> Nuevo Prospecto
      </button>

      {element}
    </div>
  );
}
