import type {
  ActividadAbiertaRow,
  ActividadRow,
  AsientoRutaRow,
  BandejaRow,
  BanderaRow,
  Canal,
  CategoriaConsulta,
  CasillaRow,
  ContactoRow,
  CuentaRow,
  CrmMeta,
  DocumentoRow,
  EntradaResultado,
  EstadoHilo,
  HealthInfo,
  HiloDetalle,
  HiloRow,
  LegajoRow,
  MensajeRow,
  NotaRow,
  ParametrosRow,
  PersonalRow,
  PlantillaRow,
  ReclamoRegistroRow,
  ReclamoRow,
  RequisitoRow,
  RutaCabecera,
  RutaDetalle,
  RutaRow,
  SalidaRow,
  SenalRow,
  SlaRow,
  TablaRutasRow,
  TerminosRow,
  ViajeRow,
  RegistroRow,
  CotejoRow,
  Ficha,
  PanelMetrica,
} from '../types';

// Cliente HTTP del CRM. Una sola dirección base, /api/crm, y un solo molde de llamada: el token de
// la sesión viaja siempre en la cabecera y la base decide qué se ve y qué se puede escribir.
// No hay datos ficticios de respaldo en ninguna parte de este fichero: si el backend responde 503
// porque falta la configuración, la pantalla lo dice en lugar de mostrar una cifra inventada.

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

export type Filtros = Record<string, string | number | boolean | undefined | null>;

function qs(filtros?: Filtros): string {
  if (!filtros) return '';
  const partes = Object.entries(filtros)
    .filter(([, valor]) => valor !== undefined && valor !== null && valor !== '')
    .map(([clave, valor]) => `${encodeURIComponent(clave)}=${encodeURIComponent(String(valor))}`);
  return partes.length ? `?${partes.join('&')}` : '';
}

interface Opciones {
  method?: 'GET' | 'POST' | 'PATCH';
  body?: unknown;
  filtros?: Filtros;
  signal?: AbortSignal;
}

async function pedido<T>(ruta: string, opciones: Opciones = {}): Promise<T> {
  const token = currentToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opciones.body !== undefined) headers['Content-Type'] = 'application/json';

  const respuesta = await fetch(`/api${ruta}${qs(opciones.filtros)}`, {
    method: opciones.method ?? 'GET',
    headers,
    body: opciones.body !== undefined ? JSON.stringify(opciones.body) : undefined,
    signal: opciones.signal,
  });

  const contenido = (await respuesta.json().catch(() => null)) as
    | { data?: T; error?: { code?: string; message?: string } }
    | null;

  if (!respuesta.ok) {
    throw new ApiError(
      respuesta.status,
      contenido?.error?.code ?? 'API_ERROR',
      contenido?.error?.message ?? 'Error del servidor',
    );
  }
  return (contenido?.data ?? (contenido as unknown)) as T;
}

// El puente /crm tiene dos familias de operaciones que se repiten tabla por tabla: leer una lista
// y escribir una fila. Se escriben una sola vez aquí para que la lista de columnas autorizables
// siga viviendo en el backend, que es donde la base la puede hacer cumplir.
const listado = <T,>(ruta: string) => (filtros?: Filtros) =>
  pedido<T[]>(`/crm/${ruta}`, { filtros });

export const crm = {
  meta: () => pedido<CrmMeta>('/crm'),

  // --------------------------------------------------------------------------- bandeja
  bandeja: listado<BandejaRow>('bandeja'),
  sla: listado<SlaRow>('bandeja/sla'),
  salida: listado<SalidaRow>('bandeja/salida'),
  banderas: listado<BanderaRow>('bandeja/banderas'),
  senales: listado<SenalRow>('senales'),
  viajes: listado<ViajeRow>('viajes'),

  // La corrida manual del motor de viajes (solo administracion). Devuelve el resumen de lo
  // que el motor hizo en el toque: senales consumidas, inscripciones y mensajes en cola.
  corridaMotor: () => pedido<{ ok: boolean; motivo?: string; resumen: {
    senales_consumidas: number;
    inscripciones: number;
    mensajes_en_cola: number;
    fallidos: number;
    errores: string[];
  } | null }>(`/crm/motor/corrida`, { method: 'POST', body: {} }),

  // Personal del CRM (F-03): el administrador ve las cuentas del equipo y decide el rol y el
  // estado de cada una. Cada cambio deja su asiento en el registro.
  personal: listado<PersonalRow>('personal'),
  cambiarPersonal: (id: string, cuerpo: { role?: string; is_active?: boolean; display_name?: string }) =>
    pedido<PersonalRow>(`/crm/personal/${encodeURIComponent(id)}`, { method: 'PATCH', body: cuerpo }),

  // Panel de metricas (F-34): los cuatro numeros de trafico con su luz. Solo el administrador.
  panel: () => pedido<PanelMetrica[]>(`/crm/panel`),

  hilo: (id: string) => pedido<HiloDetalle>(`/crm/hilos/${encodeURIComponent(id)}`),
  responder: (id: string, body: { body: string; template_id?: string | null }) =>
    pedido<MensajeRow>(`/crm/hilos/${encodeURIComponent(id)}/mensajes`, { method: 'POST', body }),
  editarHilo: (id: string, cuerpo: Partial<Pick<HiloRow, 'status' | 'assignee_id' | 'priority' | 'query_category' | 'resolved_at'>>) =>
    pedido<HiloRow>(`/crm/hilos/${encodeURIComponent(id)}`, { method: 'PATCH', body: cuerpo }),

  // El archivador (paso 1 de la entrada). Se anota lo que el cliente escribio por un canal que el CRM
  // todavia no tiene conectado: la funcion busca la cuenta por su numero o su correo, abre el hilo que
  // falte y encola la conversacion con la regla de enrutamiento que vive en la base. No lleva el
  // linter de marca por arriba a proposito: el filtro guarda lo que NOSOTROS escribimos, y el texto
  // del cliente es registro, no salida nuestra.
  anotarEntrada: (cuerpo: {
    channel: Canal;
    query_category?: CategoriaConsulta;
    telefono?: string;
    correo?: string;
    client_name?: string;
    body: string;
    subject?: string;
    channel_conv_id?: string;
    external_msg_id?: string;
    sender_label?: string;
    dueno_email?: string;
  }) => pedido<EntradaResultado>('/crm/entrada', { method: 'POST', body: cuerpo }),
  // La nota interna del equipo sobre un hilo. No es un mensaje: el archivador la deja en activities
  // con tipo 'nota' (ver el porque en backend/src/data/ingesta.js) y por eso se lee con el filtro del
  // hilo, no en la lista de mensajes de la conversacion.
  anotarNota: (id: string, cuerpo: { body: string }) =>
    pedido<{ hilo: { id: string; client_id: string; channel: Canal; status: EstadoHilo }; nota: NotaRow }>(
      `/crm/hilos/${encodeURIComponent(id)}/notas`,
      { method: 'POST', body: cuerpo },
    ),
  notas: listado<NotaRow>('notas'),

  // ------------------------------------------------------------------------------ rutas
  rutas: listado<RutaRow>('rutas'),
  tableroRutas: listado<TablaRutasRow>('rutas/tablero'),
  ruta: async (id: string) => {
    const detalle = await pedido<{ ruta: RutaCabecera; asientos: AsientoRutaRow[] }>(
      `/crm/rutas/${encodeURIComponent(id)}`,
    );
    return detalle as RutaDetalle;
  },
  moverRuta: (id: string, cuerpo: { estado?: string; motivo?: string; next_step?: string; owner_id?: string | null }) =>
    pedido<RutaCabecera>(`/crm/rutas/${encodeURIComponent(id)}`, { method: 'PATCH', body: cuerpo }),
  crearRuta: (cuerpo: Filtros) => pedido<RutaCabecera>('/crm/rutas', { method: 'POST', body: cuerpo }),

  // ------------------------------------------------------------- legajo y expediente
  legajo: listado<LegajoRow>('legajo'),
  requisitos: listado<RequisitoRow>('requisitos'),
  casillas: (clientId: string) =>
    pedido<CasillaRow[]>(`/crm/fichas/${encodeURIComponent(clientId)}/casillas`),
  documentos: (clientId: string) =>
    pedido<DocumentoRow[]>(`/crm/fichas/${encodeURIComponent(clientId)}/documentos`),
  editarCasilla: (clientId: string, code: string, cuerpo: { status?: string; detail?: string | null }) =>
    pedido<CasillaRow>(
      `/crm/casillas/${encodeURIComponent(clientId)}/${encodeURIComponent(code)}`,
      { method: 'PATCH', body: cuerpo },
    ),
  // La exencion: aprobar sin documento, potestad de admin y cumplimiento; la base escribe el asiento.
  exentarCasilla: (clientId: string, code: string, detail: string) =>
    pedido<CasillaRow>(
      `/crm/casillas/${encodeURIComponent(clientId)}/${encodeURIComponent(code)}/exencion`,
      { method: 'POST', body: { detail } },
    ),

  // -------------------------------------------------------------------------- reclamos
  reclamos: listado<ReclamoRow>('reclamos'),
  crearReclamo: (cuerpo: Filtros) =>
    pedido<ReclamoRegistroRow>('/crm/reclamos', { method: 'POST', body: cuerpo }),
  editarReclamo: (id: string, cuerpo: Filtros) =>
    pedido<ReclamoRegistroRow>(`/crm/reclamos/${encodeURIComponent(id)}`, { method: 'PATCH', body: cuerpo }),

  // --------------------------------------------------------------------------- agenda
  actividades: listado<ActividadAbiertaRow>('actividades'),
  crearActividad: (cuerpo: Filtros) =>
    pedido<ActividadRow>('/crm/actividades', { method: 'POST', body: cuerpo }),
  editarActividad: (id: string, cuerpo: Filtros) =>
    pedido<ActividadRow>(`/crm/actividades/${encodeURIComponent(id)}`, { method: 'PATCH', body: cuerpo }),

  // ------------------------------------------------------------------------ el registro
  registro: listado<RegistroRow>('registro'),

  // ----------------------------------------------------------------- cuentas y ficha
  cuentas: listado<CuentaRow>('cuentas'),
  crearCuenta: (cuerpo: Filtros) => pedido<CuentaRow>('/crm/cuentas', { method: 'POST', body: cuerpo }),
  editarCuenta: (id: string, cuerpo: Filtros) =>
    pedido<CuentaRow>(`/crm/cuentas/${encodeURIComponent(id)}`, { method: 'PATCH', body: cuerpo }),
  ficha: (clientId: string) => pedido<Ficha>(`/crm/fichas/${encodeURIComponent(clientId)}`),

  // ----------------------------------------------------------------- legajo de documentos (F-18)
  // La subida viaja en base64 porque el CRM no manda multipart: el backend valida forma, tamano
  // y requisito, sube al cubo con el token de la sesion y escribe los metadatos.
  subirDocumento: (clientId: string, cuerpo: {
    requirement_code: string;
    filename: string;
    mime_type: string;
    expires_on?: string | null;
    content_base64: string;
  }) =>
    pedido<DocumentoRow>(`/crm/fichas/${encodeURIComponent(clientId)}/documentos`, { method: 'POST', body: cuerpo }),
  // El contenido baja binario: el URL es efimero en cuando la pantalla lo abra.
  contenidoDocumento: (id: string) => pedidoArchivo(`/crm/documentos/${encodeURIComponent(id)}/contenido`),

  contactos: listado<ContactoRow>('contactos'),
  crearContacto: (cuerpo: Filtros) =>
    pedido<ContactoRow>('/crm/contactos', { method: 'POST', body: cuerpo }),

  // ------------------------------------------------------------- material de trabajo
  plantillas: listado<PlantillaRow>('plantillas'),
  glosario: listado<TerminosRow>('glosario'),
  parametros: listado<ParametrosRow>('parametros'),
  cotejos: listado<CotejoRow>('cotejos'),
};

export const api = {
  meta: {
    health: () => pedido<HealthInfo>('/health'),
  },
};

// La solicitud de cuenta propia (F-03): el formulario publico del login. No lleva sesion ni
// token; la cuenta queda creada y pendiente de aceptacion, y el registro guarda el asiento
// 'solicitud_cuenta' a la vista del administrador.
export function solicitarCuenta(cuerpo: { display_name: string; email: string; password: string }) {
  return pedido<{ id: string; email: string; display_name: string; estado: string; mensaje: string }>(
    '/auth/solicitud',
    { method: 'POST', body: cuerpo },
  );
}

export function esErrorDeRed(error: unknown): boolean {
  return (
    error instanceof TypeError
    || (error instanceof ApiError && error.code === 'API_ERROR' && error.status >= 500)
  );
}

// Lectura binaria: un documento del legajo no llega como JSON, llega como archivo. El nombre va
// en Content-Disposition con la forma RFC 5987 y se decodifica aca.
async function pedidoArchivo(ruta: string): Promise<{ blob: Blob; filename: string | null }> {
  const token = currentToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const respuesta = await fetch(`/api${ruta}`, { method: 'GET', headers });
  if (!respuesta.ok) {
    const contenido = (await respuesta.json().catch(() => null)) as
      | { error?: { code?: string; message?: string } }
      | null;
    throw new ApiError(
      respuesta.status,
      contenido?.error?.code ?? 'API_ERROR',
      contenido?.error?.message ?? 'Error del servidor',
    );
  }
  const blob = await respuesta.blob();
  const disposicion = respuesta.headers.get('Content-Disposition') ?? '';
  const marcado = /filename\*=UTF-8''([^;]+)/.exec(disposicion);
  const filename = marcado ? decodeURIComponent(marcado[1]) : null;
  return { blob, filename };
}

// Un 403 del registro y un 403 de una politica de fila son la misma cosa para quien está delante
// de la pantalla: el rol no alcanza. La frase se escribe una vez aqui para que las siete pantallas
// no la repitan con cuatro matices distintos.
export function mensajeDeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'La sesión cayó. Vuelva a entrar.';
    if (error.status === 403) return 'Su rol no tiene acceso a estos datos.';
    if (error.status === 503) return error.message;
    if (error.status === 405) return error.message;
    return error.message;
  }
  if (error instanceof TypeError) return 'El backend no responde. Revise que esté corriendo.';
  return 'No fue posible leer la base.';
}
