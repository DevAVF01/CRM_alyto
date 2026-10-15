import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { ChecklistStatus, Health, KycStatus, TxStatus } from '../types';

export type IconName =
  | 'grid'
  | 'kanban'
  | 'users'
  | 'mail'
  | 'shield'
  | 'eye'
  | 'eyeOff'
  | 'copy'
  | 'check'
  | 'warning'
  | 'key'
  | 'send'
  | 'doc'
  | 'bolt'
  | 'clock'
  | 'plus'
  | 'logout';

const PATHS: Record<IconName, ReactNode> = {
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  kanban: (
    <>
      <rect x="3" y="4" width="4.5" height="12" rx="1" />
      <rect x="9.75" y="4" width="4.5" height="16" rx="1" />
      <rect x="16.5" y="4" width="4.5" height="9" rx="1" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
      <circle cx="16.8" cy="9" r="2.4" />
      <path d="M16.5 14.4c2.4.4 4 2.1 4 4.6" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3l7 3v5c0 4.4-3 8.4-7 10-4-1.6-7-5.6-7-10V6l7-3z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M4 4l16 16" />
      <path d="M9.9 5.9A9.4 9.4 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.7 3.4M6 7.6A16 16 0 0 0 2.5 12S6 18.5 12 18.5c1.2 0 2.3-.2 3.3-.6" />
      <path d="M9.5 9.8a3 3 0 0 0 4.2 4.2" />
    </>
  ),
  copy: (
    <>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  warning: (
    <>
      <path d="M12 4 2.8 19.5h18.4L12 4z" />
      <path d="M12 10v4.5" />
      <circle cx="12" cy="17" r="0.4" fill="currentColor" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="14" r="4" />
      <path d="m11 11 8-8M16 6l2.5 2.5M13.5 8.5 16 11" />
    </>
  ),
  send: <path d="M21 3 10 14M21 3l-7 18-4-7-7-4 18-7z" />,
  doc: (
    <>
      <path d="M6 3h8l4 4v14H6V3z" />
      <path d="M14 3v4h4" />
      <path d="M9 12h6M9 16h6" />
    </>
  ),
  bolt: <path d="M13 2 4.5 13.5H11L9.5 22 19 9.5h-6.5L13 2z" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5l3.5 2" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  logout: (
    <>
      <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
      <path d="M10 8l-4 4 4 4M6 12h10" />
    </>
  ),
};

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}

export type BadgeTone = 'success' | 'warning' | 'danger' | 'neutral' | 'accent';

export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

export function kycTone(status: KycStatus): BadgeTone {
  if (status === 'Aprobado') return 'success';
  if (status === 'Pendiente') return 'neutral';
  return 'warning';
}

export function healthTone(health: Health): BadgeTone {
  if (health === 'Excelente') return 'success';
  if (health === 'Alta') return 'accent';
  if (health === 'En Riesgo Documental') return 'danger';
  return 'neutral';
}

export function txTone(status: TxStatus): BadgeTone {
  if (status === 'Completada en ECP') return 'success';
  if (status === 'En Proceso') return 'accent';
  if (status === 'En Revision ASFI') return 'warning';
  return 'danger';
}

export function checklistTone(status: ChecklistStatus): BadgeTone {
  if (status === 'Aprobado') return 'success';
  if (status === 'Observado') return 'danger';
  if (status === 'En revision') return 'warning';
  return 'neutral';
}

const usdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});

const usdCompactFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 2,
});

export function usd(value: number): string {
  return usdFormatter.format(value);
}

export function usdCompact(value: number): string {
  return usdCompactFormatter.format(value);
}

export function compactHash(hash: string): string {
  return hash.length <= 16 ? hash : `${hash.slice(0, 8)}...${hash.slice(-4)}`;
}

export function copyToClipboard(text: string): Promise<void> {
  return navigator.clipboard.writeText(text);
}

export function useToast() {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const show = useCallback((text: string) => {
    setMessage(text);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMessage(null), 2600);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const element = message ? <div className="toast" role="status">{message}</div> : null;
  return { show, element };
}
