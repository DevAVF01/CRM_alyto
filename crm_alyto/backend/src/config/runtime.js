import { isSupabaseConfigured } from './supabase.js';

function isTruthy(value) {
  return String(value ?? '').trim().toLowerCase() === 'true';
}

export const demoMode = () => isTruthy(process.env.DEMO_MODE);

export const authLayer = () => (isSupabaseConfigured ? 'supabase' : demoMode() ? 'demo-firmado' : 'no disponible');

export const dataLayer = () => (demoMode() ? 'memoria' : isSupabaseConfigured ? 'capa de repositorio pendiente' : 'no disponible');

export const storeAllowed = () => demoMode();

export function runtimeStatus() {
  return {
    demoMode: demoMode(),
    supabaseConfigured: isSupabaseConfigured,
    authLayer: authLayer(),
    dataLayer: dataLayer(),
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
  return runtimeStatus();
}
