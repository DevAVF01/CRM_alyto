// Tipos del CRM. Cada interfaz es la lista de columnas que la base devuelve por ese camino, con el
// nombre exacto de la columna: el puente del backend no renombra nada y la interfaz tampoco. Si una
// columna no esta aqui es que la vista o la tabla no la tiene, no que falte escribirla.

export type Role = 'admin' | 'compliance' | 'operaciones' | 'ventas' | 'soporte';

export interface SessionUser {
  id: string;
  email: string;
  role: Role;
  accessToken: string;
}

// ------------------------------------------------------------------ enumerados de la base
// Los valores son literales de la base (mismas palabras, misma ortografía), así que la pantalla
// puede mostrar la clave con una etiqueta legible sin traducir términos de negocio.
export type Canal = 'whatsapp' | 'correo' | 'chat_app' | 'web_chat' | 'linkedin' | 'meta' | 'tiktok'
  | 'formulario' | 'telefonica' | 'interno';

export type EstadoHilo = 'abierta' | 'en_espera_cliente' | 'en_espera_agente' | 'resuelta' | 'cerrada' | 'spam';
export type EstadoMensaje = 'recibido' | 'en_cola' | 'enviado' | 'entregado' | 'leido' | 'fallido';
export type Direccion = 'entrante' | 'saliente';
export type CategoriaConsulta = 'soporte_tecnico' | 'registro_kyc' | 'empresa_b2b' | 'reclamo'
  | 'consulta_saldo' | 'otro';
export type TipoCuenta = 'persona_natural' | 'persona_juridica';
export type KycEstado = 'Pendiente' | 'En revision' | 'Aprobado' | 'Observado' | 'Rechazado';

export type TipoRuta = 'documentacion' | 'comercial' | 'riesgo';
export type EstadoRuta = 'abierta' | 'en_curso' | 'en_espera_cliente' | 'bloqueada' | 'cerrada'
  | 'cerrada_sin_resultado';

export type TipoSenal = 'documento_observado' | 'datos_incompletos' | 'consulta_sin_responder'
  | 'sin_respuesta_cliente' | 'reclamo_recibido' | 'documento_por_vencer';
export type EstadoCasilla = 'Pendiente' | 'En revision' | 'Aprobado' | 'Observado';
export type EstadoDocumento = 'Pendiente' | 'En revision' | 'Aprobado' | 'Rechazado';
export type CategoriaReclamo = 'atraso_respuesta' | 'error_operacion' | 'cobro_indebido'
  | 'cierre_servicio' | 'incumplimiento_normativo' | 'otro';
export type EstadoReclamo = 'recibido' | 'en_analisis' | 'requiere_documentos' | 'respondido'
  | 'cerrado' | 'elevado_asfi';
export type TipoActividad = 'llamada' | 'reunion' | 'visita' | 'correo' | 'tarea' | 'nota';export type EstadoEjecucion = 'pendiente' | 'enviado' | 'fallido' | 'cancelado' | 'omitido';
export type ActorKind = 'humano' | 'agente' | 'sistema';
export type Resultado = 'exito' | 'rechazado' | 'error';

// Un instante llega como texto ISO por la ruta de PostgREST. La pantalla lo formatea, nunca lo
// recalcula: el nivel de servicio lo decide la base.
type Fecha = string;

// ------------------------------------------------------------------------ las once vistas
export interface BandejaRow {
  id: string;
  client_id: string;
  cliente: string;
  account_type: TipoCuenta;
  kyc_estado: KycEstado;
  channel: Canal;
  query_category: CategoriaConsulta;
  queue: string;
  status: EstadoHilo;
  priority: number;
  assignee_id: string | null;
  asignado_a: string | null;
  messages_count: number;
  last_message_at: Fecha | null;
  last_inbound_at: Fecha | null;
  last_outbound_at: Fecha | null;
  ultimo_mensaje: string | null;
  direccion_ultimo_mensaje: Direccion | null;
  momento_ultimo_mensaje: Fecha | null;
}

export interface SlaRow {
  id: string;
  client_id: string;
  cliente: string;
  channel: Canal;
  queue: string;
  status: EstadoHilo;
  assignee_id: string | null;
  last_inbound_at: Fecha | null;
  horas_habiles_sin_atencion: number;
  vence_en: Fecha | null;
  vencida: boolean;
}

export interface SalidaRow {
  message_id: string;
  conversation_id: string;
  client_id: string;
  cliente: string;
  channel: Canal;
  status: EstadoMensaje;
  body: string;
  sent_at: Fecha;
  attempts: number;
  last_error: string | null;
  journey_run_id: string | null;
}

export interface BanderaRow {
  message_id: string;
  conversation_id: string;
  direction: Direccion;
  term: string;
  suggestion: string | null;
  sent_at: Fecha;
}

export interface SenalRow {
  id: string;
  kind: TipoSenal;
  client_id: string;
  cliente: string;
  conversation_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  detail: Record<string, unknown> | null;
  created_at: Fecha;
}

export interface ViajeRow {
  enrollment_id: string;
  cadencia: string;
  client_id: string;
  cliente: string;
  step_order: number;
  day_number: number;
  channel: Canal;
  template_code: string;
  scheduled_for: Fecha;
  estado_ejecucion: EstadoEjecucion;
  vencido: boolean;
  posicion: number;
}

export interface LegajoRow {
  client_id: string;
  cliente: string;
  account_type: TipoCuenta;
  casillas: number;
  aprobadas: number;
  observadas: number;
  en_revision: number;
  rechazadas: number;
  porcentaje_aprobado: number;
}

export interface RutaRow {
  id: string;
  code: string;
  kind: TipoRuta;
  estado: EstadoRuta;
  client_id: string;
  cliente: string;
  owner_id: string | null;
  dueno: string | null;
  motivo: string | null;
  horas_habiles_en_el_estado: number;
  opened_at: Fecha;
}

export interface TablaRutasRow {
  client_id: string;
  cliente: string;
  account_type: TipoCuenta;
  rutas_abiertas: number;
  en_curso: number;
  esperando_cliente: number;
  bloqueadas: number;
  tiene_documentacion: number;
  tiene_comercial: number;
  tiene_riesgo: number;
}

export interface ReclamoRow {
  id: string;
  code: string;
  client_id: string;
  cliente: string;
  category: CategoriaReclamo;
  status: EstadoReclamo;
  summary: string;
  resolution: string | null;
  received_at: Fecha;
  due_at: Fecha | null;
  responded_at: Fecha | null;
  sin_plazo_definido: boolean;
  vencido: boolean;
  dias_transcurridos: number | null;
}

export interface ActividadAbiertaRow {
  id: string;
  type: TipoActividad;
  title: string;
  due_at: Fecha | null;
  owner_id: string;
  client_id: string;
  cuenta: string | null;
  route_id: string | null;
  vencida: boolean;
}

// Panel de metricas (F-34): cada numero del dia con su luz de trafico. La tonalidad la calcula
// el backend con reglas documentadas; la pantalla solo la muestra, no re-clasifica.
export type TonoSemaforo = 'verde' | 'ambar' | 'rojo';

export interface PanelMetrica {
  clave: string;
  titulo: string;
  destino: string;
  numero: number;
  tono: TonoSemaforo;
  frase: string;
}

// ---------------------------------------------------------------------------- las tablas
export interface CuentaRow {
  id: string;
  account_type: TipoCuenta;
  display_name: string;
  legal_name: string | null;
  ci: string | null;
  nit: string | null;
  email: string | null;
  phone_e164: string | null;
  company_name: string | null;
  city: string | null;
  sector: string | null;
  origin: string;
  payments_ref: string | null;
  owner_id: string | null;
  last_activity_at: Fecha | null;
  ecp_account: string | null;
  ecp_status: string;
  kyc_estado: KycEstado;
  riesgo: string;
  tope_operacion_bs: number | null;
  cupo_mensual_operaciones: number | null;
  ficha_revisada_en: Fecha | null;
  ficha_nota: string | null;
  created_at: Fecha;
  updated_at: Fecha;
}

export interface ContactoRow {
  id: string;
  client_id: string;
  full_name: string;
  role_title: string | null;
  email: string | null;
  phone_e164: string | null;
  is_primary: boolean;
  is_decision_maker: boolean;
  notes: string | null;
}

export interface HiloRow {
  id: string;
  client_id: string;
  contact_id: string | null;
  channel: Canal;
  channel_conv_id: string | null;
  subject: string | null;
  query_category: CategoriaConsulta;
  queue: string;
  status: EstadoHilo;
  assignee_id: string | null;
  priority: number;
  first_inbound_at: Fecha | null;
  last_inbound_at: Fecha | null;
  last_outbound_at: Fecha | null;
  last_message_at: Fecha | null;
  messages_count: number;
  resolved_at: Fecha | null;
}

export interface MensajeRow {
  id: string;
  conversation_id: string;
  direction: Direccion;
  channel: Canal;
  body: string;
  sender_label: string | null;
  template_id: string | null;
  automated: boolean;
  journey_run_id: string | null;
  external_msg_id: string | null;
  status: EstadoMensaje;
  sent_by: string | null;
  sent_at: Fecha;
  attempts: number;
  last_error: string | null;
}

export interface AsientoRutaRow {
  id: number;
  route_id: string;
  from_estado: EstadoRuta | null;
  to_estado: EstadoRuta;
  actor_id: string | null;
  actor_email: string;
  reason: string | null;
  created_at: Fecha;
}

export interface CasillaRow {
  client_id: string;
  requirement_code: string;
  status: EstadoCasilla;
  detail: string | null;
  reviewed_by: string | null;
  reviewed_at: Fecha | null;
}

export interface DocumentoRow {
  id: string;
  client_id: string;
  requirement_code: string | null;
  filename: string;
  storage_bucket: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  checksum: string | null;
  review_status: EstadoDocumento;
  expires_on: string | null;
  uploaded_by: string | null;
  reviewed_by: string | null;
  reviewed_at: Fecha | null;
  created_at: Fecha;
}

export interface CotejoRow {
  id: string;
  client_id: string | null;
  contact_id: string | null;
  list_name: string;
  subject: string;
  result: string;
  detail: string | null;
  created_at: Fecha;
}

export interface RequisitoRow {
  code: string;
  label: string;
  description: string | null;
  document_required: boolean;
  applies_to: TipoCuenta[];
  order_index: number;
  is_active: boolean;
}

export interface PlantillaRow {
  id: string;
  code: string;
  version: number;
  name: string;
  channel: Canal | null;
  subject: string | null;
  body: string;
  variables: string[];
  is_active: boolean;
}

export interface TerminosRow {
  id: number;
  term: string;
  severity: 'bloqueo' | 'advertencia';
  suggestion: string;
  reason: string;
  is_active: boolean;
}

export interface ParametrosRow {
  id: number;
  usuarios_por_dia: number;
  operaciones_por_dia: number;
  monto_maximo_operacion_bs: number;
  duracion_maxima_ecp_meses: number;
  estado_autorizacion: string;
  sla_horas_sin_atencion: number;
  horario_atencion_inicio: string;
  horario_atencion_fin: string;
  dias_laborales: string[];
  zona_horaria: string;
  dominio_corporativo: string;
  // La trae la migracion 0012. Es opcional porque mientras esa migracion no este corrida en la base
  // la columna no existe y la lectura no la devuelve.
  inicio_ecp?: string | null;
}

export interface PersonalRow {
  id: string;
  email: string;
  role: string;
  display_name: string | null;
  phone_e164?: string | null;
  is_active: boolean;
  estado: 'activo' | 'pendiente';
  created_at: string;
  updated_at?: string | null;
}

export interface RegistroRow {
  id: number;
  actor: string;
  actor_id: string | null;
  actor_kind: ActorKind;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  detail: string | null;
  changed_before: Record<string, unknown> | null;
  changed_after: Record<string, unknown> | null;
  outcome: Resultado;
  trace_id: string | null;
  created_at: Fecha;
}

export interface ActividadRow {
  id: string;
  client_id: string;
  contact_id: string | null;
  conversation_id: string | null;
  route_id: string | null;
  type: TipoActividad;
  title: string;
  body: string | null;
  due_at: Fecha | null;
  done_at: Fecha | null;
  duration_minutes: number | null;
  owner_id: string;
  created_by: string | null;
  created_at: Fecha;
}

export interface SenalRegistroRow {
  id: string;
  kind: TipoSenal;
  client_id: string;
  contact_id: string | null;
  conversation_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  detail: Record<string, unknown>;
  status: string;
  dedupe_key: string;
  created_at: Fecha;
  consumed_at: Fecha | null;
}

export interface ReclamoRegistroRow {
  id: string;
  code: string;
  client_id: string;
  conversation_id: string | null;
  transaction_ref: string | null;
  category: CategoriaReclamo;
  status: EstadoReclamo;
  summary: string;
  description: string | null;
  resolution: string | null;
  received_at: Fecha;
  due_at: Fecha | null;
  responded_at: Fecha | null;
  asfi_ref: string | null;
  handler_id: string | null;
}

// ------------------------------------------------------------------ compuestos del puente
export interface HiloDetalle {
  conversacion: HiloRow;
  mensajes: MensajeRow[];
}

// Lo que devuelve el archivador cuando alguien anota la entrada de un cliente. Es deliberadamente
// angosto: solo las columnas que la pantalla usa para confirmar el archivo y abrir el hilo.
export interface CabeceraHiloBreve {
  id: string;
  client_id: string;
  channel: Canal;
  channel_conv_id: string | null;
  status: EstadoHilo;
  queue: string;
  priority: number;
  query_category: CategoriaConsulta;
  subject: string | null;
  assignee_id: string | null;
}

export interface MensajeArchivado {
  id: string;
  conversation_id: string;
  direction: Direccion;
  channel: Canal;
  status: EstadoMensaje;
  sent_at: Fecha;
  sender_label: string | null;
}

export interface EntradaResultado {
  duplicado: boolean;
  hilo?: CabeceraHiloBreve;
  mensaje: MensajeArchivado;
  cuenta?: { id: string; display_name: string; account_type: TipoCuenta; kyc_estado: KycEstado };
  contacto?: { id: string; full_name: string; phone_e164: string | null; email: string | null } | null;
  creoCuenta?: boolean;
  abrioHilo?: boolean;
  avisos?: string[];
}

// La nota del equipo. No es un mensaje: es una actividad de tipo 'nota' pegada al hilo, porque la base
// exige que el canal de un mensaje sea el del hilo y porque un mensaje entrante moveria el nivel de
// servicio como si el cliente hubiera respondido.
export interface NotaRow {
  id: string;
  type: TipoActividad;
  title: string;
  body: string | null;
  conversation_id: string | null;
  client_id: string;
  owner_id: string;
  created_at: Fecha;
  done_at: Fecha | null;
}

export interface RutaDetalle {
  ruta: RutaCabecera;
  asientos: AsientoRutaRow[];
}
export interface RutaCabecera {
  id: string;
  code: string;
  client_id: string;
  kind: TipoRuta;
  estado: EstadoRuta;
  owner_id: string | null;
  opened_at: Fecha;
  closed_at: Fecha | null;
  operation_type: string | null;
  frequency: string | null;
  monthly_volume_bs: number | null;
  next_step: string | null;
  motivo: string | null;
}

export interface Ficha {
  cuenta: CuentaRow;
  contactos: ContactoRow[];
  casillas: CasillaRow[];
  documentos: DocumentoRow[];
  rutas: RutaCabecera[];
  hilos: HiloRow[];
  senales: SenalRegistroRow[];
  cotejos: CotejoRow[];
  reclamos: ReclamoRegistroRow[];
  registro: RegistroRow[];
}

export interface CrmMeta {
  baseConfigurada: boolean;
  vistas: string[];
  tablas: string[];
  usuario: string;
  rol: Role;
}

export interface RuntimeStatus {
  demoMode: boolean;
  supabaseConfigured: boolean;
  authLayer: string;
  dataLayer: string;
  scopedRead: boolean;
}

export interface HealthInfo {
  status: string;
  service: string;
  environment: string;
  regime: string;
  runtime: RuntimeStatus;
}
