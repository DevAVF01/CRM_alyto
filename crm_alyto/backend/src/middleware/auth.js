import { createAuth } from 'security-auth';
import { supabase, clientForToken, isScopedReadConfigured } from '../config/supabase.js';
import { demoMode } from '../config/runtime.js';
import { DEMO_ACCOUNTS } from '../data/demoAccounts.js';

export { ROLES, ROLE_LABELS } from 'security-auth';

let instance = null;

// El rol efectivo lo dice la base, no el token: Supabase no escribe app_metadata para las
// cuentas creadas desde el panel, y ahi es donde vive el rol de verdad (tabla profiles).
// current_role_name() se consulta con el token del propio usuario, de modo que la seguridad a
// nivel de fila decide sobre quien mira. Cuesta una ida a la base por peticion: es el precio de
// que requireRole signifique algo.
async function roleFromDatabase(accessToken) {
  if (!isScopedReadConfigured()) {
    const err = new Error(
      'El backend tiene SUPABASE_URL y la llave de servicio pero le falta SUPABASE_ANON_KEY, ' +
        'y sin esa llave no se puede leer el rol del perfil.',
    );
    err.status = 503;
    err.expose = true;
    err.code = 'ROLE_LOOKUP_NOT_CONFIGURED';
    throw err;
  }
  const { data, error } = await clientForToken(accessToken).rpc('current_role_name');
  if (error) return null;
  return data ?? null;
}

// Se construye al primer uso porque createAuth exige AUTH_SECRET y DEMO_PASSWORD cuando
// DEMO_MODE esta activo, y esos valores pueden faltar al importar modulos en pruebas.
function auth() {
  if (!instance) {
    instance = createAuth({
      supabase,
      demoMode: demoMode(),
      demoAccounts: [...DEMO_ACCOUNTS],
      roleResolver: roleFromDatabase,
    });
  }
  return instance;
}

export const signInWithPassword = (input) => auth().signInWithPassword(input);

export const authenticate = (req, res, next) => auth().authenticate(req, res, next);

export const requireRole = (...allowed) => (req, res, next) => auth().requireRole(...allowed)(req, res, next);

export const issueAgentToken = (agent, role) => auth().issueAgentToken(agent, role);
