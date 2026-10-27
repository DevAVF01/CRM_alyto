import { clientForToken, isScopedReadConfigured } from '../config/supabase.js';

// Las cuatro vistas que ya fueron verificadas fila por fila contra la base real el 26/10.
// El orden coincide con el que cada vista trae de fabrica; se repite aca porque el orden
// interno de una vista no es una garantia que PostgreSQL transmita a quien la consulta.
const LECTURAS = Object.freeze({
  inbox: { view: 'vw_inbox', order: 'last_message_at', ascending: false, nullsFirst: false },
  conversacionesSla: { view: 'vw_conversations_sla', order: 'horas_habiles_sin_atencion', ascending: false, nullsFirst: false },
  cadenciaPendiente: { view: 'vw_cadence_pending', order: 'scheduled_for', ascending: true, nullsFirst: false },
  reclamosSla: { view: 'vw_claims_sla', order: 'due_at', ascending: true, nullsFirst: false },
});

const LIMITE_MAXIMO = 200;

function httpError(status, message, code) {
  const err = new Error(message);
  err.status = status;
  err.expose = true;
  err.code = code ?? 'BAD_REQUEST';
  return err;
}

// El token viaja en la misma cabecera que ya valido la peticion, de modo que lo que se lee
// es exactamente lo que ese usuario puede ver.
function tokenDeSesion(req) {
  const header = req?.headers?.authorization ?? '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : null;
}

async function leerVista(req, nombre) {
  const lectura = LECTURAS[nombre];
  if (!lectura) {
    throw httpError(500, `La lectura "${nombre}" no esta habilitada en la capa de datos`, 'UNKNOWN_READ');
  }
  if (!isScopedReadConfigured()) {
    throw httpError(
      503,
      'Hace falta SUPABASE_URL y SUPABASE_ANON_KEY en backend/.env para leer de la base',
      'DATA_LAYER_NOT_CONFIGURED',
    );
  }

  const token = tokenDeSesion(req);
  if (!token) {
    throw httpError(401, 'La peticion no trae el token de Supabase de la sesion', 'UNAUTHENTICATED');
  }

  let consulta = clientForToken(token)
    .from(lectura.view)
    .select('*')
    .order(lectura.order, { ascending: lectura.ascending, nullsFirst: lectura.nullsFirst });

  const limite = Number(req?.query?.limit);
  if (Number.isInteger(limite) && limite > 0) {
    consulta = consulta.limit(Math.min(limite, LIMITE_MAXIMO));
  }

  const { data, error } = await consulta;
  if (error) {
    throw httpError(
      502,
      `La base rechazo la lectura de ${lectura.view}: ${error.message}. ` +
        'Si el backend esta en modo demostracion, el token propio de la sesion no es un token de Supabase.',
      error.code ?? 'DB_READ_FAILED',
    );
  }
  return data ?? [];
}

export const repository = Object.freeze({
  lecturas: Object.freeze(Object.keys(LECTURAS)),
  configured: isScopedReadConfigured,
  inbox: (req) => leerVista(req, 'inbox'),
  conversacionesSla: (req) => leerVista(req, 'conversacionesSla'),
  cadenciaPendiente: (req) => leerVista(req, 'cadenciaPendiente'),
  reclamosSla: (req) => leerVista(req, 'reclamosSla'),
});
