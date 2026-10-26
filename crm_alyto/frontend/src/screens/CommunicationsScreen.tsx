import { useEffect, useMemo, useState } from 'react';
import { MOCK_CLIENTS, MOCK_OBJECTIONS, MOCK_TEMPLATES } from '../data/mock';
import type { ClientRecord, Objection, Template } from '../types';
import { ApiError, api } from '../api/client';
import { useApiData } from '../hooks/useApiData';
import { SourcePill } from '../components/SourcePill';
import { Badge, Icon, copyToClipboard, useToast } from '../components/ui';

const TEMPLATE_FILTERS = ['Todas', 'Primer Acercamiento', 'Instrucciones', 'Seguimiento'] as const;

function renderTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{(\w+)\}\}/g, (raw, key: string) => vars[key] ?? raw);
}

export default function CommunicationsScreen() {
  const { show, element } = useToast();
  const [filter, setFilter] = useState<(typeof TEMPLATE_FILTERS)[number]>('Todas');
  const [selectedTemplateId, setSelectedTemplateId] = useState(MOCK_TEMPLATES[0].id);
  const [selectedObjectionId, setSelectedObjectionId] = useState(MOCK_OBJECTIONS[0].id);
  const [nombre, setNombre] = useState('Oficial de Finanzas');
  const [asesor, setAsesor] = useState('Fuerza de Ventas B2B');
  const [sending, setSending] = useState(false);
  const [lastAuditId, setLastAuditId] = useState<number | null>(null);

  const { data: allTemplates, live } = useApiData<Template[]>(
    () => api.communications.templates(),
    MOCK_TEMPLATES,
  );
  const { data: objections } = useApiData<Objection[]>(
    () => api.communications.objections(),
    MOCK_OBJECTIONS,
  );
  const { data: clients } = useApiData<ClientRecord[]>(() => api.clients.list(), MOCK_CLIENTS);
  const [clientId, setClientId] = useState('');

  const templates = useMemo(
    () => allTemplates.filter((tpl) => filter === 'Todas' || tpl.category === filter),
    [allTemplates, filter],
  );
  const template =
    allTemplates.find((tpl) => tpl.id === selectedTemplateId) ?? templates[0] ?? allTemplates[0];
  const objection =
    objections.find((item) => item.id === selectedObjectionId) ?? objections[0];

  useEffect(() => {
    if (!template) return;
    if (selectedTemplateId !== template.id) setSelectedTemplateId(template.id);
  }, [template, selectedTemplateId]);

  useEffect(() => {
    if (clients.some((client) => client.id === clientId)) return;
    setClientId(clients[0]?.id ?? '');
  }, [clients, clientId]);

  const preview = renderTemplate(template?.body ?? '', {
    nombre,
    asesor,
    empresa: 'su empresa',
    operacion: 'TX-90034',
    estado: 'Completada en ECP',
    monto: '145,000.00 USD',
  });

  const copyText = (text: string, label: string) => {
    void copyToClipboard(text).then(() => show(label));
  };

  const sendToChannel = async () => {
    if (!template) return;
    setSending(true);
    try {
      const result = await api.communications.send({
        templateId: template.id,
        clientId,
        channel: template.channel,
        vars: { nombre, asesor },
      });
      setLastAuditId(result.auditId);
      show(live ? `Comunicación registrada, auditoría #${result.auditId}` : 'Comunicación preparada en modo demostración');
    } catch (err) {
      show(err instanceof ApiError ? err.message : 'El backend no respondió, la comunicación no se registró');
    } finally {
      setSending(false);
    }
  };

  if (!template || !objection) {
    return <p className="small muted">Sin plantillas auditadas disponibles.</p>;
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <p className="page-head__kicker">CÓD. COMUNICACIÓN REGULADA, Versión 2.4 ECP</p>
          <h1 className="page-head__title">Comunicaciones y Plantillas</h1>
          <p className="page-head__sub">Biblioteca auditada y asistente de objeciones B2B</p>
        </div>
        <SourcePill live={live} liveLabel="Biblioteca del backend" />
      </div>

      <section className="card assistant section" aria-label="Asistente IA de objeciones">
        <div className="assistant__head">
          <h2 className="card__title" style={{ marginBottom: 0 }}>Asistente IA de Respuestas y Objeciones</h2>
          <Badge tone="accent">IA ACTIVA</Badge>
          <Badge tone="neutral">Directriz Legal</Badge>
        </div>

        <div className="chip-row">
          {objections.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`chip${item.id === objection.id ? ' chip--active' : ''}`}
              onClick={() => setSelectedObjectionId(item.id)}
            >
              {item.title}
            </button>
          ))}
        </div>

        <div className="assistant__response mt-12">
          <p>{objection.response}</p>
        </div>
        <div className="assistant__checks">
          <Badge tone="success"><Icon name="check" size={11} /> Conformidad ASFI: {objection.conformity}</Badge>
          <Badge tone="success">Sin términos prohibidos</Badge>
          <Badge tone="neutral">{objection.legalBasis}</Badge>
        </div>
        <div className="row">
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => copyText(objection.response, 'Argumento copiado')}>
            <Icon name="copy" size={14} /> Copiar Argumento
          </button>
          <button type="button" className="btn btn--primary btn--sm" onClick={() => show('Argumento insertado en la vista previa')}>
            Insertar en Vista Previa
          </button>
        </div>
      </section>

      <div className="grid grid--2 section">
        <section aria-label="Biblioteca de plantillas">
          <div className="chip-row" style={{ marginBottom: 12 }}>
            {TEMPLATE_FILTERS.map((item) => (
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

          <h2 className="card__title">Biblioteca de Plantillas Auditadas</h2>
          {templates.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              className={`tpl-item${tpl.id === template.id ? ' tpl-item--active' : ''}`}
              onClick={() => setSelectedTemplateId(tpl.id)}
            >
              <span>
                <span className="tpl-item__id">{tpl.id}</span>
                <br />
                <span className="tpl-item__name">{tpl.name}</span>
                <br />
                <span className="small muted">{tpl.category} · {tpl.channel}</span>
              </span>
              <Badge tone="success">Auditada</Badge>
            </button>
          ))}
        </section>

        <section className="card" aria-label="Vista previa de plantilla">
          <h2 className="card__title">Vista Previa de Redacción Neutra</h2>
          <div className="row" style={{ marginBottom: 10 }}>
            <input
              className="input"
              style={{ height: 36, flex: 1, minWidth: 140 }}
              value={nombre}
              onChange={(event) => setNombre(event.target.value)}
              aria-label="Variable nombre"
            />
            <input
              className="input"
              style={{ height: 36, flex: 1, minWidth: 140 }}
              value={asesor}
              onChange={(event) => setAsesor(event.target.value)}
              aria-label="Variable asesor"
            />
          </div>
          <p className="small muted">Plantilla auditada: cumple directrices ASFI.</p>
          <label className="field" style={{ marginBottom: 10 }}>
            <span className="field__label">Expediente destinatario</span>
            <select
              className="input"
              style={{ height: 36 }}
              value={clientId}
              onChange={(event) => setClientId(event.target.value)}
              aria-label="Expediente destinatario"
            >
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name} · {client.id}
                </option>
              ))}
            </select>
          </label>
          <div className="preview-body">{preview}</div>
          <div className="hash-line">
            <Icon name="key" size={13} />
            <span>Huella criptográfica: {template.auditHash}</span>
            <Badge tone="success">{template.approval}</Badge>
          </div>
          <div className="row">
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => copyText(preview, 'Texto seguro copiado')}>
              <Icon name="copy" size={14} /> Copiar Texto Seguro
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => show('Solicitud de aprobación enviada')}>
              Solicitar Aprobación
            </button>
          </div>
          <button
            type="button"
            className="btn btn--primary btn--block mt-12"
            onClick={() => void sendToChannel()}
            disabled={sending}
          >
            <Icon name="send" size={15} /> {sending ? 'Registrando envío' : 'Enviar por Canal Institucional'}
          </button>
          {lastAuditId !== null ? (
            <p className="small muted mt-8">Asiento de auditoría #{lastAuditId} generado en el backend.</p>
          ) : null}
        </section>
      </div>

      <section className="card" aria-label="Trazabilidad de notificaciones">
        <h2 className="card__title">Trazabilidad de Notificaciones</h2>
        <p className="small muted">
          Toda notificación queda registrada en tiempo real sobre el ledger de Stellar Testnet con huella verificable por la ASFI.
        </p>
      </section>

      {element}
    </div>
  );
}
