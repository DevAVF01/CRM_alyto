import { supabase, clientForToken, isScopedReadConfigured } from '../config/supabase.js';

// Cuentas del personal (F-03). Dos caminos en un solo fichero:
//
//   1. La solicitud: una persona ingresa su correo, su nombre y su contrasena; la cuenta se
//      crea en Auth y el perfil queda 'is_active = false'. No puede hacer nada dentro del CRM
//      (el rol se lee de un perfil activo) y queda visible para el administrador.
//   2. La decision: el administrador acepta (rol + activo) o suspende, y cada movimiento deja
//      su asiento en el registro.
//
// Guardarrailes que sostienen esto:
//   - El rol lo cambia solo admin (politica profiles_write en 0004); aqui el cambio va con el
//     token del propio administrador, no con la llave de servicio.
//   - Nadie se modifica su propia cuenta por esta via: el ultimo admin no se pisa la rama.
//   - Solo correos del dominio corporativo parametrizado se aceptan en la solicitud.
//   - La suspension/el rechazo usa el ban de Auth con la llave de servicio, igual que los
//     scripts: la cuenta deja de poder entrar aunque tuviera sesion viva.

const BAN_100_ANOS = `${100 * 365 * 24 * 3600}s`;

// El token de Supabase viaja en la cabecera que el guardia ya valido; la capa de datos lo toma de
// ahi, igual que hace repository.js.
function tokenDeSesion(req) {
  const header = req?.headers?.authorization ?? '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : null;
}

function httpError(status, message, code) {
  const err = new Error(message);
  err.status = status;
  err.expose = true;
  err.code = code ?? 'BAD_REQUEST';
  return err;
}

function correoValido(texto) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(texto || ''));
}

async function banRest(id, duracion) {
  const cabecera = {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    'content-type': 'application/json',
  };
  const resp = await fetch(`${process.env.SUPABASE_URL}/auth/v1/admin/users/${id}`, {
    method: 'PUT',
    headers: cabecera,
    body: JSON.stringify({ ban_duration: duracion }),
  });
  if (!resp.ok) {
    const texto = await resp.text().catch(() => '');
    throw httpError(502, `El panel de accesos no admitio el cambio de estado de esta cuenta: ${texto.slice(0, 160)}`, 'AUTH_ADMIN_ERROR');
  }
}

// ------------------------------------------------------------------------ listado
export async function listar(req) {
  if (!isScopedReadConfigured()) {
    throw httpError(503, 'Falta la configuracion de lectura (SUPABASE_URL y SUPABASE_ANON_KEY).', 'READ_NOT_CONFIGURED');
  }
  const { data, error } = await clientForToken(tokenDeSesion(req))
    .from('profiles')
    .select('id, email, role, display_name, phone_e164, is_active, created_at, updated_at')
    .order('is_active', { ascending: false })
    .order('display_name', { ascending: true });
  if (error) throw httpError(502, `lectura de personal: ${error.message}`, 'DB_ERROR');
  return (data ?? []).map((p) => ({
    ...p,
    estado: p.is_active ? 'activo' : 'pendiente',
  }));
}

// ------------------------------------------------------------------------ decision del admin
export async function cambiar(req, reqId, cuerpo) {
  if (!supabase) throw httpError(503, 'Sin base configurada para gestionar el personal.', 'DATA_LAYER_NOT_CONFIGURED');

  const usuario = { id: req.user?.id, email: req.user?.email };
  if (!usuario.id) throw httpError(401, 'Sesion sin usuario reconocido', 'UNAUTHENTICATED');
  if (reqId === usuario.id) {
    throw httpError(400, 'No se permite cambiar la propia cuenta desde esta pantalla: congele o promueva a otra persona con otro perfil admin vivo.',
      'SELF_CHANGE_FORBIDDEN');
  }

  // Solo las columnas que la pantalla entiende, y ninguna vacia.
  const cambios = {};
  if (cuerpo.role !== undefined) {
    if (!['admin', 'compliance', 'operaciones', 'ventas', 'soporte'].includes(cuerpo.role)) {
      throw httpError(400, `El rol "${cuerpo.role}" no existe en el CRM.`, 'INVALID_ROLE');
    }
    cambios.role = cuerpo.role;
  }
  if (cuerpo.is_active !== undefined) {
    if (typeof cuerpo.is_active !== 'boolean') throw httpError(400, 'is_active debe ser verdad o falso.', 'INVALID_VALUE');
    cambios.is_active = cuerpo.is_active;
  }
  if (cuerpo.display_name !== undefined) {
    const nombre = String(cuerpo.display_name ?? '').trim();
    if (nombre.length < 3 || nombre.length > 80) {
      throw httpError(400, 'El nombre visible debe tener entre 3 y 80 caracteres.', 'INVALID_VALUE');
    }
    cambios.display_name = nombre;
  }
  if (Object.keys(cambios).length === 0) {
    throw httpError(400, 'No llego nada que cambiar: rol, estado activo o nombre visible.', 'EMPTY_BODY');
  }

  const { data: antes, error: errAntes } = await clientForToken(tokenDeSesion(req))
    .from('profiles')
    .select('id, email, role, display_name, is_active')
    .eq('id', reqId)
    .maybeSingle();
  if (errAntes) throw httpError(502, `lectura previa del perfil: ${errAntes.message}`, 'DB_ERROR');
  if (!antes) throw httpError(404, 'Ese perfil no existe en el CRM.', 'PROFILE_NOT_FOUND');

  // Escribir con el token del admin: la politica profiles_write lo sostiene en la base.
  const { data: despues, error: errUpdate } = await clientForToken(tokenDeSesion(req))
    .from('profiles')
    .update(cambios)
    .eq('id', reqId)
    .select('id, email, role, display_name, is_active, updated_at')
    .single();
  if (errUpdate) throw httpError(502, `El perfil no se actualizo: ${errUpdate.message}`, errUpdate.code ?? 'DB_ERROR');

  // El estado en Auth acompanha al estado del perfil solo donde cambia de verdad el acceso:
  // aceptar o reactivar (se levanta cualquier ban) y suspender una cuenta ACTIVA (ban de 100
  // anos, mismo patron que la suspension del 29/10). Dejar pendiente una cuenta que nunca
  // estuvo activa no banea: la persona puede entrar y leer que su cuenta esta pendiente (403),
  // no que sus credenciales son invalidas.
  try {
    if (cambios.is_active === true) {
      await banRest(reqId, 'none');
    } else if (cambios.is_active === false && antes.is_active === true) {
      await banRest(reqId, BAN_100_ANOS);
    }
  } catch (errBan) {
    // El perfil quedo en el estado pedido; el ban fallo y se cuenta: el admin ve el motivo y
    // puede repetir solo el toque faltante. Nada queda a medias sin avisar.
    throw httpError(502, `El perfil quedo actualizado pero el estado de acceso en Auth no: ${errBan.message}`,
      'AUTH_ADMIN_ERROR');
  }

  let accion = 'cuenta_actualizada';
  if (cambios.is_active === true && antes.is_active === false) accion = 'cuenta_aceptada';
  if (cambios.is_active === false && antes.is_active === true) accion = 'cuenta_suspendida';

  const partes = [`cuenta ${antes.email}`];
  if (cambios.role) partes.push(`rol: ${antes.role} -> ${cambios.role}`);
  if (cambios.is_active !== undefined) partes.push(`activo: ${antes.is_active} -> ${cambios.is_active}`);
  if (cambios.display_name) partes.push(`nombre: ${cambios.display_name}`);

  const { error: errAsiento } = await clientForToken(tokenDeSesion(req)).from('audit_events').insert({
    actor: usuario.email,
    actor_id: usuario.id,
    actor_kind: 'humano',
    action: accion,
    entity_type: 'profiles',
    entity_id: reqId,
    detail: partes.join(' · '),
    outcome: 'exito',
  });
  if (errAsiento) throw httpError(502, `la decision quedo pero el asiento no: ${errAsiento.message}`, 'DB_ERROR');

  return despues;
}

// ------------------------------------------------------------------------ solicitud propia
export async function solicitud(cuerpo) {
  if (!supabase) {
    throw httpError(503, 'Sin base configurada: no se pueden crear cuentas.', 'DATA_LAYER_NOT_CONFIGURED');
  }

  const nombre = String(cuerpo?.display_name ?? '').trim();
  const correo = String(cuerpo?.email ?? '').trim().toLowerCase();
  const contrasena = String(cuerpo?.password ?? '');

  if (nombre.length < 3 || nombre.length > 80) {
    throw httpError(400, 'El nombre visible debe tener entre 3 y 80 caracteres.', 'INVALID_VALUE');
  }
  if (!correoValido(correo)) throw httpError(400, 'El correo no tiene forma de correo.', 'INVALID_EMAIL');

  // El dominio lo dice el parametro del ECP, no el codigo: si Cumplimiento cambia el dominio
  // corporativo en base, esta puerta lo sigue sin tocar nada aca.
  const { data: parametros, error: errParam } = await supabase
    .from('ecp_parameters')
    .select('dominio_corporativo')
    .eq('id', 1)
    .maybeSingle();
  if (errParam) throw httpError(502, `lectura de parametros: ${errParam.message}`, 'DB_ERROR');
  const dominio = parametros?.dominio_corporativo ?? 'avfinance';
  if (!correo.endsWith(`@${dominio}.bo`) && !correo.endsWith(`@${dominio}.net`)) {
    throw httpError(400, `Solo se pueden registrar correos del dominio corporativo (${dominio}.bo o ${dominio}.net): digale al administrador si necesita una excepcion.`,
      'DOMAIN_NOT_ALLOWED');
  }
  if (contrasena.length < 8) {
    throw httpError(400, 'La contrasena necesita al menos 8 caracteres.', 'WEAK_PASSWORD');
  }

  const { data: existente } = await supabase
    .from('profiles')
    .select('id, is_active')
    .eq('email', correo)
    .maybeSingle();
  if (existente) {
    throw httpError(409, 'Ese correo ya esta registrado en el CRM. Si no puede entrar, pida al administrador que revise su cuenta.',
      'EMAIL_TAKEN');
  }

  // La contrasena del solicitante nunca va al log: solo el id y el correo de la cuenta creada.
  const { data: cuenta, error: errCreate } = await supabase.auth.admin.createUser({
    email: correo,
    password: contrasena,
    email_confirm: true,
    user_metadata: { display_name: nombre },
    app_metadata: { role: 'soporte' },
  });
  if (errCreate) {
    throw httpError(502, `La cuenta no se pudo crear en el panel de accesos: ${errCreate.message}`, 'AUTH_ADMIN_ERROR');
  }

  // Pendiente desde el segundo uno: is_active false. Si este paso fallara, siguiendo la regla
  // de fallar hacia cerrado, se deja el usuario banneado para que no alcance nada mientras
  // el administrador lo decide a mano.
  try {
    const { error: errPerfil } = await supabase
      .from('profiles')
      .update({ is_active: false, display_name: nombre })
      .eq('id', cuenta.user.id);
    if (errPerfil) throw new Error(errPerfil.message);
  } catch (errPerfil) {
    await banRest(cuenta.user.id, BAN_100_ANOS);
    throw httpError(502, `La cuenta se creo en el panel de accesos pero quedo con su perfil a medias; quedo suspendida. El administrador debe consolidarla a mano: ${errPerfil.message}`,
      'PARTIAL_SIGNUP');
  }

  const { error: errAsiento } = await supabase.from('audit_events').insert({
    actor: 'Solicitud de registro',
    actor_id: null,
    actor_kind: 'sistema',
    action: 'solicitud_cuenta',
    entity_type: 'profiles',
    entity_id: cuenta.user.id,
    detail: `${nombre} · ${correo}: la cuenta quedo pendiente de aceptacion por el administrador.`,
    outcome: 'exito',
  });
  if (errAsiento) throw httpError(502, `La solicitud quedo pero su asiento no se escribio: ${errAsiento.message}`, 'DB_ERROR');

  return {
    id: cuenta.user.id,
    email: correo,
    display_name: nombre,
    estado: 'pendiente',
    mensaje: 'Cuenta solicitada: el administrador la revisa. Cuando la acepte, entre con su correo y contrasena.',
  };
}
