import { storeAllowed } from '../config/runtime.js';
import { isScopedReadConfigured } from '../config/supabase.js';

// Sin DEMO_MODE activo no se sirve el almacen en memoria. Si ademas falta la capa de
// repositorio, la respuesta correcta es un error visible, no datos de demostracion.
export function requireDataLayer(req, res, next) {
  if (storeAllowed()) return next();
  return res.status(503).json({
    error: {
      code: 'DATA_LAYER_NOT_CONFIGURED',
      message:
        'El backend no tiene capa de datos habilitada para estas rutas antiguas, que todavia leen del almacen en memoria. ' +
        'Los datos de demostracion solo se sirven con DEMO_MODE=true. Las lecturas reales de la base estan bajo /api/messaging.',
    },
  });
}

// Las rutas de mensajeria no tienen version en memoria: o leen de la base con el token del
// usuario, o contestan que falta la configuracion. Nunca devuelven datos inventados.
export function requireScopedRead(req, res, next) {
  if (isScopedReadConfigured()) return next();
  return res.status(503).json({
    error: {
      code: 'DATA_LAYER_NOT_CONFIGURED',
      message:
        'Las lecturas de la base piden SUPABASE_URL y SUPABASE_ANON_KEY en backend/.env, y una sesion abierta con Supabase Auth. ' +
        'El modo demostracion no sirve aqui: sus sesiones no llevan un token que Supabase reconozca.',
    },
  });
}
