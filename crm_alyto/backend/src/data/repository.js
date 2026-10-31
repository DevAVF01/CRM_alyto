import { clientForToken, isScopedReadConfigured } from '../config/supabase.js';
import * as ingesta from './ingesta.js';

// Capa de datos del CRM. Es un puente fino entre la peticion y la base de Supabase: no calcula
// nada, no decide nada y no guarda una copia de nada. Las reglas viven en la base (seguridad por
// fila, disparadores y restricciones), y por eso el camino mas corto es el correcto: se manda la
// orden con el token del usuario y se deja que la base responda.
//
// Tres decisiones que conviene tener claras antes de leer el resto:
//
//   1. El token de la peticion es el unico que se usa para leer y para escribir, nunca la llave de
//      servicio. Lo que alguien ve en pantalla es exactamente lo que su rol puede ver, y si una
//      politica se equivoca el error aparece en la interfaz en lugar de taparse con datos falsos.
//   2. Las columnas que se pueden filtrar, escribir o modificar estan declaradas aqui, tabla por
//      tabla. No es una lista de decoracion: sin ella un parametro cualquiera del navegador
//      llegaria a una columna cualquiera de la base.
//   3. No hay version en memoria de nada de esto. Si falta la configuracion se responde 503 con el
//      nombre de la variable que falta; servir demostracion por debajo de una pantalla del CRM es
//      peor que un error visible.

// Lecturas de vista. El orden coincide con el de la propia vista cuando lo sabe, y se repite aca
// porque PostgreSQL no transmite el orden interno de una vista a quien la consulta.
const VISTAS = Object.freeze({
  bandeja: {
    view: 'vw_inbox',
    orden: [['last_message_at', 'desc']],
    filtros: { canal: 'channel', cola: 'queue', estado: 'status', cliente: 'client_id',
      categoria: 'query_category', kyc: 'kyc_estado' },
  },
  sla: {
    view: 'vw_conversations_sla',
    orden: [['horas_habiles_sin_atencion', 'desc']],
    filtros: { canal: 'channel', cola: 'queue', estado: 'status', vencida: 'vencida' },
  },
  salida: {
    view: 'vw_outbox_pending',
    orden: [['sent_at', 'asc']],
    filtros: { canal: 'channel', estado: 'status' },
  },
  banderas: {
    view: 'vw_messages_flagged',
    orden: [['sent_at', 'desc']],
    filtros: { direccion: 'direction' },
  },
  senales: {
    view: 'vw_signals_open',
    orden: [['created_at', 'asc']],
    filtros: { tipo: 'kind', cliente: 'client_id' },
  },
  viajes: {
    view: 'vw_cadence_pending',
    orden: [['scheduled_for', 'asc']],
    filtros: { cliente: 'client_id', vencido: 'vencido' },
  },
  legajo: {
    view: 'vw_compliance_progress',
    orden: [['porcentaje_aprobado', 'asc']],
    filtros: { tipo: 'account_type' },
  },
  rutas: {
    view: 'vw_route_age',
    orden: [['horas_habiles_en_el_estado', 'desc']],
    filtros: { tipo: 'kind', estado: 'estado', dueno: 'owner_id' },
  },
  tableroRutas: {
    view: 'vw_routes_by_state',
    orden: [['rutas_abiertas', 'desc']],
    filtros: { tipo: 'account_type' },
  },
  reclamos: {
    view: 'vw_claims_sla',
    orden: [['due_at', 'asc']],
    filtros: { categoria: 'category', estado: 'status' },
  },
  actividades: {
    view: 'vw_open_activities',
    orden: [['due_at', 'asc']],
    filtros: { tipo: 'type', vencida: 'vencida' },
  },
});

// Tablas: las que se leen sueltas, las que se escriben y las que se dejan leer pero no se tocan.
// Las listas de columnas son la unica puerta; lo que no esta ahi no pasa.
const TABLAS = Object.freeze({
  cuentas: {
    table: 'clients',
    lectura: [['display_name', 'asc']],
    filtros: { tipo: 'account_type', kyc: 'kyc_estado', riesgo: 'riesgo', ecp: 'ecp_status' },
    escritura: {
      insert: ['account_type', 'display_name', 'legal_name', 'ci', 'nit', 'email', 'phone_e164',
        'company_name', 'city', 'sector', 'origin', 'owner_id'],
      update: ['display_name', 'legal_name', 'ci', 'nit', 'email', 'phone_e164', 'company_name', 'city',
        'sector', 'origin', 'owner_id', 'ecp_account', 'ecp_status', 'kyc_estado', 'riesgo',
        'tope_operacion_bs', 'cupo_mensual_operaciones', 'ficha_revisada_en', 'ficha_nota'],
    },
  },
  contactos: {
    table: 'contacts',
    lectura: [['full_name', 'asc']],
    filtros: {},
    escritura: {
      insert: ['client_id', 'full_name', 'role_title', 'email', 'phone_e164', 'is_primary',
        'is_decision_maker', 'notes'],
      update: ['full_name', 'role_title', 'email', 'phone_e164', 'is_primary', 'is_decision_maker', 'notes'],
    },
  },
  hilos: {
    table: 'conversations',
    lectura: [['last_message_at', 'desc']],
    filtros: { canal: 'channel', estado: 'status', cola: 'queue' },
    escritura: {
      insert: ['client_id', 'contact_id', 'channel', 'channel_conv_id', 'subject', 'query_category',
        'queue', 'priority'],
      update: ['status', 'assignee_id', 'priority', 'query_category', 'resolved_at'],
    },
  },
  mensajes: {
    table: 'messages',
    lectura: [['sent_at', 'asc']],
    filtros: {},
    // Un mensaje enviado es prueba: se puede anadir, nunca corregir ni borrar. La traba vive dos
    // veces (denies_direct_write en 0002 y el revoke de 0004) y esta lista vacia es la misma regla
    // contada desde el puente.
    escritura: {
      insert: ['conversation_id', 'direction', 'channel', 'body', 'sender_label', 'template_id',
        'external_msg_id', 'status', 'sent_by'],
      update: [],
    },
  },
  rutas: {
    table: 'routes',
    lectura: [['opened_at', 'desc']],
    filtros: { tipo: 'kind', estado: 'estado' },
    escritura: {
      insert: ['code', 'client_id', 'kind', 'estado', 'owner_id', 'motivo', 'operation_type',
        'frequency', 'monthly_volume_bs', 'next_step'],
      update: ['estado', 'motivo', 'owner_id', 'next_step', 'operation_type', 'frequency',
        'monthly_volume_bs'],
    },
  },
  asientosRuta: {
    table: 'route_events',
    lectura: [['created_at', 'asc']],
    filtros: {},
    escritura: { insert: [], update: [] },
  },
  senales: {
    table: 'signals',
    lectura: [['created_at', 'desc']],
    filtros: { estado: 'status' },
    escritura: {
      insert: ['kind', 'client_id', 'contact_id', 'conversation_id', 'entity_type', 'entity_id',
        'detail', 'dedupe_key'],
      update: ['status', 'consumed_at', 'detail'],
    },
  },
  actividades: {
    table: 'activities',
    lectura: [['due_at', 'asc']],
    filtros: { tipo: 'type' },
    escritura: {
      insert: ['client_id', 'contact_id', 'conversation_id', 'route_id', 'type', 'title', 'body',
        'due_at', 'duration_minutes', 'owner_id'],
      update: ['title', 'body', 'due_at', 'done_at', 'duration_minutes', 'owner_id', 'route_id'],
    },
  },
  // Las notas del equipo se leen de la tabla, no de vw_open_activities: esa vista es la jornada del
  // dia y muestra solo lo que tiene done_at nulo, y una nota nace cerrada porque no es una tarea.
  notas: {
    table: 'activities',
    lectura: [['created_at', 'desc']],
    filtros: { hilo: 'conversation_id', ficha: 'client_id', tipo: 'type' },
    escritura: { insert: [], update: [] },
  },
  reclamos: {
    table: 'claims',
    lectura: [['received_at', 'desc']],
    filtros: { categoria: 'category', estado: 'status' },
    escritura: {
      // El codigo lo calcula la interfaz y lo valida la base (unique + checo RC-AAAA-NNNN): sin esta
      // columna en la lista, el alta de un reclamo llegaba sin code y la base la rechazaba por
      // not null, que en la pantalla se veia como un error raro.
      insert: ['code', 'client_id', 'conversation_id', 'category', 'summary', 'description', 'due_at',
        'handler_id'],
      update: ['status', 'summary', 'description', 'resolution', 'due_at', 'responded_at', 'handler_id'],
    },
  },
  casillas: {
    table: 'document_reviews',
    lectura: [['requirement_code', 'asc']],
    filtros: {},
    // El alta la genera el disparador clients_document_reviews_template al crear la cuenta, y el
    // paso a 'Aprobado' lo guarda require_document_for_approval: por eso no hay lista de insercion.
    escritura: { insert: [], update: ['status', 'detail', 'reviewed_by', 'reviewed_at'] },
  },
  documentos: {
    table: 'documents',
    lectura: [['created_at', 'desc']],
    filtros: {},
    escritura: {
      insert: ['client_id', 'requirement_code', 'filename', 'storage_bucket', 'storage_path',
        'mime_type', 'size_bytes', 'expires_on', 'uploaded_by'],
      update: ['review_status', 'reviewed_by', 'reviewed_at', 'expires_on'],
    },
  },
  cotejos: {
    table: 'screenings',
    lectura: [['created_at', 'desc']],
    filtros: {},
    escritura: { insert: [], update: [] },
  },
  requisitos: {
    table: 'document_requirements',
    lectura: [['order_index', 'asc']],
    filtros: {},
    escritura: { insert: [], update: [] },
  },
  plantillas: {
    table: 'templates',
    lectura: [['code', 'asc']],
    filtros: { canal: 'channel' },
    escritura: { insert: [], update: [] },
  },
  terminos: {
    table: 'blocked_terms',
    lectura: [['term', 'asc']],
    filtros: { severidad: 'severity' },
    escritura: { insert: [], update: [] },
  },
  parametros: {
    table: 'ecp_parameters',
    lectura: [],
    filtros: {},
    escritura: { insert: [], update: [] },
  },
  personal: {
    table: 'profiles',
    lectura: [['is_active', 'desc'], ['display_name', 'asc']],
    filtros: {},
    // La escritura de personales no va por el camino generico: cada accion del administrador
    // arrasta su asiento y su efecto en Auth, y la hace src/data/personal.js.
    escritura: { insert: [], update: [] },
  },
  registro: {
    table: 'audit_events',
    lectura: [['created_at', 'desc']],
    filtros: { actor: 'actor', actorKind: 'actor_kind', accion: 'action', entidad: 'entity_type',
      resultado: 'outcome' },
    // Inmutable por los dos caminos: el disparador block_audit_mutation y el revoke de privilegios
    // de 0004. La lista vacia no es un olvido, es la traba hecha declaracion.
    escritura: { insert: [], update: [] },
  },
});

const LIMITE_MAXIMO = 200;

function httpError(status, message, code) {
  const err = new Error(message);
  err.status = status;
  err.expose = true;
  err.code = code ?? 'BAD_REQUEST';
  return err;
}

// El token viaja en la misma cabecera que ya valido la peticion, de modo que lo que se lee y lo que
// se escribe es exactamente lo que ese usuario puede ver y hacer.
function tokenDeSesion(req) {
  const header = req?.headers?.authorization ?? '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : null;
}

function baseDe(req) {
  if (!isScopedReadConfigured()) {
    throw httpError(503,
      'Hace falta SUPABASE_URL y SUPABASE_ANON_KEY en backend/.env para leer de la base',
      'DATA_LAYER_NOT_CONFIGURED');
  }
  const token = tokenDeSesion(req);
  if (!token) {
    throw httpError(401, 'La peticion no trae el token de Supabase de la sesion', 'UNAUTHENTICATED');
  }
  return clientForToken(token);
}

// Los filtros llegan con el nombre declarado en la lista de arriba. Un parametro que no esta en la
// lista se ignora: no es un ataque bloqueado con ruido, es una columna que el puente nunca va a
// tocar.
function aplicaFiltros(consulta, definicion, query = {}) {
  for (const [parametro, columna] of Object.entries(definicion.filtros ?? {})) {
    const valor = query[parametro];
    if (valor === undefined || valor === '' || typeof valor === 'object') continue;
    const esBooleano = columna === 'vencida' || columna === 'vencido';
    consulta = consulta.eq(columna, esBooleano ? valor === 'true' : valor);
  }
  return consulta;
}

function aplicaOrden(consulta, orden) {
  for (const [columna, direccion] of orden ?? []) {
    consulta = consulta.order(columna, { ascending: direccion !== 'desc', nullsFirst: false });
  }
  return consulta;
}

function aplicaLimite(consulta, req) {
  const limite = Number(req?.query?.limite ?? req?.query?.limit);
  return Number.isInteger(limite) && limite > 0
    ? consulta.limit(Math.min(limite, LIMITE_MAXIMO))
    : consulta;
}

function revisaError(error, contexto) {
  if (!error) return;
  // 42501 es "permission denied" de una politica de fila y 23514 el rechazo de una restriccion de
  // tabla: las dos son reglas del negocio, no fallas tecnicas, y el usuario tiene que leerlas asi.
  // P0001 es el raise de un disparador, que ya trae el texto que la base escribe para el humano.
  // 23505 es una llave duplicada: el detalle tecnico nombra la restriccion interna de Postgres, y
  // eso no va en la pantalla. El codigo igual viaja en la respuesta para poder buscarlo en el log.
  if (error.code === '23505') {
    throw httpError(409, `El valor ya esta registrado en ${contexto}.`, error.code);
  }
  // 22P02 es un valor que no pertenece a la lista admitida (los enum de la base, un uuid mal formado):
  // es un error de entrada, no una falla del sistema, y el texto crudo de Postgres no le sirve a nadie.
  if (error.code === '22P02') {
    throw httpError(400, `El valor enviado no esta entre las opciones que admite ${contexto}.`, error.code);
  }
  const prefijo = error.code === '42501' ? 'La base no deja esta operacion para este usuario: '
    : error.code === '23514' ? 'La base rechazo el valor: '
    : error.code === 'P0001' ? 'La base lo impuso: ' : '';
  const status = error.code === '42501' ? 403
    : error.code === '23514' || error.code === 'P0001' ? 400
    : 502;
  throw httpError(status, `${prefijo}${contexto}: ${error.message}`, error.code ?? 'DB_ERROR');
}

function definicionDe(nombre) {
  if (VISTAS[nombre]) return { ...VISTAS[nombre], destino: VISTAS[nombre].view };
  if (TABLAS[nombre]) return { ...TABLAS[nombre], destino: TABLAS[nombre].table };
  return null;
}

// Lectura de vista o de tabla completa, con los filtros de la peticion.
async function leerLista(req, nombre) {
  const definicion = definicionDe(nombre);
  if (!definicion) {
    throw httpError(500, `La lectura "${nombre}" no esta habilitada en la capa de datos`, 'UNKNOWN_READ');
  }
  let consulta = baseDe(req).from(definicion.destino).select('*');
  consulta = aplicaFiltros(consulta, definicion, req?.query);
  consulta = aplicaOrden(consulta, definicion.orden ?? definicion.lectura);
  consulta = aplicaLimite(consulta, req);
  const { data, error } = await consulta;
  revisaError(error, `lectura de ${definicion.destino}`);
  return data ?? [];
}

// Lectura por una columna concreta: el id de la propia fila, o client_id cuando la pantalla pide el
// bloque de una cuenta.
async function leerHijos(req, nombre, valor, columna = 'id') {
  const definicion = TABLAS[nombre];
  if (!definicion) {
    throw httpError(500, `La tabla "${nombre}" no esta habilitada en la capa de datos`, 'UNKNOWN_READ');
  }
  let consulta = baseDe(req).from(definicion.table).select('*').eq(columna, valor);
  consulta = aplicaOrden(consulta, definicion.lectura);
  consulta = aplicaLimite(consulta, req);
  const { data, error } = await consulta;
  revisaError(error, `lectura de ${definicion.table}`);
  return data ?? [];
}

// Filtra el cuerpo a las columnas declaradas, y nada mas. Un campo que la interfaz invente no llega
// a la base, y uno que la politica no permite lo rechaza la politica con su propio mensaje.
function cuerpoPermitido(definicion, operacion, cuerpo = {}) {
  const permitidas = definicion.escritura?.[operacion] ?? [];
  if (!permitidas.length) {
    throw httpError(405, `La tabla ${definicion.table} no se escribe por este camino: la mantiene la base`,
      'WRITE_NOT_ALLOWED');
  }
  const datos = {};
  for (const columna of permitidas) {
    if (cuerpo[columna] !== undefined) datos[columna] = cuerpo[columna];
  }
  if (!Object.keys(datos).length) {
    throw httpError(400, 'La peticion no trae ninguna columna escribible', 'EMPTY_WRITE');
  }
  return datos;
}

async function crear(req, nombre, cuerpo) {
  const definicion = TABLAS[nombre];
  if (!definicion) {
    throw httpError(500, `La tabla "${nombre}" no existe en la capa de datos`, 'UNKNOWN_WRITE');
  }
  const datos = cuerpoPermitido(definicion, 'insert', cuerpo);
  const { data, error } = await baseDe(req).from(definicion.table).insert(datos).select();
  revisaError(error, `alta en ${definicion.table}`);
  return data?.[0] ?? null;
}

async function editarCon(req, definicion, pares, cuerpo) {
  const datos = cuerpoPermitido(definicion, 'update', cuerpo);
  let consulta = baseDe(req).from(definicion.table).update(datos);
  for (const [columna, valor] of pares) consulta = consulta.eq(columna, valor);
  const { data, error } = await consulta.select();
  revisaError(error, `modificacion de ${definicion.table}`);
  // Cuando la politica de fila no deja la fila, PostgREST no da error: responde 0 filas. Que no se
  // mueva nada tambien es un rechazo, y se dice como tal en lugar de devolver un cuerpo vacio.
  if (!data?.length) {
    throw httpError(403,
      `La base no modifico ninguna fila de ${definicion.table}: no existe, o el rol del usuario no alcanza`,
      'WRITE_REJECTED');
  }
  return data[0];
}

async function editar(req, nombre, id, cuerpo) {
  const definicion = TABLAS[nombre];
  if (!definicion) {
    throw httpError(500, `La tabla "${nombre}" no existe en la capa de datos`, 'UNKNOWN_WRITE');
  }
  return editarCon(req, definicion, [['id', id]], cuerpo);
}

// La casilla de un requisito no tiene id: su llave es el par (client_id, requirement_code), que es
// lo unico que la pantalla tiene a mano cuando revisa un renglon del legajo.
async function editarCasilla(req, clientId, code, cuerpo) {
  return editarCon(req, TABLAS.casillas, [['client_id', clientId], ['requirement_code', code]], cuerpo);
}

// La exencion: aprobar una casilla que pide documento, potestad de administracion y
// cumplimiento solo. La base revisa el rol, el motivo y escribe el asiento de auditoria en la
// misma transaccion.
async function exentarCasilla(req, clientId, code, cuerpo) {
  const detalle = typeof cuerpo.detail === 'string' ? cuerpo.detail.trim() : '';
  if (detalle.length < 3) {
    throw httpError(400, 'La exencion exige el motivo por escrito', 'EXEMPTION_NEEDS_REASON');
  }
  const { data, error } = await baseDe(req)
    .rpc('aprobar_casilla_con_exencion', {
      p_client_id: clientId,
      p_requirement_code: code,
      p_detail: detalle,
    });
  revisaError(error, `exencion de casilla ${code}`);
  return Array.isArray(data) ? data[0] : data;
}

// Un mensaje saliente necesita el canal del hilo: el disparador de 0002 rechaza un mensaje cuyo
// canal no coincide con el de la conversacion, asi que preguntarlo antes ahorra un error que ya
// estaba escrito. Y si el hilo no es visible para este usuario, se corta aqui en lugar de escribir.
async function responder(req, conversationId, cuerpo = {}) {
  const texto = typeof cuerpo.body === 'string' ? cuerpo.body.trim() : '';
  if (!texto) throw httpError(400, 'El mensaje no tiene cuerpo', 'EMPTY_BODY');
  const [hiloVisible] = await leerHijos(req, 'hilos', conversationId, 'id');
  if (!hiloVisible) {
    throw httpError(404, 'La conversacion no existe o no esta visible para este usuario',
      'CONVERSATION_NOT_FOUND');
  }
  if (['resuelta', 'cerrada', 'archivada'].includes(hiloVisible.status)) {
    throw httpError(409, `La conversacion esta ${hiloVisible.status}: hay que reabrirla antes de responder`,
      'CONVERSATION_CLOSED');
  }
  return crear(req, 'mensajes', {
    conversation_id: conversationId,
    direction: 'saliente',
    channel: hiloVisible.channel,
    body: texto,
    template_id: cuerpo.template_id ?? null,
    // 'en_cola' porque el conector de canal todavia no existe (F-25, F-26): el CRM deja escrito lo
    // que quiso mandar y la bandeja de salida muestra lo que falta. Marcarlo 'enviado' seria mentir
    // sobre una entrega que nadie confirmo.
    status: 'en_cola',
    sent_by: req.user?.id ?? null,
    sender_label: req.user?.email ?? null,
  });
}

// El archivador (paso 1 de la entrada). No es un alta generica de mensajes: la funcion decide
// quien es el cliente por su numero o su correo, abre el hilo que falte y aplica la regla de
// enrutamiento que ya vive en la base. El puente solo pasa el token del usuario que anota.
async function anotarEntrada(req, cuerpo = {}) {
  return ingesta.archivarEntrante(req, cuerpo);
}

// El hilo completo: la conversacion y sus mensajes en orden cronologico.
async function hilo(req, conversationId) {
  const [conversacion] = await leerHijos(req, 'hilos', conversationId, 'id');
  if (!conversacion) return null;
  const mensajes = await leerHijos(req, 'mensajes', conversationId, 'conversation_id');
  return { conversacion, mensajes };
}

// La ruta con su historial. Los asientos los escribe unicamente la base; desde aqui se leen.
async function ruta(req, id) {
  const [cabecera] = await leerHijos(req, 'rutas', id, 'id');
  if (!cabecera) return null;
  const asientos = await leerHijos(req, 'asientosRuta', id, 'route_id');
  return { ruta: cabecera, asientos };
}

// La Ficha 360 es un armado de lecturas, no una vista: cada bloque sale de su tabla y la pantalla
// los muestra juntos. Una cuenta con sus nueve bloques es lo que un agente lee antes de responder.
async function ficha(req, clientId) {
  const [cuenta] = await leerHijos(req, 'cuentas', clientId, 'id');
  if (!cuenta) return null;
  const [contactos, casillas, documentos, rutas, hilos, senales, cotejos, reclamos, registro] =
    await Promise.all([
      leerHijos(req, 'contactos', clientId, 'client_id'),
      leerHijos(req, 'casillas', clientId, 'client_id'),
      leerHijos(req, 'documentos', clientId, 'client_id'),
      leerHijos(req, 'rutas', clientId, 'client_id'),
      leerHijos(req, 'hilos', clientId, 'client_id'),
      leerHijos(req, 'senales', clientId, 'client_id'),
      leerHijos(req, 'cotejos', clientId, 'client_id'),
      leerHijos(req, 'reclamos', clientId, 'client_id'),
      leerHijos(req, 'registro', clientId, 'entity_id'),
    ]);
  return { cuenta, contactos, casillas, documentos, rutas, hilos, senales, cotejos, reclamos, registro };
}

// La nota interna del hilo: lo que el equipo deja escrito para si mismo. Va por el mismo
// archivador que la entrada del cliente, con el canal 'interno', para que la pantalla no tenga
// dos caminos que se puedan desincronizar.
async function anotarNota(req, conversationId, cuerpo = {}) {
  return ingesta.archivarNotaInterna(req, conversationId, cuerpo);
}

export const repository = Object.freeze({
  vistas: Object.freeze(Object.keys(VISTAS)),
  tablas: Object.freeze(Object.keys(TABLAS)),
  configured: isScopedReadConfigured,
  leerLista,
  leerHijos,
  crear,
  editar,
  responder,
  anotarEntrada,
  anotarNota,
  hilo,
  ruta,
  ficha,
  editarCasilla,
  exentarCasilla,
});
