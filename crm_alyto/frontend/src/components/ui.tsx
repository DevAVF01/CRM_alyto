import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type {
  EstadoCasilla,
  EstadoHilo,
  EstadoMensaje,
  EstadoReclamo,
  EstadoRuta,
  KycEstado,
  Resultado,
} from '../types';

export type IconName =
  | 'inbox'
  | 'kanban'
  | 'users'
  | 'mail'
  | 'shield'
  | 'doc'
  | 'calendar'
  | 'flag'
  | 'clock'
  | 'check'
  | 'warning'
  | 'key'
  | 'send'
  | 'bolt'
  | 'plus'
  | 'refresh'
  | 'route'
  | 'list'
  | 'eye'
  | 'eyeOff'
  | 'copy'
  | 'pause'
  | 'logout';

const PATHS: Record<IconName, ReactNode> = {
  inbox: (
    <>
      <path d="M3 13h5l1.5 3h5L16 13h5" />
      <path d="M3 13 6 5h12l3 8v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5z" />
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
  doc: (
    <>
      <path d="M6 3h8l4 4v14H6V3z" />
      <path d="M14 3v4h4" />
      <path d="M9 12h6M9 16h6" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  flag: (
    <>
      <path d="M5 21V4h9l-1 3h6v8h-8l-1-3H5" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5l3.5 2" />
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
  bolt: <path d="M13 2 4.5 13.5H11L9.5 22 19 9.5h-6.5L13 2z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  refresh: (
    <>
      <path d="M20 12a8 8 0 1 1-2.3-5.6" />
      <path d="M20 4v5h-5" />
    </>
  ),
  route: (
    <>
      <circle cx="6" cy="18" r="2.6" />
      <circle cx="18" cy="6" r="2.6" />
      <path d="M8.6 18h4.4a3 3 0 0 0 0-6H10a3 3 0 0 1 0-6h3.4" />
    </>
  ),
  list: (
    <>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <circle cx="4" cy="6" r="1" fill="currentColor" />
      <circle cx="4" cy="12" r="1" fill="currentColor" />
      <circle cx="4" cy="18" r="1" fill="currentColor" />
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
  logout: (
    <>
      <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
      <path d="M10 8l-4 4 4 4M6 12h10" />
    </>
  ),
  pause: (
    <>
      <rect x="7" y="5" width="3.5" height="14" rx="1" />
      <rect x="13.5" y="5" width="3.5" height="14" rx="1" />
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

// etiqueta() convierte una clave de la base en texto legible sin traducirla: 'en_espera_cliente'
// pasa a 'En espera cliente'. La palabra sigue siendo la del modelo, así que lo que se lee en
// pantalla coincide con lo que alguien busca en la base o en el registro.
const ESPECIALES: Record<string, string> = {
  whatsapp: 'WhatsApp',
  chat_app: 'Chat de la app',
  web_chat: 'Chat web',
  meta: 'Meta',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
  kyc: 'KYC',
  b2b: 'B2B',
  asfi: 'ASFI',
  ecp: 'ECP',
  ia: 'IA',
};

export function etiqueta(valor: string | null | undefined): string {
  if (!valor) return 'sin dato';
  return valor
    .split('_')
    .map((palabra) => ESPECIALES[palabra] ?? palabra)
    .join(' ')
    .replace(/^./, (letra) => letra.toUpperCase());
}

export function toneDeKyc(estado: KycEstado): BadgeTone {
  if (estado === 'Aprobado') return 'success';
  if (estado === 'Rechazado') return 'danger';
  if (estado === 'Observado') return 'warning';
  if (estado === 'En revision') return 'accent';
  return 'neutral';
}

export function toneDeEstadoHilo(estado: EstadoHilo): BadgeTone {
  if (estado === 'abierta') return 'accent';
  if (estado === 'resuelta' || estado === 'cerrada') return 'success';
  if (estado === 'spam') return 'danger';
  return 'warning';
}

export function toneDeMensaje(estado: EstadoMensaje): BadgeTone {
  if (estado === 'entregado' || estado === 'leido') return 'success';
  if (estado === 'fallido') return 'danger';
  if (estado === 'enviado') return 'accent';
  return 'neutral';
}

export function toneDeRuta(estado: EstadoRuta): BadgeTone {
  if (estado === 'en_curso') return 'accent';
  if (estado === 'cerrada') return 'success';
  if (estado === 'bloqueada' || estado === 'cerrada_sin_resultado') return 'danger';
  return 'warning';
}

export function toneDeCasilla(estado: EstadoCasilla): BadgeTone {
  if (estado === 'Aprobado') return 'success';
  if (estado === 'Observado') return 'danger';
  if (estado === 'En revision') return 'warning';
  return 'neutral';
}

export function toneDeReclamo(estado: EstadoReclamo): BadgeTone {
  if (estado === 'cerrado') return 'success';
  if (estado === 'elevado_asfi') return 'danger';
  if (estado === 'respondido') return 'accent';
  if (estado === 'recibido') return 'warning';
  return 'neutral';
}

export function toneDeResultado(resultado: Resultado): BadgeTone {
  if (resultado === 'exito') return 'success';
  if (resultado === 'error') return 'danger';
  return 'warning';
}

// La operación es boliviana y el nivel de servicio se calcula en la base con la zona horaria que
// está en ecp_parameters. La pantalla formatea en esa misma zona para que la hora que se lee sea
// la hora a la que vence el plazo, no la hora del navegador de cada persona.
const ZONA = 'America/La_Paz';

const hora = new Intl.DateTimeFormat('es-BO', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: ZONA,
});

const dia = new Intl.DateTimeFormat('es-BO', {
  day: '2-digit',
  month: 'short',
  timeZone: ZONA,
});

const diaHora = new Intl.DateTimeFormat('es-BO', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: ZONA,
});

export function formatoHora(iso: string | null | undefined): string {
  if (!iso) return 'sin fecha';
  return hora.format(new Date(iso));
}

export function formatoDia(iso: string | null | undefined): string {
  if (!iso) return 'sin fecha';
  return dia.format(new Date(iso));
}

export function formatoDiaHora(iso: string | null | undefined): string {
  if (!iso) return 'sin fecha';
  return diaHora.format(new Date(iso));
}

const bs = new Intl.NumberFormat('es-BO', {
  style: 'currency',
  currency: 'BOB',
  maximumFractionDigits: 0,
});

export function montoBs(valor: number | string | null | undefined): string {
  if (valor === null || valor === undefined || valor === '') return 'sin dato';
  return bs.format(Number(valor));
}

export function horas(valor: number | string | null | undefined): string {
  const numero = Number(valor ?? 0);
  return `${numero.toFixed(1).replace('.', ',')} h`;
}

export function copiar(texto: string): Promise<void> {
  return navigator.clipboard.writeText(texto);
}

export function useToast() {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const show = useCallback((text: string) => {
    setMessage(text);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMessage(null), 4200);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const element = message ? <div className="toast" role="status">{message}</div> : null;
  return { show, element };
}
