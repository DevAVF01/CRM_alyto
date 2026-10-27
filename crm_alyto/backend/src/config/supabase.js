import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY;

export const supabase = url && serviceRoleKey
  ? createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

export const isSupabaseConfigured = Boolean(supabase);

// La llave de servicio esquiva la seguridad a nivel de fila, asi que solo se usa para entrar
// y para las tareas de administracion. Leer la bandeja de un agente va por otro camino.
export const isScopedReadConfigured = () => Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);

// Un cliente nuevo por peticion, con el token que Supabase le emitio a ese usuario: es lo que
// hace que las politicas se evaluen sobre quien mira y no sobre el dueno de la base.
export function clientForToken(accessToken) {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
