import { clientForToken, isScopedReadConfigured } from '../config/supabase.js';

// El archivador (paso 1 de la entrada de mensajes).
//
// Recibe un mensaje que alguien esta anotando a mano —"el cliente escribio esto por WhatsApp"— y
// hace lo que haria un conector real: averigua quien es el cliente por su telefono o su correo,
// abre o retoma el hilo del canal, deja el mensaje adentro y lo encola en la regla de enrutamiento
// que ya existe en la base. No inventa datos del cliente: si no lo conoce, necesita un nombre para
// crear la ficha minima.
//
// Tres decisiones de diseno:
//
//   1. El telefono se normaliza antes de preguntar. Un numero escrito como "+591 7-123456",
//      "5917123456" o "7123456" son la misma persona, y la base guarda E.164 (el formato
//      internacional: signo mas, codigo de pais, numero, sin espacios). Sin esta normalizacion el
//      archivador crearia un cliente nuevo por cada forma distinta de teclear el mismo numero.
//   2. Todo se escribe con el token del usuario que anota, nunca con la llave de servicio. Lo que
//      la politica de fila no deja, no entra: el archivador no tiene privilegios propios.
//   3. La idempotencia se busca antes de escribir. La base ya tiene un indice unico sobre
//      (channel, external_msg_id), asi que un mismo mensaje repetido rebotaria con 409; preguntar
//      primero deja responder con la fila que ya existe, que es lo que un canal espera de un
//      reintento.
//
// El asiento del libro de actas no se escribe aca: el disparador messages_audit_after_insert de
// 0002 lo pone por cada mensaje, entrante o saliente.

const CANALES = ['whatsapp', 'correo', 'chat_app', 'web_chat', 'linkedin', 'meta', 'tiktok',
  'formulario', 'telefonica', 'interno'];

// El motivo decide la cola y la urgencia, y es una lista cerrada: la base rechaza cualquier otro
// texto con su codigo 22P02 y el puente lo traduce a 400.
const MOTIVOS = ['soporte_tecnico', 'registro_kyc', 'empresa_b2b', 'reclamo', 'consulta_saldo', 'otro'];

// clients.origin es otra lista cerrada, y no coincide nombre por nombre con el canal: ahi se anota
// de donde entro la ficha, no por que via habla el cliente.
const ORIGEN_POR_CANAL = {
  whatsapp: 'whatsapp_business',
  correo: 'correo',
  chat_app: 'chat_app',
  web_chat: 'web_chat',
  linkedin: 'linkedin',
  meta: 'meta',
  tiktok: 'tiktok',
  formulario: 'manual',
  telefonica: 'manual',
  interno: 'manual',
};

const CODIGO_PAIS = '591';

function httpError(status, message, code) {
  const err = new Error(message);
  err.status = status;
  err.expose = true;
  err.code = code ?? 'BAD_REQUEST';
  return err;
}

function tokenDeSesion(req) {
  const header = req?.headers?.authorization ?? '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : null;
}

function baseDe(req) {
  if (!isScopedReadConfigured()) {
    throw httpError(503,
      'Hace falta SUPABASE_URL y SUPABASE_ANON_KEY en backend/.env para archivar un mensaje',
      'DATA_LAYER_NOT_CONFIGURED');
  }
  const token = tokenDeSesion(req);
  if (!token) {
    throw httpError(401, 'La peticion no trae el token de Supabase de la sesion', 'UNAUTHENTICATED');
  }
  return clientForToken(token);
}

function revisaError(error, contexto) {
  if (!error) return;
  const status = error.code === '42501' ? 403
    : error.code === '23514' || error.code === 'P0001' || error.code === '22P02' ? 400
    : error.code === '23505' ? 409
    : 502;
  const prefijo = error.code === '42501' ? 'La base no deja esta operacion para este usuario: '
    : error.code === '23514' || error.code === '22P02' ? 'La base rechazo el valor: '
    : error.code === 'P0001' ? 'La base lo impuso: '
    : error.code === '23505' ? 'Ese valor ya estaba registrado en ' : '';
  throw httpError(status, `${prefijo}${contexto}: ${error.message}`, error.code ?? 'DB_ERROR');
}

// ------------------------------------------------------------------------------ normalizacion

// Deja el numero en E.164 con el codigo de pais de la empresa. Un numero fijo o ya internacional
// pasa tal cual; lo que empieza en 0 (trunk prefix de muchas marcaciones) se limpia primero.
export function normalizaTelefono(texto) {
  const crudo = String(texto ?? '').trim();
  if (!crudo) return null;
  const tieneMas = crudo.startsWith('+');
  const digitos = crudo.replace(/[^\d]/g, '');
  if (digitos.length < 7 || digitos.length > 15) return null;
  if (tieneMas) return `+${digitos}`;
  if (digitos.startsWith('00')) return `+${digitos.slice(2)}`;
  if (digitos.startsWith(CODIGO_PAIS) && digitos.length >= 11) return `+${digitos}`;
  return `+${CODIGO_PAIS}${digitos.replace(/^0+/, '')}`;
}

export function normalizaCorreo(texto) {
  const limpio = String(texto ?? '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(limpio) ? limpio : null;
}

// El identificador con el que se busca al cliente: correo si lo hay, si no telefono normalizado.
// Cuando llegan los dos escritos, el telefono no se tira: queda como respaldo. Si el correo no esta
// en la base pero el numero si, el mensaje se archiva en la cuenta del numero. Crear una ficha nueva
// mientras existia otra con ese telefono es el peor resultado posible del archivador: dos fichas del
// mismo cliente, cada una con su legajo y su mitad de la historia.
export function identificador({ correo, telefono }) {
  const mail = normalizaCorreo(correo);
  const tel = normalizaTelefono(telefono);
  if (mail) {
    return {
      columna: 'email',
      valor: mail,
      respaldo: tel ? { columna: 'phone_e164', valor: tel } : null,
    };
  }
  if (tel) return { columna: 'phone_e164', valor: tel, respaldo: null };
  return null;
}

// ------------------------------------------------------------------------------- borrar/crear

// Busca la cuenta por su telefono o su correo. El numero se compara digito contra digito y por
// sufijo, no con una igualdad de texto: en la base real el mismo cliente puede estar guardado como
// "+5917123456", "5917123456" o "7123456", y ninguna de las tres formas vale menos que las otras.
// Se leen las cuentas vivas con numero o correo y se filtra aca: es un escaneo chico (el ECP tiene
// cientos de fichas, no millones) y a cambio no depende de que alguien haya tecleado el signo mas.
async function buscarCuenta(client, columna, valor) {
  const { data: filas, error } = await client.from('clients')
    .select('id, display_name, account_type, phone_e164, email, origin, kyc_estado')
    .is('deleted_at', null)
    .limit(2000);
  revisaError(error, 'busqueda del cliente por su numero o correo');

  const candidatos = (filas ?? []).filter((c) => {
    if (columna === 'email') return String(c.email ?? '').trim().toLowerCase() === valor;
    const guardado = String(c.phone_e164 ?? '').replace(/\D/g, '');
    if (!guardado) return false;
    const buscado = valor.replace(/\D/g, '');
    return guardado === buscado || guardado.endsWith(buscado) || buscado.endsWith(guardado);
  });

  if (candidatos.length === 1) return candidatos[0];
  if (candidatos.length > 1) {
    throw httpError(409,
      `Hay mas de una cuenta con ese numero: ${candidatos.map((c) => c.display_name).join(', ')}. ` +
      'Anotalo con el codigo de pais (+591) o elegi la cuenta a mano desde Cuentas.',
      'IDENTIFIER_AMBIGUOUS');
  }
  return null;
}

// La ficha minima que permite hablar: nombre, canal de contacto y origen. Los datos de la ficha del
// ECP (KYC, riesgo, topes) quedan en su estado inicial y los mueve cumplimiento por su pantalla: el
// archivador no declara nada sobre una persona que todavia no fue verificada.
async function crearCuenta(client, { nombre, ident, canal }) {
  const fila = {
    account_type: 'persona_natural',
    display_name: nombre,
    origin: ORIGEN_POR_CANAL[canal] ?? 'manual',
  };
  if (ident.columna === 'email') {
    fila.email = ident.valor;
    // El numero escrito en el mismo formulario no se descarta: la ficha nace con los dos datos de
    // contacto, que es lo que el operador vio llegar.
    if (ident.respaldo) fila.phone_e164 = ident.respaldo.valor;
  } else {
    fila.phone_e164 = ident.valor;
  }

  const { data, error } = await client.from('clients').insert(fila)
    .select('id, display_name, account_type, phone_e164, email, origin, kyc_estado')
    .single();
  revisaError(error, `alta de la cuenta ${nombre}`);
  return data;
}

async function buscarContacto(client, clientId, ident) {
  const { data, error } = await client.from('contacts')
    .select('id, full_name, phone_e164, email')
    .eq('client_id', clientId)
    .eq(ident.columna, ident.valor)
    .is('deleted_at', null)
    .limit(1);
  revisaError(error, 'busqueda del contacto');
  return data?.[0] ?? null;
}

// El interlocutor del hilo. La base exige un nombre y no permite dos contactos con el mismo nombre
// en una cuenta, asi que un numero o correo repetido no duplica la agenda.
async function crearContacto(client, clientId, { nombre, ident }) {
  const fila = { client_id: clientId, full_name: nombre };
  if (ident.columna === 'email') fila.email = ident.valor;
  else fila.phone_e164 = ident.valor;

  const { data, error } = await client.from('contacts').insert(fila)
    .select('id, full_name, phone_e164, email')
    .single();
  if (error?.code === '23505') return null;
  revisaError(error, 'alta del contacto');
  return data;
}

// ---------------------------------------------------------------------------- encolamiento

// La regla de enrutamiento de la base: a que cola va cada motivo, con que prioridad. Si alguien la
// borra, el hilo igual entra: se queda en la bandeja general con urgencia media y el archivador
// avisa que la regla falta, en lugar de reventar por un dato de configuracion.
async function reglaDe(client, motivo) {
  const { data, error } = await client.from('routing_rules')
    .select('queue, priority')
    .eq('query_category', motivo)
    .eq('is_active', true)
    .maybeSingle();
  revisaError(error, `lectura de la regla de enrutamiento de ${motivo}`);
  return data ?? { queue: 'Bandeja general', priority: 4 };
}

// El dueno del hilo, por su correo. Es la unica forma de asignar en el archivador y la politica
// conversations_update de 0004 obliga a usarla: un hilo sin dueno solo lo pueden mover administracion
// y cumplimiento, asi que el agente que anota la entrada tiene que poner su propio nombre si quiere
// que el hilo quede a su cargo.
async function duenoPorCorreo(client, correo) {
  const limpio = String(correo ?? '').trim().toLowerCase();
  const { data, error } = await client.from('profiles')
    .select('id, email, display_name, role, is_active')
    .eq('email', limpio)
    .maybeSingle();
  if (error && error.code !== 'PGRST116') revisaError(error, 'busqueda del dueno del hilo');
  const perfil = data ?? null;
  if (perfil && !perfil.is_active) {
    throw httpError(409, `${perfil.email} esta suspendido en el CRM: asigne el hilo a una cuenta activa.`,
      'ASSIGNEE_SUSPENDED');
  }
  return perfil;
}

// El indice unico conversations_thread_idx abre un hilo por (cuenta, canal, id del canal). Sin id de
// canal se permite mas de uno, que es el caso del agente que anota dos llamados distintos.
async function buscarHilo(client, clientId, canal, channelConvId) {
  let consulta = client.from('conversations')
    .select('id, client_id, channel, channel_conv_id, status, queue, priority, query_category, subject, assignee_id')
    .eq('client_id', clientId)
    .eq('channel', canal)
    .is('deleted_at', null);
  consulta = channelConvId ? consulta.eq('channel_conv_id', channelConvId) : consulta.is('channel_conv_id', null);
  const { data, error } = await consulta.order('last_message_at', { ascending: false }).limit(1);
  revisaError(error, 'busqueda del hilo abierto');
  return data?.[0] ?? null;
}

async function abrirHilo(client, clientId, contactoId, canal, channelConvId, asunto, regla, motivo, duenoId) {
  const { data, error } = await client.from('conversations').insert({
    client_id: clientId,
    contact_id: contactoId ?? null,
    channel: canal,
    channel_conv_id: channelConvId ?? null,
    subject: asunto ?? null,
    query_category: motivo,
    queue: regla.queue,
    priority: regla.priority,
    assignee_id: duenoId ?? null,
  }).select('id, client_id, channel, channel_conv_id, status, queue, priority, query_category, subject, assignee_id')
    .single();
  revisaError(error, 'apertura del hilo');
  return data;
}

async function mensajeExistente(client, canal, externalMsgId) {
  const { data, error } = await client.from('messages')
    .select('id, conversation_id, sent_at, status')
    .eq('channel', canal)
    .eq('external_msg_id', externalMsgId)
    .maybeSingle();
  if (error && error.code !== 'PGRST116') revisaError(error, 'chequeo de mensaje repetido');
  return data ?? null;
}

// ------------------------------------------------------------------------------ la entrada

// El cuerpo minimo que admite el archivador. Los recortes de longitud son los de la base: un mensaje
// de mas de 8000 caracteres la base lo rechaza igual, y es mejor decirlo antes de ir a la puerta.
function revisaPedido(cuerpo = {}) {
  const canal = String(cuerpo.channel ?? '').trim();
  if (!CANALES.includes(canal)) {
    throw httpError(400,
      `El canal "${canal || '(vacio)'}" no esta entre los que admite la base: ${CANALES.join(', ')}.`,
      'INVALID_CHANNEL');
  }
  const motivo = String(cuerpo.query_category ?? 'otro').trim();
  if (!MOTIVOS.includes(motivo)) {
    throw httpError(400,
      `El motivo "${motivo}" no esta entre los que admite la base: ${MOTIVOS.join(', ')}.`,
      'INVALID_CATEGORY');
  }
  const texto = typeof cuerpo.body === 'string' ? cuerpo.body.trim() : '';
  if (texto.length < 1) throw httpError(400, 'El mensaje no tiene cuerpo', 'EMPTY_BODY');
  if (texto.length > 8000) {
    throw httpError(400, 'El mensaje pasa los 8000 caracteres que admite la base', 'BODY_TOO_LONG');
  }
  const ident = identificador(cuerpo);
  if (!ident) {
    throw httpError(400,
      'Para archivar un mensaje hace falta el telefono o el correo del cliente, y ninguno de los dos ' +
      'llega con una forma reconocible.',
      'NEEDS_IDENTIFIER');
  }
  const nombre = String(cuerpo.client_name ?? '').trim();
  if (nombre.length > 80) {
    throw httpError(400, 'El nombre del cliente no puede pasar de 80 caracteres', 'NAME_TOO_LONG');
  }
  return { canal, motivo, texto, ident, nombre, asunto: String(cuerpo.subject ?? '').trim() || null };
}

// El ciclo completo. Devuelve el hilo, el mensaje y si hubo que crear la cuenta o abrir el hilo, para
// que la pantalla lo pueda contar sin volver a preguntar.
export async function archivarEntrante(req, cuerpo = {}) {
  const { canal, motivo, texto, ident, nombre, asunto } = revisaPedido(cuerpo);
  const client = baseDe(req);
  const conversacionDeCanal = typeof cuerpo.channel_conv_id === 'string' ? cuerpo.channel_conv_id.trim() : '';

  const externo = typeof cuerpo.external_msg_id === 'string' ? cuerpo.external_msg_id.trim() : '';
  if (externo) {
    const repetido = await mensajeExistente(client, canal, externo);
    if (repetido) {
      return { duplicado: true, mensaje: repetido, avisos: ['Ese mensaje ya estaba archivado por el canal.'] };
    }
  }

  let cuenta = await buscarCuenta(client, ident.columna, ident.valor);
  // El correo del mensaje no esta en la base, pero el numero escrito en el mismo formulario si:
  // el cliente es el del numero. Sin este respaldo se crearia una ficha paralela del mismo cliente.
  let respaldoUsado = false;
  if (!cuenta && ident.respaldo) {
    cuenta = await buscarCuenta(client, ident.respaldo.columna, ident.respaldo.valor);
    respaldoUsado = !!cuenta;
  }
  let creoCuenta = false;
  if (!cuenta) {
    if (nombre.length < 3) {
      throw httpError(400,
        `Ninguna cuenta tiene ese ${ident.columna === 'email' ? 'correo' : 'numero'} y para crearla hace ` +
        'falta el nombre del cliente (minimo 3 letras).',
        'NEEDS_CLIENT_NAME');
    }
    cuenta = await crearCuenta(client, { nombre, ident, canal });
    creoCuenta = true;
  }

  let contacto = await buscarContacto(client, cuenta.id, ident);
  if (!contacto) {
    contacto = await crearContacto(client, cuenta.id, { nombre: nombre || cuenta.display_name, ident });
  }

  const correoDueno = String(cuerpo.dueno_email ?? '').trim();
  const dueno = correoDueno ? await duenoPorCorreo(client, correoDueno) : null;
  if (correoDueno && !dueno) {
    throw httpError(404, `${correoDueno} no esta en el personal del CRM: el hilo no puede quedar a nombre ` +
      'de una cuenta que no existe. Dele el correo de una persona del equipo o dejelo sin dueno.',
      'ASSIGNEE_NOT_FOUND');
  }

  let hilo = await buscarHilo(client, cuenta.id, canal, conversacionDeCanal || null);
  const avisos = [];
  if (respaldoUsado) {
    avisos.push(`El correo ${ident.valor} no estaba en el CRM: el mensaje se archivo en la cuenta de ` +
      `${cuenta.display_name}, que tiene ese telefono. El correo se agrega como contacto de esa ficha.`);
  }
  const abrioHilo = !hilo;
  const regla = await reglaDe(client, motivo);
  if (!hilo) {
    if (motivo !== 'otro' && regla.queue === 'Bandeja general') {
      avisos.push(`No encontre la regla de enrutamiento de "${motivo}": el hilo quedo en Bandeja general.`);
    }
    hilo = await abrirHilo(client, cuenta.id, contacto?.id, canal, conversacionDeCanal || null,
      asunto, regla, motivo, dueno?.id);
    if (dueno) avisos.push(`El hilo quedo a nombre de ${dueno.display_name || dueno.email}.`);
  } else if (dueno && !hilo.assignee_id && dueno.id === req.user?.id) {
    // El dueno solo se pone al nacer el hilo o cuando el agente se lo toma a si mismo: la politica
    // conversations_update no deja que alguien asigne el trabajo de otro si no es administracion.
    const { data: tomado, error: errToma } = await client.from('conversations')
      .update({ assignee_id: dueno.id })
      .eq('id', hilo.id)
      .select('id, client_id, channel, channel_conv_id, status, queue, priority, query_category, subject, assignee_id')
      .maybeSingle();
    if (errToma || !tomado) {
      avisos.push('El hilo seguia sin dueno: la base no permite asignarselo en este momento.');
    } else {
      hilo = tomado;
      avisos.push('El hilo quedo asignado a usted.');
    }
  } else if (dueno && hilo.assignee_id && dueno.id !== hilo.assignee_id) {
    avisos.push('El hilo ya tenia dueno y no se movio: cambiar el cargo de otro es de administracion.');
  }

  // Un hilo que cambia de motivo vuelve a encolarse con la regla nueva: el reclamo que alguien anoto
  // primero como "otro" tiene que terminar en la cola de reclamos. Si la politica de fila no deja
  // moverlo, el mensaje igual entro: se avisa y se sigue, no se deshace el trabajo.
  if (!abrioHilo && hilo.query_category !== motivo) {
    const { data: movido, error: errMueve } = await client.from('conversations')
      .update({ query_category: motivo, queue: regla.queue, priority: regla.priority })
      .eq('id', hilo.id)
      .select('id, client_id, channel, channel_conv_id, status, queue, priority, query_category, subject, assignee_id')
      .maybeSingle();
    if (errMueve || !movido) {
      avisos.push(`El hilo seguio en la cola "${hilo.queue}": la base no deja mover su categoria aqui.`);
    } else {
      hilo = movido;
      avisos.push(`El hilo paso a la cola "${movido.queue}" porque ahora el motivo es ${motivo}.`);
    }
  }

  const { data: mensaje, error: errMensaje } = await client.from('messages').insert({
    conversation_id: hilo.id,
    direction: 'entrante',
    channel: canal,
    body: texto,
    sender_label: String(cuerpo.sender_label ?? '').trim() || nombre || cuenta.display_name,
    external_msg_id: externo || null,
    // 'recibido' es el unico estado honesto de una entrada: nadie confirmo que el cliente lo escribio
    // en un canal que el CRM controle, y la restriccion messages_estado_por_direccion no admite cola.
    status: 'recibido',
    sent_by: req.user?.id ?? null,
  }).select('id, conversation_id, direction, channel, status, sent_at, sender_label')
    .single();
  revisaError(errMensaje, 'archivado del mensaje entrante');

  return {
    duplicado: false,
    hilo,
    mensaje,
    cuenta,
    contacto,
    creoCuenta,
    abrioHilo,
    avisos,
  };
}

// Una nota interna no es un mensaje del cliente: es lo que el equipo deja escrito para si mismo
// mientras atiende el hilo. Por eso NO entra a la tabla messages. La base lo impide con dos trabas
// que son buenas razones:
//
//   - messages_channel_matches_thread (0002): el canal del mensaje tiene que ser el del hilo, asi
//     que una nota con canal 'interno' dentro de un hilo de WhatsApp se rechaza. Y si se escribiera
//     con el canal del hilo, en el historial quedaria como si el cliente hubiera vuelto a escribir.
//   - sync_conversation_counters (0002): todo mensaje entrante mueve last_inbound_at y reactiva un
//     hilo en espera del cliente. Una nota del equipo no es la respuesta de nadie: contaminaria el
//     nivel de servicio del hilo.
//
// El lugar correcto es activities con tipo 'nota': es un registro del trabajo sobre la cuenta, vive
// en la cronologia del cliente y no mueve los contadores del hilo. Nace con done_at puesto porque la
// agenda (vw_open_activities) lista lo que tiene done_at nulo; una nota no es una tarea pendiente.
export async function archivarNotaInterna(req, conversationId, cuerpo = {}) {
  const texto = typeof cuerpo.body === 'string' ? cuerpo.body.trim() : '';
  if (!texto) throw httpError(400, 'La nota no tiene cuerpo', 'EMPTY_BODY');
  const client = baseDe(req);

  const { data: hilo, error: errHilo } = await client.from('conversations')
    .select('id, client_id, channel, status')
    .eq('id', conversationId)
    .is('deleted_at', null)
    .maybeSingle();
  if (errHilo) revisaError(errHilo, 'lectura del hilo');
  if (!hilo) throw httpError(404, 'La conversacion no existe o no esta visible para este usuario', 'CONVERSATION_NOT_FOUND');
  if (['resuelta', 'cerrada'].includes(hilo.status)) {
    throw httpError(409, `La conversacion esta ${hilo.status}: hay que reabrirla antes de dejar una nota`,
      'CONVERSATION_CLOSED');
  }

  // activities.title pide entre 3 y 200 caracteres y es obligatorio: la nota no tiene un titulo
  // propio, asi que se toma su primera linea y, si es demasiado corta, se pone el nombre fijo.
  const primeraLinea = texto.replace(/\s+/g, ' ').slice(0, 160);
  const titulo = primeraLinea.length >= 3 ? primeraLinea : 'Nota interna';

  const { data: nota, error } = await client.from('activities').insert({
    client_id: hilo.client_id,
    conversation_id: hilo.id,
    type: 'nota',
    title: titulo,
    body: texto,
    owner_id: req.user?.id ?? null,
    created_by: req.user?.id ?? null,
    done_at: new Date().toISOString(),
  }).select('id, type, title, body, conversation_id, client_id, owner_id, created_at, done_at')
    .single();
  revisaError(error, 'archivado de la nota interna');
  return { hilo, nota };
}

export const dominioIngesta = Object.freeze({ canales: CANALES, motivos: MOTIVOS, codigoPais: CODIGO_PAIS });
