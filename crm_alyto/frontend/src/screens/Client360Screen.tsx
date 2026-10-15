import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  MOCK_CHECKLISTS,
  MOCK_CLIENTS,
  MOCK_TRANSACTIONS,
  MOCK_WALLETS,
} from '../data/mock';
import type { ChecklistStatus, ClientRecord } from '../types';
import type { ClientDetail } from '../api/client';
import { ApiError, api, downloadTransferReceipt, transferValidationSheet } from '../api/client';
import { useApiData } from '../hooks/useApiData';
import {
  Badge,
  Icon,
  checklistTone,
  compactHash,
  copyToClipboard,
  healthTone,
  kycTone,
  txTone,
  usd,
  useToast,
} from '../components/ui';

const TABS = ['General', 'Operaciones', 'Custodia', 'Documentos'] as const;
type Tab = (typeof TABS)[number];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((word) => /^[A-ZÁÉÍÓÚÑ]/.test(word))
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
}

function fallbackDetail(client: ClientRecord): ClientDetail {
  return {
    ...client,
    wallets: MOCK_WALLETS.filter((wallet) => wallet.clientId === client.id),
    transactions: MOCK_TRANSACTIONS.filter((tx) => tx.clientId === client.id),
    deal: null,
  };
}

export default function Client360Screen() {
  const { clientId } = useParams<{ clientId?: string }>();
  const { show, element } = useToast();
  const [tab, setTab] = useState<Tab>('General');
  const [busy, setBusy] = useState<'report' | 'receipt' | null>(null);

  const { data: clients } = useApiData<ClientRecord[]>(() => api.clients.list(), MOCK_CLIENTS);

  const selectedId =
    clientId && clients.some((client) => client.id === clientId)
      ? clientId
      : (clients[0]?.id ?? MOCK_CLIENTS[0].id);

  const fallback = useMemo(
    () => fallbackDetail(clients.find((client) => client.id === selectedId) ?? MOCK_CLIENTS[0]),
    [clients, selectedId],
  );

  const { data: client, live } = useApiData<ClientDetail>(
    () => api.clients.get(selectedId),
    fallback,
    [selectedId],
  );

  const {
    data: checklist,
    setData: setChecklist,
    live: checklistLive,
  } = useApiData(
    async () => (await api.compliance.checklist(selectedId)).items,
    MOCK_CHECKLISTS[selectedId] ?? [],
    [selectedId],
  );

  const wallets = client.wallets ?? [];
  const transactions = client.transactions ?? [];
  const progress = client.monthlyLimit
    ? Math.min(100, (client.volumeProcessed / client.monthlyLimit) * 100)
    : 0;

  const updateItem = async (key: string, status: ChecklistStatus) => {
    const previous = checklist;
    setChecklist((current) =>
      current.map((item) => (item.key === key ? { ...item, status } : item)),
    );
    try {
      await api.compliance.updateChecklistItem(client.id, key, status);
      show(checklistLive ? 'Checklist sincronizado con el backend' : 'Checklist actualizado en modo demostración');
    } catch (err) {
      setChecklist(previous);
      show(err instanceof ApiError ? err.message : 'Sin sesión de cumplimiento válida para actualizar el checklist');
    }
  };

  const copyKey = (value: string) => {
    void copyToClipboard(value).then(() => show('Clave pública copiada al portapapeles'));
  };

  const exportReport = async () => {
    setBusy('report');
    try {
      await transferValidationSheet(client.id);
      show('Informe ASFI descargado en PDF');
    } catch (err) {
      show(err instanceof ApiError ? err.message : 'El backend no respondió, no se generó el informe');
    } finally {
      setBusy(null);
    }
  };

  const registerOperation = async () => {
    const dealId = client.deal?.id ?? client.id;
    setBusy('receipt');
    try {
      await downloadTransferReceipt(dealId);
      show('Comprobante de operación test descargado');
    } catch (err) {
      show(err instanceof ApiError ? err.message : 'No fue posible generar el comprobante');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <p className="page-head__kicker">Ficha de Cliente 360°</p>
          <h1 className="page-head__title">Directorio Institucional B2B</h1>
          <p className="page-head__sub">Perfil corporativo, custodia y trazabilidad operativa</p>
        </div>
        <span className={`source-pill${live ? ' source-pill--live' : ''}`}>
          {live ? 'Expediente en vivo' : 'Datos de demostración'}
        </span>
      </div>

      <div className="client-layout">
        <aside className="client-list" aria-label="Directorio de clientes">
          {clients.map((item) => (
            <a
              key={item.id}
              href={`/clientes/${item.id}`}
              className={`client-list__item${item.id === client.id ? ' client-list__item--active' : ''}`}
            >
              <span className="client-list__name">{item.name}</span>
              <span className="client-list__id">{item.id} · {item.sector}</span>
            </a>
          ))}
        </aside>

        <section>
          <div className="card section">
            <div className="row row--between">
              <div className="profile-head">
                <span className="avatar">{initials(client.name)}</span>
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 800 }}>{client.name}</h2>
                  <p className="small muted">NIT: {client.nit} · {client.country}</p>
                  <div className="row mt-8">
                    <Badge tone={kycTone(client.kycStatus)}>EN VALIDACIÓN ECP</Badge>
                    <Badge tone={healthTone(client.health)}>Salud: {client.health}</Badge>
                  </div>
                </div>
              </div>
              <div className="row">
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  onClick={() => void registerOperation()}
                  disabled={busy !== null}
                >
                  <Icon name="bolt" size={14} /> {busy === 'receipt' ? 'Generando' : 'Registrar Operación Test'}
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => void exportReport()}
                  disabled={busy !== null}
                >
                  <Icon name="doc" size={14} /> Exportar Informe ASFI
                </button>
              </div>
            </div>
          </div>

          <div className="tabs" role="tablist">
            {TABS.map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={tab === item}
                className={`tab${tab === item ? ' tab--active' : ''}`}
                onClick={() => setTab(item)}
              >
                {item}
              </button>
            ))}
          </div>

          {tab === 'General' ? (
            <>
              <section className="grid grid--kpis section" aria-label="Métricas de tesorería">
                <div className="card stat">
                  <p className="stat__label">Volumen Acumulado Procesado</p>
                  <p className="stat__value">{usd(client.volumeProcessed)}</p>
                  <p className="stat__hint stat__hint--up">+18.4% este mes</p>
                </div>
                <div className="card stat">
                  <p className="stat__label">Límite Mensual ECP</p>
                  <p className="stat__value">{usd(client.monthlyLimit)}</p>
                  <div className="progress mt-8">
                    <div className="progress__fill" style={{ width: `${progress}%` }} />
                  </div>
                </div>
                <div className="card stat">
                  <p className="stat__label">Frecuencia Operativa</p>
                  <p className="stat__value">{client.frequency} / mes</p>
                  <p className="stat__hint">Pagos transfronterizos recurrentes</p>
                </div>
                <div className="card stat">
                  <p className="stat__label">Protocolo Custodial</p>
                  <p className="stat__value" style={{ fontSize: 16 }}>{client.custodialProtocol}</p>
                  <p className="stat__hint">Wallets custodiales institucionales</p>
                </div>
              </section>

              <section className="card section" aria-label="Datos corporativos">
                <h2 className="card__title">Datos del Expediente</h2>
                <div className="kv">
                  <div>
                    <p className="kv__label">Representante Legal</p>
                    <p className="kv__value">{client.representative}</p>
                  </div>
                  <div>
                    <p className="kv__label">Régimen ECP</p>
                    <p className="kv__value">{client.regime}</p>
                  </div>
                  <div>
                    <p className="kv__label">Tipología de Pago</p>
                    <p className="kv__value">{client.sector}</p>
                  </div>
                  <div>
                    <p className="kv__label">Expediente</p>
                    <p className="kv__value mono">{client.id}</p>
                  </div>
                  <div>
                    <p className="kv__label">Estado de Debida Diligencia</p>
                    <p className="kv__value">{client.kycStatus}</p>
                  </div>
                  <div>
                    <p className="kv__label">Salud de Cuenta</p>
                    <p className="kv__value">{client.health}</p>
                  </div>
                </div>
              </section>
            </>
          ) : null}

          {tab === 'Operaciones' ? (
            <section className="card section" aria-label="Historial de transferencias internacionales">
              <h2 className="card__title">Historial de Transferencias Internacionales</h2>
              {transactions.length === 0 ? (
                <p className="small muted">Sin transferencias registradas en el periodo.</p>
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
                        <th>Hash Stellar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.map((tx) => (
                        <tr key={tx.id}>
                          <td className="mono">{tx.id}</td>
                          <td>{tx.beneficiary}</td>
                          <td>{tx.destination}</td>
                          <td className="table__num">{usd(tx.amountUsd)}</td>
                          <td><Badge tone={txTone(tx.status)}>{tx.status}</Badge></td>
                          <td className="mono">{compactHash(tx.hash)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ) : null}

          {tab === 'Custodia' ? (
            <>
              <div className="card card--dark vault section">
                <div>
                  <p className="vault__label">Custodia Multifirma Institucional, Protocolo AlyPay</p>
                  <p className="vault__value">Vault: {client.vault}</p>
                </div>
                <button type="button" className="btn btn--ghost-light btn--sm" onClick={() => copyKey(client.vault)}>
                  <Icon name="copy" size={14} /> Copiar
                </button>
              </div>

              <section className="card section" aria-label="Wallets custodiales">
                <h2 className="card__title">Wallets Custodiales Institucionales</h2>
                {wallets.length === 0 ? (
                  <p className="small muted">Sin wallets registradas para este expediente.</p>
                ) : (
                  wallets.map((wallet) => (
                    <div className="wallet-row" key={wallet.publicKey}>
                      <div>
                        <p style={{ fontWeight: 700, fontSize: 13 }}>{wallet.label} · {wallet.asset}</p>
                        <p className="wallet-row__key">{wallet.publicKey}</p>
                      </div>
                      <div className="row">
                        <Badge tone="success">Activa</Badge>
                        <span className="small" style={{ fontWeight: 700 }}>{wallet.balance} {wallet.asset}</span>
                        <button type="button" className="icon-btn" onClick={() => copyKey(wallet.publicKey)} aria-label="Copiar clave pública">
                          <Icon name="copy" size={14} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </section>
            </>
          ) : null}

          {tab === 'Documentos' ? (
            <section className="card" aria-label="Checklist de debida diligencia">
              <div className="row row--between">
                <h2 className="card__title" style={{ marginBottom: 0 }}>Checklist de Debida Diligencia ECP</h2>
                <Badge tone="accent">Resolución ASFI 2024</Badge>
              </div>
              {checklist.length === 0 ? (
                <p className="small muted">El expediente no tiene checklist registrado.</p>
              ) : (
                checklist.map((item, index) => (
                  <div className="check-item" key={item.key}>
                    <div>
                      <p className="check-item__label">
                        <span className="check-item__num">{String(index + 1).padStart(2, '0')}</span>
                        {item.label}
                      </p>
                      <p className="check-item__detail">{item.detail}</p>
                    </div>
                    <div className="row">
                      <Badge tone={checklistTone(item.status)}>{item.status}</Badge>
                      <select
                        className="input"
                        style={{ height: 32, width: 140, fontSize: 12 }}
                        value={item.status}
                        onChange={(event) => void updateItem(item.key, event.target.value as ChecklistStatus)}
                        aria-label={`Estado de ${item.label}`}
                      >
                        <option value="Pendiente">Pendiente</option>
                        <option value="En revision">En revision</option>
                        <option value="Aprobado">Aprobado</option>
                        <option value="Observado">Observado</option>
                      </select>
                    </div>
                  </div>
                ))
              )}
            </section>
          ) : null}
        </section>
      </div>

      {element}
    </div>
  );
}
