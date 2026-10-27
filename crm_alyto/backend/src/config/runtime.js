import { isScopedReadConfigured, isSupabaseConfigured } from './supabase.js';

function isTruthy(value) {
  return String(value ?? '').trim().toLowerCase() === 'true';
}

export const demoMode = () => isTruthy(process.env.DEMO_MODE);

export const authLayer = () => (isSupabaseConfigured ? 'supabase' : demoMode() ? 'demo-firmado' : 'no disponible');

export const dataLayer = () => {
  if (isScopedReadConfigured()) return demoMode() ? 'supabase (vistas) y memoria' : 'supabase (vistas)';
  if (isSupabaseConfigured) return 'supabase sin SUPABASE_ANON_KEY';
  return demoMode() ? 'memoria' : 'no disponible';
};

export const storeAllowed = () => demoMode();

export function runtimeStatus() {
  return {
    demoMode: demoMode(),
    supabaseConfigured: isSupabaseConfigured,
    authLayer: authLayer(),
    dataLayer: dataLayer(),
    scopedRead: isScopedReadConfigured(),
  };
}

export function assertBootConfiguration() {
  if (!isSupabaseConfigured && !demoMode()) {
    throw new Error(
      'El backend no puede arrancar: no hay credenciales de Supabase y DEMO_MODE no es true. ' +
        'Escriba SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY, o ponga DEMO_MODE=true en .env para operar con el almacen de demostracion. ' +
        'Si las credenciales estan mal escritas el proceso se detiene aqui y no abre el CRM en silencio.',
    );
  }
  if (demoMode()) {
    const secret = process.env.AUTH_SECRET;
    if (typeof secret !== 'string' || secret.trim().length < 32) {
      throw new Error(
        `DEMO_MODE=true pero AUTH_SECRET falta o mide menos de 32 caracteres. Genere uno con: node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`,
      );
    }
    const password = process.env.DEMO_PASSWORD;
    if (typeof password !== 'string' || password.length < 8) {
      throw new Error('DEMO_MODE=true pero DEMO_PASSWORD falta o tiene menos de 8 caracteres.');
    }
  }
  // Con Supabase montado hace falta tambien la llave publica: el inicio de sesion lee el rol de
  // profiles con el token del usuario, y las lecturas de la bandeja van por el mismo camino. Sin
  // esa llave el CRM abriria y responderia error pedido a pedido; es mejor detenerlo aqui.
  if (isSupabaseConfigured && !isScopedReadConfigured()) {
    throw new Error(
      'El backend tiene SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY pero le falta SUPABASE_ANON_KEY. ' +
        'Sin la llave publica no se puede leer el rol del perfil ni consultar las vistas con el token de cada usuario. ' +
        'Complete la variable en backend/.env, o deje vacias las dos credenciales de Supabase y opere con DEMO_MODE=true.',
    );
  }
  return runtimeStatus();
}
