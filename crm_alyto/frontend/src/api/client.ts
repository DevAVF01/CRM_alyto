import type {
  AuditEvent,
  ChecklistItem,
  ClientRecord,
  ComplianceSummary,
  DealRecord,
  DealStage,
  EcpLimits,
  Objection,
  Template,
  TransferTx,
  WalletRecord,
} from '../types';

export interface EcpDirective {
  code: string;
  description: string;
}

export interface ClientDetail extends ClientRecord {
  wallets: WalletRecord[];
  transactions: TransferTx[];
  deal: DealRecord | null;
}

export interface SendResult {
  template: string;
  auditId: number;
  push: unknown;
  vars: Record<string, string>;
}

const STORAGE_KEY = 'alyto.ecp.session';

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function currentToken(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return (JSON.parse(raw) as { accessToken?: string }).accessToken ?? null;
  } catch {
    return null;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH';
  body?: unknown;
  signal?: AbortSignal;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = currentToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(`/api${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });

  if (response.status === 204) return undefined as T;

  const payload = (await response.json().catch(() => ({}))) as
    | { data?: T; error?: { code?: string; message?: string } }
    | null;

  if (!response.ok) {
    const err = payload?.error;
    throw new ApiError(response.status, err?.code ?? 'API_ERROR', err?.message ?? 'Error del servidor');
  }
  return (payload?.data ?? (payload as unknown)) as T;
}

export const api = {
  meta: {
    stages: () => request<string[]>('/meta/stages'),
  },
  clients: {
    list: () => request<ClientRecord[]>('/clients'),
    get: (id: string) => request<ClientDetail>(`/clients/${encodeURIComponent(id)}`),
  },
  transfers: {
    list: () => request<TransferTx[]>('/transfers'),
  },
  deals: {
    list: (stage?: DealStage) =>
      request<DealRecord[]>(`/deals${stage ? `?stage=${stage}` : ''}`),
    create: (input: { company: string; dealType?: string; monthlyVolume?: number }) =>
      request<DealRecord>('/deals', { method: 'POST', body: input }),
    move: (id: string, stage: DealStage) =>
      request<DealRecord>(`/deals/${encodeURIComponent(id)}/stage`, { method: 'PATCH', body: { stage } }),
  },
  compliance: {
    summary: () => request<ComplianceSummary>('/compliance/summary'),
    limits: () => request<EcpLimits>('/compliance/limits'),
    directrices: () => request<EcpDirective[]>('/compliance/directrices'),
    checklist: (clientId: string) =>
      request<{ clientId: string; items: ChecklistItem[] }>(`/compliance/checklist/${encodeURIComponent(clientId)}`),
    updateChecklistItem: (clientId: string, itemKey: string, status: ChecklistItem['status']) =>
      request<ChecklistItem>(
        `/compliance/checklist/${encodeURIComponent(clientId)}/items/${encodeURIComponent(itemKey)}`,
        { method: 'POST', body: { status } },
      ),
    audit: () => request<AuditEvent[]>('/compliance/audit'),
    addAudit: (input: { action: string; detail: string }) =>
      request<AuditEvent>('/compliance/audit', { method: 'POST', body: input }),
  },
  communications: {
    templates: (category?: string) =>
      request<Template[]>(`/communications/templates${category && category !== 'Todas' ? `?category=${encodeURIComponent(category)}` : ''}`),
    objections: () => request<Objection[]>('/communications/objections'),
    send: (input: { templateId: string; clientId?: string; channel?: string; vars?: Record<string, string> }) =>
      request<SendResult>('/communications/send', { method: 'POST', body: input }),
  },
};

async function requestBlob(path: string, options: RequestOptions = {}): Promise<Blob> {
  const token = currentToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(`/api${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: { message?: string } } | null;
    throw new ApiError(response.status, 'REPORT_ERROR', payload?.error?.message ?? 'No fue posible generar el documento');
  }
  return response.blob();
}

async function saveBlob(blob: Blob, filename: string): Promise<void> {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadValidationSheet(clientId: string): Promise<Blob> {
  return requestBlob(`/reports/validation-sheet/${encodeURIComponent(clientId)}`);
}

export async function transferValidationSheet(clientId: string): Promise<void> {
  const blob = await downloadValidationSheet(clientId);
  await saveBlob(blob, `informe-asfi-${clientId}.pdf`);
}

export async function downloadTransferReceipt(dealId: string): Promise<void> {
  const blob = await requestBlob('/reports/transfer-receipt', { method: 'POST', body: { dealId } });
  await saveBlob(blob, `comprobante-${dealId}.pdf`);
}

export function isNetworkError(error: unknown): boolean {
  return (
    error instanceof TypeError ||
    (error instanceof ApiError && error.code === 'API_ERROR' && error.status >= 500)
  );
}
